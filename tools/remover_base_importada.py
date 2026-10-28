#!/usr/bin/env python3
"""
Tira do save uma base que nunca devia ter entrado — o contrário do
`restaurar_do_arquivo.py`.

Existe por causa de 28/10/2026: o Young (Bruno) restaurou no Dominantes a base
da season de antes do wipe (snapshot #1250). Depois saiu da guild, pôs uma
Palbox nova em cima e virou a base 9A8127E0. Apagar só a base não bastava:
parte das peças velhas ficou solta no mapa, sem base nenhuma.

O que sai:
  1. tudo que existe hoje no save E no snapshot (`--snapshot`) — o que a
     restauração trouxe: peças, trabalhos, baús, itens, caixas e Pals. GUID é
     aleatório, então coincidência com coisa do mundo novo não acontece;
  2. a base `--base` inteira, se passada: a entrada, as peças, os trabalhos,
     os containers que ela nomeia e o que mora neles.

⚠️ Nada que ainda é apontado por algo que fica é apagado. Item que o jogador
já passou para a mochila, Pal que já está no time: o ponteiro de quem fica
segura o candidato (e o que ele aponta), até estabilizar. Apagar coisa
apontada é o ponteiro solto que derrubou o pve-free em 05/09.

A guild não é "quem fica" para esse fim: a lista de Pals e de bases dela é
limpa do que saiu, em vez de segurar.

Uso:
    python tools/remover_base_importada.py --servidor pvp-free --snapshot 1250 \\
        --base 9A8127E04D17D4A440003CA7DB1B2E00 --simular [--arquivo Level.sav]
    python tools/remover_base_importada.py ... --aplicar
"""

from __future__ import annotations

import argparse
import gzip
import os
import pickle
import re
import sys
import time
from collections import Counter

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, energia, estado as estado_do_painel  # noqa: E402
from processar_fila import esperar_estado  # noqa: E402
from restaurar_base import (  # noqa: E402
    NEEDED_SECTIONS, ZERO_UID, apagar, baixar, base_camp_por_id, coletar_guids,
    dig, enviar, guildas_por_id, indices, info_arquivo, lista_mutavel,
    norm_uid, renomear, secao_por_id, servidores, slots_do_container,
    works_da_base,
)
from restaurar_do_arquivo import mundo_do_pacote  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
HEX32 = re.compile(r"^[0-9A-F]{32}$")

# Seção -> tipo usado por `lista_mutavel` (o mesmo de `fechar_referencias`).
SECOES = {
    "MapObjectSaveData": "ArrayProperty",
    "WorkSaveData": "ArrayProperty",
    "ItemContainerSaveData": "MapProperty",
    "CharacterContainerSaveData": "MapProperty",
    "DynamicItemSaveData": "ArrayProperty",
    "CharacterSaveParameterMap": "MapProperty",
    "BaseCampSaveData": "MapProperty",
}


def todos_os_guids(no, prof: int = 24) -> set[str]:
    """Todo valor com cara de GUID, em qualquer chave. Mais largo que
    `refs_de` de propósito: aqui um ponteiro esquecido apaga coisa viva."""
    achados: set[str] = set()

    def anda(n, p):
        if p <= 0:
            return
        if isinstance(n, dict):
            for v in n.values():
                anda(v, p - 1)
        elif isinstance(n, list):
            if n and isinstance(n[0], int):
                return  # bytes crus, não tem GUID legível
            for v in n:
                anda(v, p - 1)
        elif n is not None and not isinstance(n, (int, float, bool, bytes)):
            g = norm_uid(n)
            if HEX32.match(g) and g != ZERO_UID:
                achados.add(g)

    anda(no, prof)
    return achados


def ids_da_entrada(secao: str, entrada) -> set[str]:
    if secao == "BaseCampSaveData":
        return {norm_uid(dig(entrada, "key", default=""))}
    return set()


def candidatos(atual: dict, pacote_mundo: dict, base_id: str | None) -> dict[int, tuple]:
    """id(entrada) -> (seção, entrada, guids que a identificam)."""
    idx_vivo = indices(atual)
    idx_pacote = indices(pacote_mundo)
    out: dict[int, tuple] = {}

    def por(secao, entrada, gid):
        k = id(entrada)
        if k in out:
            out[k][2].add(gid)
        else:
            out[k] = (secao, entrada, {gid})

    for secao, idx in idx_vivo.items():
        for gid in idx.keys() & idx_pacote.get(secao, {}).keys():
            por(secao, idx[gid], gid)

    camps = base_camp_por_id(atual)
    for bid in base_camp_por_id(pacote_mundo):
        if bid in camps:
            por("BaseCampSaveData", camps[bid], bid)

    if base_id:
        entry_camp = camps.get(base_id)
        if entry_camp is None:
            print(f"  ⚠️ base {base_id} não está no save")
        else:
            por("BaseCampSaveData", entry_camp, base_id)
            objetos = [e for gid, e in idx_vivo["MapObjectSaveData"].items()
                       if base_id in coletar_guids(e, "base_camp_id_belong_to")]
            for e in objetos:
                for gid, e2 in idx_vivo["MapObjectSaveData"].items():
                    if e2 is e:
                        por("MapObjectSaveData", e, gid)
            for w in works_da_base(atual, base_id):
                por("WorkSaveData", w, norm_uid(dig(w, "RawData", "value", "id", default="")))
            conts: set[str] = set()
            for e in objetos:
                conts |= coletar_guids(e, "target_container_id")
            conts |= coletar_guids(entry_camp, "container_id")
            conts |= coletar_guids(entry_camp, "target_container_id")
            for cid in conts:
                for secao in ("ItemContainerSaveData", "CharacterContainerSaveData"):
                    e = idx_vivo[secao].get(cid)
                    if e is None:
                        continue
                    por(secao, e, cid)
                    for slot in slots_do_container(e):
                        for gid in coletar_guids(slot, "local_id_in_created_world", prof=6):
                            if gid in idx_vivo["DynamicItemSaveData"]:
                                por("DynamicItemSaveData", idx_vivo["DynamicItemSaveData"][gid], gid)
                        for gid in coletar_guids(slot, "instance_id", prof=6):
                            if gid in idx_vivo["CharacterSaveParameterMap"]:
                                por("CharacterSaveParameterMap",
                                    idx_vivo["CharacterSaveParameterMap"][gid], gid)

    # Trabalho nascido depois da restauração (reparo, construção) em cima de
    # peça que sai: sem a peça ele não tem razão de existir, e ficando ele
    # seguraria a peça no save.
    pecas_que_saem = {g for _s, _e, gs in out.values() if _s == "MapObjectSaveData" for g in gs}
    for gid, w in idx_vivo["WorkSaveData"].items():
        if id(w) not in out and todos_os_guids(w) & pecas_que_saem:
            por("WorkSaveData", w, gid)
    return out


def remover(atual: dict, pacote_mundo: dict, base_id: str | None) -> dict:
    rel: dict = {}
    cand = candidatos(atual, pacote_mundo, base_id)
    rel["candidatos"] = Counter(s for s, _e, _g in cand.values())

    # Quem fica: toda entrada das seções que não é candidata, mais as bases
    # dos outros. A guild fica de fora — ela é limpa, não segura.
    guid_de: dict[str, int] = {}
    for k, (_s, _e, gids) in cand.items():
        for g in gids:
            guid_de[g] = k

    apontados: set[str] = set()
    for secao, tipo in SECOES.items():
        for e in lista_mutavel(atual, secao, tipo=tipo):
            if id(e) not in cand:
                apontados |= todos_os_guids(e)

    segurados: dict[int, tuple] = {}
    fila = {guid_de[g] for g in apontados if g in guid_de}
    while fila:
        k = fila.pop()
        if k in segurados:
            continue
        segurados[k] = cand[k]
        for g in todos_os_guids(cand[k][1]):
            k2 = guid_de.get(g)
            if k2 is not None and k2 not in segurados:
                fila.add(k2)
    rel["segurados"] = Counter(s for s, _e, _g in segurados.values())
    rel["segurados_lista"] = [
        (s, sorted(g)[0], str(dig(e, "value", "RawData", "value", "object", "SaveParameter",
                                  "value", "CharacterID", "value", default="")))
        for s, e, g in segurados.values()]

    sai = {k for k in cand if k not in segurados}
    if base_id and any(cand[k][0] == "BaseCampSaveData" and base_id in cand[k][2]
                       for k in segurados):
        rel["erro"] = f"a base {base_id} ainda é apontada por algo que fica — nada removido"
        return rel

    guids_que_saem: set[str] = set()
    for k in sai:
        guids_que_saem |= cand[k][2]

    removidos = Counter()
    for secao, tipo in SECOES.items():
        lista = lista_mutavel(atual, secao, tipo=tipo)
        antes = len(lista)
        lista[:] = [e for e in lista if id(e) not in sai]
        removidos[secao] = antes - len(lista)
    rel["removidos"] = removidos

    limpos = Counter()
    for gid, info in guildas_por_id(atual).items():
        raw = info["raw"]
        for campo in ("base_ids", "map_object_instance_ids_base_camp_points"):
            antes = list(raw.get(campo) or [])
            depois = [x for x in antes if norm_uid(x) not in guids_que_saem]
            if len(depois) != len(antes):
                raw[campo] = depois
                limpos[f"{gid[:8]}.{campo}"] += len(antes) - len(depois)
        antes = list(raw.get("individual_character_handle_ids") or [])
        depois = [h for h in antes if not (todos_os_guids(h) & guids_que_saem)]
        if len(depois) != len(antes):
            raw["individual_character_handle_ids"] = depois
            limpos[f"{gid[:8]}.individual_character_handle_ids"] += len(antes) - len(depois)
    rel["guild_limpa"] = limpos
    rel["guids_que_saem"] = guids_que_saem
    return rel


def conferir(world, guids_que_saem: set[str]) -> int:
    """Quantos ponteiros, no save já reescrito, ainda apontam para o que saiu."""
    soltos = 0
    for secao, tipo in SECOES.items():
        for e in lista_mutavel(world, secao, tipo=tipo):
            soltos += len(todos_os_guids(e) & guids_que_saem)
    for info in guildas_por_id(world).values():
        soltos += len(todos_os_guids(info["raw"]) & guids_que_saem)
    return soltos


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--snapshot", type=int, required=True)
    ap.add_argument("--base", default="", help="base viva a remover inteira (32 hex)")
    ap.add_argument("--arquivo", default="", help="só com --simular: Level.sav local")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED_SECTIONS}
    cfg = servidores()[args.servidor]
    base_id = norm_uid(args.base) or None

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute("select blob from base_snapshots where id = %s and server_slug = %s",
                    (args.snapshot, args.servidor))
        linha = cur.fetchone()
    if not linha:
        sys.exit("snapshot não encontrado")
    # Blob gravado pelo nosso próprio arquivar_bases.py — fonte confiável.
    pacote_mundo = mundo_do_pacote(pickle.loads(gzip.decompress(linha[0])))

    pid = PANEL_IDS.get(cfg.slug)
    caminho = SAVE_PATH.format(guid=cfg.guid)
    if args.aplicar:
        if args.arquivo:
            sys.exit("--arquivo é só para simular")
        print("  parando o servidor...", flush=True)
        energia(pid, "stop")
        esperar_estado(pid, "offline")

    original = open(args.arquivo, "rb").read() if args.arquivo else baixar(cfg, caminho)
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    atual = gvas.properties["worldSaveData"]["value"]

    rel = remover(atual, pacote_mundo, base_id)
    for chave in ("candidatos", "segurados", "removidos", "guild_limpa"):
        print(f"  {chave}: {dict(rel.get(chave, {}))}")
    for s, g, especie in rel.get("segurados_lista", []):
        print(f"    segurado: {s} {g[:8]} {especie}")

    def religar():
        if args.aplicar:
            energia(pid, "start")
            esperar_estado(pid, "running")

    if rel.get("erro"):
        print(f"  ❌ {rel['erro']}")
        religar()
        return 1

    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    volta, _ = decompress_sav_to_gvas(novo)
    recheck = GvasFile.read(volta, PALWORLD_TYPE_HINTS, custom).properties["worldSaveData"]["value"]
    soltos = conferir(recheck, rel["guids_que_saem"])
    print(f"  reserializado: {len(original):,} → {len(novo):,} bytes; "
          f"ponteiros para o que saiu: {soltos}")
    if base_id and base_id in base_camp_por_id(recheck):
        soltos += 1
        print("  ❌ a base ainda está no save depois de reescrever")
    if soltos:
        print("  ❌ abortado — nada gravado")
        religar()
        return 1

    if not args.aplicar:
        print("  (simulação — nada foi gravado)")
        return 0

    seguranca = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, seguranca, original)
    conf = info_arquivo(cfg, seguranca)
    if not conf or conf[0] != len(original):
        print("  ❌ backup de segurança incompleto — nada gravado")
        religar()
        return 1
    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf = info_arquivo(cfg, temporario)
    if not conf or conf[0] != len(novo):
        apagar(cfg, temporario)
        print("  ❌ upload incompleto — nada gravado")
        religar()
        return 1
    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado; o anterior ficou em {seguranca}")
    religar()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
