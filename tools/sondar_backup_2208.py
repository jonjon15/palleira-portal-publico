#!/usr/bin/env python3
"""
Sonda o `Level.sav.bak-20260822-154657` do pve-free — o backup avulso que
sobrou na raiz da pasta do mundo, de antes do decay que apagou várias bases,
fora da rotação de `backup/world/` — e lista as bases/guilds que ele guarda.

Existe para responder: quem hoje não tem NENHUMA versão em `base_snapshots`
(porque a base já tinha sumido antes de 06/09/2026, quando o arquivo diário
começou a rodar) ainda aparece aqui, em 22/08?

Reusa a mesma extração do `arquivar_bases.py` — nada aqui reinventa o que já
foi testado em produção.

Não grava nada. Lê o servidor, lê o banco, imprime.

Uso (local ou Actions):
    PALLEIRA_SERVERS=... DATABASE_URL=... python tools/sondar_backup_2208.py
"""

from __future__ import annotations

import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arquivar_bases import SECOES, fecho_da_base, guildas  # noqa: E402
from restaurar_base import (  # noqa: E402
    baixar, base_camp_entries, coletar_guids, dig, entries_of, norm_uid,
    servidores,
)
from sondar_inventario import ler_gvas  # noqa: E402

SLUG = "pve-free"
ARQUIVO = "Level.sav.bak-20260822-154657"
SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/" + ARQUIVO


def main() -> int:
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}

    cfg = servidores().get(SLUG)
    if not cfg:
        sys.exit(f"'{SLUG}' não está em PALLEIRA_SERVERS")

    print(f"=== baixando {ARQUIVO} de {SLUG} ===", flush=True)
    bruto = baixar(cfg, SAVE_PATH.format(guid=cfg.guid))
    print(f"  {len(bruto):,} bytes")

    world = ler_gvas(bruto, custom).properties["worldSaveData"]["value"]
    camps = base_camp_entries(world)
    objetos = entries_of(dig(world, "MapObjectSaveData", default=None)) or []
    print(f"  {len(camps)} base(s), {len(objetos):,} peça(s) no backup de 22/08", flush=True)

    por_base: dict[str, list] = {}
    for obj in objetos:
        for bid in coletar_guids(obj, "base_camp_id_belong_to"):
            por_base.setdefault(bid, []).append(obj)
            break

    donos = guildas(world)

    linhas = []
    for entrada in camps:
        bid = norm_uid(dig(entrada, "key", default=""))
        if not bid:
            continue
        pecas = por_base.get(bid, [])
        info = donos.get(bid, {"guild_id": "", "guild_name": "", "membros": []})
        linhas.append({
            "base_id": bid,
            "guild_name": info["guild_name"] or "(sem guild)",
            "membros": info["membros"],
            "pecas": len(pecas),
        })

    print("\n=== bases do backup de 22/08, por tamanho ===")
    for l in sorted(linhas, key=lambda x: -x["pecas"]):
        print(f"  {l['base_id']}  {l['guild_name']:<28} {l['pecas']:>5} peça(s)  "
              f"membros: {','.join(l['membros'])}")

    # ------------------------------------------------------- comparar com o banco
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                "select distinct base_id from base_snapshots where server_slug = %s",
                (SLUG,),
            )
            arquivadas_hoje = {r[0] for r in cur.fetchall()}

            cur.execute(
                "select guild_id, name, base_count from guilds where server_slug = %s",
                (SLUG,),
            )
            guilds_hoje = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
    finally:
        conn.close()

    print(f"\n{len(arquivadas_hoje)} base(s) já com alguma versão em base_snapshots ({SLUG})")

    faltando = [l for l in linhas if l["base_id"] not in arquivadas_hoje]
    print(f"\n=== SEM nenhuma versão arquivada hoje — candidatas ao backfill de 22/08 ({len(faltando)}) ===")
    for l in sorted(faltando, key=lambda x: -x["pecas"]):
        # cruza com a guild de hoje, se ela ainda existir sob o mesmo nome
        vive = [g for g, (nome, _) in guilds_hoje.items() if nome == l["guild_name"]]
        situacao = "guild sumiu" if not vive else f"guild viva, {guilds_hoje[vive[0]][1]} base(s) hoje"
        print(f"  {l['base_id']}  {l['guild_name']:<28} {l['pecas']:>5} peça(s)  [{situacao}]")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
