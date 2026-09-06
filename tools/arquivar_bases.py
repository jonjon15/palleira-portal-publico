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
    baixar, base_camp_entries, coletar_guids, dig, entries_of, norm_uid,
    scalar, servidores,
)
from sondar_inventario import ler_gvas  # noqa: E402
from sondar_posicoes import achar_posicao  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

SECOES = (
    ".worldSaveData.GroupSaveDataMap",
    ".worldSaveData.BaseCampSaveData.Value.RawData",
    ".worldSaveData.MapObjectSaveData",
)

FORMATO = 1

# Quantas versões guardar de cada base. Três dá margem para descobrir tarde
# que a mais recente já veio estragada, sem virar depósito: 3 × 200 KB por
# base grande.
VERSOES_POR_BASE = 3


def guildas(world) -> dict[str, dict]:
    """base_id -> {guild_id, guild_name, membros} para cada base conhecida."""
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
        }
        for bid in raw.get("base_ids") or []:
            chave = norm_uid(bid)
            if chave:
                out[chave] = info
    return out


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
            info = donos.get(bid, {"guild_id": "", "guild_name": "", "membros": []})

            blob = gzip.compress(
                pickle.dumps({"base": entrada, "pecas": pecas}, protocol=5), 6)
            total_bytes += len(blob)

            print(f"  {bid[:8]}… {info['guild_name'] or '(sem guild)':<24} "
                  f"{len(pecas):>5} peça(s)  {len(blob)/1024:>7,.0f} KB", flush=True)

            if conn is None:
                continue

            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into base_snapshots
                      (server_slug, base_id, guild_id, guild_name, member_uids,
                       world_x, world_y, world_z, area_range,
                       piece_count, blob, blob_bytes, formato)
                    values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (cfg.slug, bid, info["guild_id"], info["guild_name"],
                     info["membros"], pos[0], pos[1], pos[2], raio,
                     len(pecas), blob, len(blob), FORMATO),
                )
                # Some com as versões velhas na mesma transação: sem isto a
                # tabela cresce para sempre, e a mais antiga de todas é
                # justamente a que menos serve.
                cur.execute(
                    """
                    delete from base_snapshots
                    where server_slug = %s and base_id = %s
                      and id not in (
                        select id from base_snapshots
                        where server_slug = %s and base_id = %s
                        order by taken_at desc limit %s
                      )
                    """,
                    (cfg.slug, bid, cfg.slug, bid, VERSOES_POR_BASE),
                )
            conn.commit()
            gravadas += 1

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
