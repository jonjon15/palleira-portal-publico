#!/usr/bin/env python3
"""
Guarda no banco o recorte de cada base do servidor — o arquivo de bases.

Existe porque o servidor não tem rede de segurança nenhuma: a API do painel
responde `backup_count: 0`, e a pasta `backup/world/` do jogo rotaciona
sozinha (em 06/09/2026 só restavam os de 03 e 04/09 mais os da última hora).
A base de 22/08 que salvou o Tenshi existia por sorte, não por sistema.

Com este arquivo, recuperar uma base deixa de depender de o backup certo
ainda estar lá.

O recorte de uma base é:
  1. a entrada dela em `BaseCampSaveData` (posição, raio, dono, módulos);
  2. cada peça de `MapObjectSaveData` cujo `base_camp_id_belong_to` bate.

Medido em 06/09/2026: ~150 bytes por peça, gzip. A maior base do pve-free
(1.425 peças) dá 202 KB.

Só lê o servidor. Grava apenas no banco.

Uso:
    python tools/arquivar_bases.py                      # todos os servidores
    python tools/arquivar_bases.py --servidores pve-free --simular
"""

from __future__ import annotations

import argparse
import gzip
import os
import pickle
import sys
import time

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    NEEDED_SECTIONS, baixar, base_camp_entries, coletar_guids, dig,
    entries_of, indices, norm_uid, refs_de, scalar, servidores, works_da_base,
)
from sondar_inventario import ler_gvas  # noqa: E402
from sondar_posicoes import achar_posicao  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

# As mesmas seções que a restauração precisa. Guardar menos que isso seria
# guardar uma base que não volta: o recorte da primeira versão tinha só a
# entrada do BaseCamp e as peças, e devolveria a base com os baús vazios e
# sem os Pals que moram nela — o erro de 05/09/2026 pela outra ponta.
SECOES = NEEDED_SECTIONS

# 1 = base + peças (incompleto, não restaura sozinho)
# 2 = + o fecho de referências: baús, itens, caixas de Pal, os Pals e os works
FORMATO = 2

# Quantas versões guardar de cada base. Três dá margem para descobrir tarde
# que a mais recente já veio estragada, sem virar depósito: 3 × 200 KB por
# base grande, uns 10 MB para os três servidores — 2% dos 0,5 GB do Neon.
VERSOES_POR_BASE = 3


def guildas(world) -> dict[str, dict]:
    """base_id -> {guild_id, guild_name, membros, leader_uid} para cada base."""
    out: dict[str, dict] = {}
    for entrada in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        raw = dig(entrada, "value", "RawData", "value", default={}) or {}
        if raw.get("group_type") != "EPalGroupType::Guild":
            continue
        membros = [norm_uid(m.get("player_uid", "")) for m in (raw.get("players") or [])]
        info = {
            "guild_id": norm_uid(scalar(raw.get("group_id"), "")),
            "guild_name": (raw.get("guild_name") or "").strip(),
            "membros": [m for m in membros if m],
            "leader_uid": norm_uid(scalar(raw.get("admin_player_uid"), "")),
        }
        for bid in raw.get("base_ids") or []:
            chave = norm_uid(bid)
            if chave:
                out[chave] = info
    return out


def fecho_da_base(idx: dict, sementes: list, limite_voltas: int = 6) -> dict:
    """Tudo que as `sementes` apontam, e tudo que *isso* aponta, até parar.

    Mesma varredura do `fechar_referencias` da restauração, só que colhendo em
    vez de copiar para outro save. É o que garante que o arquivo tenha o baú
    junto com a peça que o aponta: o Save Pal avisa, em `blueprint/capture.rs`,
    que estrutura sem o container dela faz o jogo estourar ao dereferenciar —
    e foi o que apagou a base restaurada em 05/09/2026.

    Seguir o grafo em vez de listar campo a campo resolve a classe inteira:
    baú aponta item dinâmico, caixa aponta Pal, peça aponta trabalho.
    """
    coletado: dict[str, dict] = {secao: {} for secao in idx}
    vistos: set[str] = set()
    fila = list(sementes)

    for _ in range(limite_voltas):
        novos: list = []
        for entrada in fila:
            for gid in refs_de(entrada):
                if gid in vistos:
                    continue
                vistos.add(gid)
                for secao, catalogo in idx.items():
                    achado = catalogo.get(gid)
                    if achado is None:
                        continue
                    # MapObjectSaveData já vem inteiro nas peças da base;
                    # guardar de novo aqui só duplicaria peso no blob.
                    if secao != "MapObjectSaveData":
                        coletado[secao][gid] = achado
                    novos.append(achado)
                    break
        if not novos:
            break
        fila = novos

    return {secao: list(itens.values()) for secao, itens in coletado.items() if itens}


def main() -> int:
    ap = argparse.ArgumentParser(description="Arquiva as bases do servidor no banco")
    ap.add_argument("--servidores", default="",
                    help="slugs separados por vírgula; vazio = todos os de "
                         "PALLEIRA_SERVERS")
    ap.add_argument("--simular", action="store_true",
                    help="mede e mostra, sem gravar no banco")
    args = ap.parse_args()

    todos = servidores()
    pedidos = [s.strip() for s in args.servidores.split(",") if s.strip()] or list(todos)

    faltando = [s for s in pedidos if s not in todos]
    if faltando:
        sys.exit(f"servidor(es) fora de PALLEIRA_SERVERS: {', '.join(faltando)}")

    saida = 0
    for slug in pedidos:
        # Um servidor que falha não pode levar os outros junto: o arquivo do
        # dia é melhor incompleto do que inexistente.
        try:
            saida |= arquivar(todos[slug], args.simular)
        except Exception as err:  # noqa: BLE001
            print(f"\n  ✗ {slug}: {type(err).__name__}: {err}", flush=True)
            saida = 1
    return saida


def arquivar(cfg, simular: bool) -> int:
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}

    t0 = time.time()
    world = ler_gvas(baixar(cfg, SAVE_PATH.format(guid=cfg.guid)), custom
                     ).properties["worldSaveData"]["value"]
    camps = base_camp_entries(world)
    objetos = entries_of(dig(world, "MapObjectSaveData", default=None)) or []
    print(f"=== {cfg.slug}: {len(camps)} base(s), {len(objetos):,} peça(s), "
          f"lido em {time.time()-t0:.0f}s ===", flush=True)

    por_base: dict[str, list] = {}
    for obj in objetos:
        for bid in coletar_guids(obj, "base_camp_id_belong_to"):
            por_base.setdefault(bid, []).append(obj)
            break

    donos = guildas(world)
    # Os catálogos são caros de montar e valem para o mundo todo: uma vez só,
    # fora do laço das bases.
    idx = indices(world)

    conn = None if simular else psycopg.connect(os.environ["DATABASE_URL"])
    total_bytes = 0
    gravadas = 0

    try:
        for entrada in camps:
            bid = norm_uid(dig(entrada, "key", default=""))
            if not bid:
                continue
            pecas = por_base.get(bid, [])
            raw = dig(entrada, "value", "RawData", "value", default={}) or {}
            pos = achar_posicao(raw) or (0.0, 0.0, 0.0)
            raio = float(scalar(raw.get("area_range"), 3500) or 3500)
            info = donos.get(
                bid,
                {"guild_id": "", "guild_name": "", "membros": [], "leader_uid": ""},
            )

            # Os works não são achados por referência (a lista `work_ids` do
            # WorkCollection vem vazia nestas bases), então entram como
            # semente, do mesmo jeito que a restauração os acha.
            works = works_da_base(world, bid)
            fecho = fecho_da_base(idx, [entrada, *pecas, *works])
            fecho.setdefault("WorkSaveData", [])
            ja = {id(w) for w in fecho["WorkSaveData"]}
            fecho["WorkSaveData"] += [w for w in works if id(w) not in ja]

            blob = gzip.compress(pickle.dumps(
                {"base": entrada, "pecas": pecas, "fecho": fecho}, protocol=5), 6)
            total_bytes += len(blob)

            extras = " ".join(f"{s.replace('SaveData','')}:{len(v)}"
                              for s, v in sorted(fecho.items()) if v)
            lider = info["leader_uid"][:8] + "…" if info["leader_uid"] else "?"
            print(f"  {bid[:8]}… {info['guild_name'] or '(sem guild)':<24} "
                  f"{len(pecas):>5} peça(s)  {len(blob)/1024:>7,.0f} KB  "
                  f"líder:{lider}  {extras}",
                  flush=True)

            gravadas += 1
            if conn is None:
                continue

            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into base_snapshots
                      (server_slug, base_id, guild_id, guild_name, member_uids,
                       leader_uid, world_x, world_y, world_z, area_range,
                       piece_count, blob, blob_bytes, formato)
                    values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (cfg.slug, bid, info["guild_id"], info["guild_name"],
                     info["membros"], info["leader_uid"] or None,
                     pos[0], pos[1], pos[2], raio,
                     len(pecas), blob, len(blob), FORMATO),
                )
                # Some com as versões velhas na mesma transação: sem isto a
                # tabela cresce para sempre.
                #
                # ⚠️ A maior versão nunca é apagada, mesmo que fique velha. Uma
                # base pode continuar existindo e vir esvaziada — jogador
                # derrubou tudo, ou um bug comeu as peças — e três dias assim
                # empurrariam a última versão boa para fora só por idade.
                # Guardar a de mais peças custa um registro e é exatamente a
                # que alguém vai querer de volta.
                #
                # Base APAGADA não passa por aqui: se ela sumiu do save, não
                # há insert novo, e o que estava guardado fica intacto.
                cur.execute(
                    """
                    delete from base_snapshots
                    where server_slug = %s and base_id = %s
                      and id not in (
                        select id from base_snapshots
                        where server_slug = %s and base_id = %s
                        order by taken_at desc limit %s
                      )
                      and id <> (
                        select id from base_snapshots
                        where server_slug = %s and base_id = %s
                        order by piece_count desc, taken_at desc limit 1
                      )
                    """,
                    (cfg.slug, bid, cfg.slug, bid, VERSOES_POR_BASE,
                     cfg.slug, bid),
                )
            conn.commit()

        print(f"\n=== {gravadas} base(s) arquivada(s), "
              f"{total_bytes/1_048_576:.2f} MB nesta rodada ===")
        if simular:
            print("simulação — nada foi gravado no banco")
    finally:
        if conn is not None:
            conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
