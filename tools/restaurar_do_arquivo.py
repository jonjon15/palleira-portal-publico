#!/usr/bin/env python3
"""
Devolve a base de um jogador a partir do ARQUIVO no banco — não do
`backup/world` do servidor.

Existe porque a rede de segurança do host é curta: 10 cópias cobrindo 24 h
(medido em 06/09/2026). Quem perde a base na sexta e só percebe no domingo
não tem de onde recuperar. O `arquivar_bases.py` guarda o recorte de cada
base todo dia; aqui ele volta.

Duas diferenças em relação ao `restaurar_base.py`:

  1. **A fonte é o blob**, não um `Level.sav` inteiro. O pacote é remontado
     como um "mundo" com só as seções que ele carrega, e daí as mesmas
     funções de cópia da restauração normal fazem o trabalho — nada aqui
     reinventa o que já foi testado em produção.
  2. **Dá para mudar a base de lugar.** Se o terreno original está ocupado, o
     jogador escolhe o destino sendo a própria posição dele no jogo, e o
     delta é somado na base e em cada peça.

⚠️ Rodar com o servidor PARADO.

Uso:
    python tools/restaurar_do_arquivo.py --servidor pve-free --uid 21F2… --simular
    python tools/restaurar_do_arquivo.py --servidor pve-free --uid 21F2… \\
        --destino -210717,83756,4472 --aplicar
"""

from __future__ import annotations

import argparse
import gzip
import math
import os
import pickle
import sys
import time

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from restaurar_base import (  # noqa: E402
    NEEDED_SECTIONS, ZERO_UID, _abortar, agora_na_escala_do_save, apagar,
    baixar, base_camp_por_id, copiar_dependencias, dig, enviar,
    fechar_referencias, guid_zero, guild_do_jogador, indices, info_arquivo,
    instance_ids_presentes, lista_mutavel, map_object_list_ref, norm_uid,
    renomear, sanear_slots, scalar, servidores, work_entries, works_da_base,
    zerar_refs_perdidas,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

# Distância mínima entre o centro de duas bases. Cada base ocupa `area_range`
# (3500 nas 20 medidas do pve-free), então dois raios encostam exatamente em
# 7000 — a folga evita entregar uma base colada na do vizinho.
FOLGA_ENTRE_BASES = 1.25


def pacote_do_banco(conn, slug: str, uid: str, snapshot_id: int | None):
    """O snapshot a restaurar: o pedido explícito, ou o melhor da pessoa.

    "Melhor" é o de mais peças, não o mais recente: se a base foi esvaziada
    antes de sumir, o último snapshot é justamente o que ninguém quer de
    volta.
    """
    with conn.cursor() as cur:
        if snapshot_id:
            cur.execute(
                """
                select id, base_id, guild_name, world_x, world_y, world_z,
                       area_range, piece_count, blob, formato, taken_at
                from base_snapshots where id = %s and server_slug = %s
                """,
                (snapshot_id, slug),
            )
        else:
            cur.execute(
                """
                select id, base_id, guild_name, world_x, world_y, world_z,
                       area_range, piece_count, blob, formato, taken_at
                from base_snapshots
                where server_slug = %s and %s = any(member_uids)
                order by piece_count desc, taken_at desc
                limit 1
                """,
                (slug, uid),
            )
        return cur.fetchone()


def mundo_do_pacote(pacote: dict) -> dict:
    """Um "world" com só as seções do pacote.

    As funções de restauração leem o backup por seção (`base_camp_entries`,
    `map_object_entries`, `secao_por_id`…), então basta entregar as listas nos
    lugares certos: o motor não sabe — nem precisa saber — que isto veio de um
    blob e não de um `Level.sav`.
    """
    fecho = pacote.get("fecho", {}) or {}
    mundo: dict = {
        "BaseCampSaveData": {"value": [pacote["base"]]},
        "MapObjectSaveData": {"value": {"values": list(pacote["pecas"])}},
    }
    for secao in ("WorkSaveData", "ItemContainerSaveData",
                  "CharacterContainerSaveData", "DynamicItemSaveData",
                  "CharacterSaveParameterMap"):
        itens = fecho.get(secao) or []
        if secao in ("WorkSaveData", "DynamicItemSaveData"):
            mundo[secao] = {"value": {"values": list(itens)}}
        else:
            mundo[secao] = {"value": list(itens)}
    return mundo


# ------------------------------------------------------------- deslocamento

def translacoes(no, prof: int = 10) -> list[dict]:
    """Todo dict `translation` abaixo deste nó."""
    achados: list[dict] = []
    if prof <= 0:
        return achados
    if isinstance(no, dict):
        for chave, valor in no.items():
            if (chave == "translation" and isinstance(valor, dict)
                    and {"x", "y", "z"} <= set(valor)):
                achados.append(valor)
            else:
                achados += translacoes(valor, prof - 1)
    elif isinstance(no, list):
        for item in no[:200]:
            achados += translacoes(item, prof - 1)
    return achados


def mover(entradas: list, origem: tuple, delta: tuple, raio: float) -> tuple[int, int]:
    """Soma o delta em toda posição de MUNDO, e só nelas.

    A base carrega translações que **não** são posição no mundo — o
    `fast_travel_local_transform` é local ao acampamento, e somar delta nele
    jogaria o ponto de viagem para o outro lado do mapa. O que separa as duas
    é a distância ao centro original: peça de base mora dentro do
    `area_range`, coordenada local mora perto de zero, e o centro das bases
    fica a centenas de milhares de unidades da origem do mundo.

    Devolve (movidas, ignoradas) — se a média por peça não der ~1, é sinal de
    que a heurística pegou algo que não devia, e o relatório mostra isso antes
    de qualquer gravação.
    """
    limite = raio * 2.5
    movidas = ignoradas = 0
    for entrada in entradas:
        for t in translacoes(entrada):
            try:
                x = float(scalar(t["x"], 0) or 0)
                y = float(scalar(t["y"], 0) or 0)
            except (TypeError, ValueError):
                ignoradas += 1
                continue
            if math.dist((x, y), origem[:2]) > limite:
                ignoradas += 1
                continue
            t["x"] = x + delta[0]
            t["y"] = y + delta[1]
            t["z"] = float(scalar(t["z"], 0) or 0) + delta[2]
            movidas += 1
    return movidas, ignoradas


def bases_por_perto(world, ponto: tuple, raio_novo: float) -> list[tuple[str, float]]:
    """Bases cujo território encostaria no destino."""
    perto = []
    for bid, entrada in base_camp_por_id(world).items():
        raw = dig(entrada, "value", "RawData", "value", default={}) or {}
        t = (translacoes(raw) or [None])[0]
        if not t:
            continue
        try:
            x, y = float(scalar(t["x"], 0) or 0), float(scalar(t["y"], 0) or 0)
        except (TypeError, ValueError):
            continue
        raio = float(scalar(raw.get("area_range"), 3500) or 3500)
        minimo = (raio + raio_novo) * FOLGA_ENTRE_BASES
        d = math.dist((x, y), ponto[:2])
        if d < minimo:
            perto.append((bid, d))
    return sorted(perto, key=lambda kv: kv[1])


# --------------------------------------------------------------- restauração

def injetar(atual: dict, pacote_mundo: dict, base_id: str, uid: str) -> dict:
    """Põe a base do pacote dentro do save vivo e religa tudo.

    Mesma sequência do `restaurar_base.restaurar_jogador`, com uma diferença:
    a guild que recebe a base é a do jogador **hoje**, não a do backup. A
    guild pode ter mudado de nome, de membros, ou ter sido refeita — o que
    importa é quem vai jogar com ela agora.
    """
    rel = {"base_id": base_id, "objetos": 0, "trabalhos": 0, "erro": None}

    guild = guild_do_jogador(atual, uid)
    if not guild:
        rel["erro"] = "jogador não está em nenhuma guild no save atual"
        return rel
    rel["guild"] = (guild["raw"].get("guild_name") or "").strip() or "Guild sem nome"

    entry_camp = base_camp_por_id(pacote_mundo).get(base_id)
    if not entry_camp:
        rel["erro"] = "o pacote não tem a entrada da base"
        return rel

    if base_id not in base_camp_por_id(atual):
        lista_mutavel(atual, "BaseCampSaveData").append(entry_camp)
    else:
        rel["erro"] = "essa base ainda existe no save — nada a restaurar"
        return rel

    objetos = list(dig(pacote_mundo, "MapObjectSaveData", "value", "values", default=[]))
    presentes = instance_ids_presentes(atual)
    destino_objetos = map_object_list_ref(atual)
    for obj in objetos:
        iid = norm_uid(dig(obj, "Model", "value", "RawData", "value",
                           "instance_id", default=""))
        if iid and iid in presentes:
            continue
        destino_objetos.append(obj)
        if iid:
            presentes.add(iid)
        rel["objetos"] += 1

    works_destino = lista_mutavel(atual, "WorkSaveData", tipo="ArrayProperty")
    ja = {norm_uid(dig(w, "RawData", "value", "id", default="")) for w in work_entries(atual)}
    for w in works_da_base(pacote_mundo, base_id):
        wid = norm_uid(dig(w, "RawData", "value", "id", default=""))
        if wid and wid in ja:
            continue
        works_destino.append(w)
        if wid:
            ja.add(wid)
        rel["trabalhos"] += 1

    dependencias = copiar_dependencias(atual, pacote_mundo, objetos, entry_camp)
    sementes = (list(objetos) + works_da_base(pacote_mundo, base_id) + [entry_camp]
                + dependencias["_copiados_item"] + dependencias["_copiados_char"])
    dependencias["fechamento"] = fechar_referencias(atual, pacote_mundo, sementes)

    esvaziados, teimosos = sanear_slots(
        atual, dependencias.pop("_copiados_item"), dependencias.pop("_copiados_char"))
    dependencias["slots_esvaziados"] = esvaziados
    dependencias["slots_teimosos"] = teimosos

    dependencias["trabalhos_zerados"] = zerar_refs_perdidas(
        objetos, ("target_work_id", "repair_work_id"),
        set(indices(atual)["WorkSaveData"]), guid_zero(atual))
    rel["dependencias"] = dependencias

    # Religar a base na guild de hoje: sem estas duas listas o jogo não sabe
    # que a base é de alguém, e a limpeza a trata como órfã.
    raw_camp = dig(entry_camp, "value", "RawData", "value", default={}) or {}
    base_ids = list(guild["raw"].get("base_ids") or [])
    if entry_camp.get("key") not in base_ids:
        base_ids.append(entry_camp.get("key"))
    guild["raw"]["base_ids"] = base_ids

    palbox = raw_camp.get("owner_map_object_instance_id")
    pontos = list(guild["raw"].get("map_object_instance_ids_base_camp_points") or [])
    if palbox and norm_uid(palbox) != ZERO_UID and \
            norm_uid(palbox) not in {norm_uid(x) for x in pontos}:
        pontos.append(palbox)
    guild["raw"]["map_object_instance_ids_base_camp_points"] = pontos
    rel["palbox"] = norm_uid(palbox) if palbox else "(vazio)"

    # ⚠️ Sem renovar o contador, o auto-reset de 72h apaga a base de novo no
    # autosave seguinte — foi o que aconteceu na primeira tentativa de 05/09.
    agora = agora_na_escala_do_save(atual)
    if agora is None:
        rel["aviso"] = "não achei referência de 'agora' — contador NÃO renovado"
    else:
        tocados = 0
        for membro in guild["raw"].get("players") or []:
            info = membro.get("player_info")
            if isinstance(info, dict):
                info["last_online_real_time"] = agora
                tocados += 1
        rel["membros_renovados"] = tocados

    return rel


def main() -> int:
    ap = argparse.ArgumentParser(description="Restaura a base de um jogador a partir do arquivo")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uid", required=True, help="UID do jogador (32 hex)")
    ap.add_argument("--snapshot", type=int, default=0,
                    help="id do snapshot; 0 = o melhor guardado dessa pessoa")
    ap.add_argument("--destino", default="",
                    help="x,y,z de mundo onde a base deve renascer; vazio = "
                         "no lugar original")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items()
              if k in NEEDED_SECTIONS}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")
    uid = norm_uid(args.uid)

    conn = psycopg.connect(os.environ["DATABASE_URL"])
    try:
        linha = pacote_do_banco(conn, cfg.slug, uid, args.snapshot or None)
    finally:
        conn.close()

    if not linha:
        print(f"  ✗ não há base arquivada para {uid} em {cfg.slug}")
        return 1

    (sid, base_id, guild_nome, ox, oy, oz, raio, pecas, blob, formato, quando) = linha
    print(f"=== {cfg.slug} — base {base_id[:8]}… de {guild_nome or '(sem guild)'} ===")
    print(f"  snapshot #{sid}, de {quando:%d/%m %H:%M}, {pecas} peça(s), formato {formato}")

    if formato < 2:
        # O formato 1 guardava só base + peças e devolveria os baús vazios.
        print("  ✗ snapshot em formato antigo (1), sem o fecho de referências.")
        print("    Restaurar assim devolveria a base com os baús vazios.")
        return 1

    pacote = pickle.loads(gzip.decompress(blob))
    pacote_mundo = mundo_do_pacote(pacote)

    if args.aplicar:
        pid = PANEL_IDS.get(cfg.slug)
        if not pid:
            sys.exit(f"sem panelId para {cfg.slug}")
        if estado_do_painel(pid) != "offline":
            print("  ❌ o servidor precisa estar parado para gravar.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    t0 = time.time()
    original = baixar(cfg, SAVE_PATH.format(guid=cfg.guid))
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    atual = gvas.properties["worldSaveData"]["value"]
    print(f"  save vivo: {len(original):,} bytes, lido em {time.time()-t0:.0f}s", flush=True)

    # ---- destino ---------------------------------------------------------
    if args.destino:
        try:
            dx, dy, dz = (float(v) for v in args.destino.split(","))
        except ValueError:
            sys.exit("--destino tem de ser x,y,z")
        vizinhas = bases_por_perto(atual, (dx, dy, dz), raio)
        if vizinhas:
            print(f"  ✗ o destino encosta em {len(vizinhas)} base(s):")
            for bid, d in vizinhas[:3]:
                print(f"      {bid[:8]}… a {d:,.0f} de distância")
            print("    Escolha um lugar mais afastado.")
            return 1
        delta = (dx - ox, dy - oy, dz - oz)
        alvos = [pacote["base"], *pacote["pecas"]]
        movidas, ignoradas = mover(alvos, (ox, oy, oz), delta, raio)
        print(f"  destino: {dx:,.0f}, {dy:,.0f}, {dz:,.0f} "
              f"(delta {delta[0]:,.0f}, {delta[1]:,.0f}, {delta[2]:,.0f})")
        print(f"  posições movidas: {movidas} em {len(alvos)} peça(s) "
              f"— {movidas/max(len(alvos),1):.2f} por peça, {ignoradas} ignorada(s)")
        if movidas < len(alvos):
            print("    ⚠️ menos de uma posição por peça: parte da base ficaria para trás.")
            return 1
    else:
        print(f"  destino: o lugar original ({ox:,.0f}, {oy:,.0f})")
        vizinhas = bases_por_perto(atual, (ox, oy, oz), raio)
        if vizinhas:
            print(f"  ⚠️ o lugar original já tem {len(vizinhas)} base(s) por perto:")
            for bid, d in vizinhas[:3]:
                print(f"      {bid[:8]}… a {d:,.0f} de distância")
            print("    Use --destino para escolher outro lugar.")
            return 1

    # ---- injetar ---------------------------------------------------------
    rel = injetar(atual, pacote_mundo, base_id, uid)
    if rel["erro"]:
        print(f"  ✗ {rel['erro']}")
        return 1

    print(f"  guild que recebe: {rel['guild']}")
    print(f"  {rel['objetos']} peça(s), {rel['trabalhos']} trabalho(s), "
          f"Pal Box {rel['palbox'][:8]}…")
    dep = rel.get("dependencias", {})
    print("  dependências: " + ", ".join(
        f"{k}={v}" for k, v in sorted(dep.items())
        if isinstance(v, int) and v))
    if rel.get("aviso"):
        print(f"  ⚠️ {rel['aviso']}")

    # ---- checagem antes de gravar ---------------------------------------
    t0 = time.time()
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    volta, _ = decompress_sav_to_gvas(novo)
    recheck = GvasFile.read(volta, PALWORLD_TYPE_HINTS,
                            custom).properties["worldSaveData"]["value"]
    print(f"\n  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s")

    if base_id not in base_camp_por_id(recheck):
        print("  ❌ a base não sobreviveu ao ciclo de escrita. Nada gravado.")
        return 1
    idx = indices(recheck)
    faltando = [c for c in ("ItemContainerSaveData", "WorkSaveData")
                if not idx[c]]
    print(f"  ✓ base presente após reserialização, "
          f"{len(idx['MapObjectSaveData']):,} peça(s) no mundo")
    if faltando:
        print(f"  ⚠️ seções vazias após o ciclo: {', '.join(faltando)}")

    if args.simular:
        print("\n  (simulação — nada foi gravado)")
        return 0

    caminho = SAVE_PATH.format(guid=cfg.guid)
    seguranca = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, seguranca, original)
    conf = info_arquivo(cfg, seguranca)
    if not conf or conf[0] != len(original):
        return _abortar(f"backup incompleto ({conf[0] if conf else 0} de {len(original)}).")
    print(f"  ✅ backup conferido: {seguranca} ({conf[0]:,} bytes)", flush=True)

    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(novo):
        apagar(cfg, temporario)
        return _abortar("upload incompleto.")
    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes, por rename)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
