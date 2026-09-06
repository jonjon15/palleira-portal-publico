#!/usr/bin/env python3
"""
Procura containers de item **órfãos e com conteúdo** no `Level.sav`: caixas
que ninguém aponta — nem baú de base, nem inventário de jogador — mas que
ainda têm coisa dentro.

Existe por causa do inventário do Tenshi. Os seis containers que o
`Players/<uid>.sav` dele nomeia estão vazios, e já não existiam nos saves de
03 e 04/09. Sobra uma hipótese antes de dar os itens como perdidos: o jogo
pode ter recriado o inventário dele com **GUIDs novos** em algum momento, e o
conteúdo antigo continuar no mundo sem dono. Se for isso, os itens estão aqui
e dá para religar.

Como decide que é órfão: um container de item é apontado ou por um objeto de
mapa (`target_container_id` — baú, fábrica), ou pelo save individual de algum
jogador (os seis campos de `InventoryInfo`). O que não aparece em nenhum dos
dois não tem dono.

Não grava nada. Lê os 345 saves individuais, então demora alguns minutos.

Uso:
    python tools/sondar_orfaos.py --servidor pve-free
"""

from __future__ import annotations

import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    ZERO_UID, Servidor, _sftp, baixar, coletar_guids, dig, entries_of,
    norm_uid, scalar, secao_por_id, servidores,
)
from sondar_inventario import CAMPOS_DE_CONTAINER, guid_sob, ler_gvas  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
PLAYERS_DIR = "Pal/Saved/SaveGames/0/{guid}/Players"

SECOES = (
    ".worldSaveData.MapObjectSaveData",
    ".worldSaveData.ItemContainerSaveData.Value.RawData",
    ".worldSaveData.ItemContainerSaveData.Value.Slots.Slots.RawData",
)


def conteudo(entrada) -> list[tuple[str, int]]:
    """(item, quantidade) de cada slot ocupado."""
    slots = dig(entrada, "value", "Slots", "value", "values", default=None)
    if not isinstance(slots, list):
        slots = dig(entrada, "value", "Slots", "value", default=None)
    if not isinstance(slots, list):
        return []
    out = []
    for s in slots:
        raw = dig(s, "RawData", "value", default={})
        if not isinstance(raw, dict):
            continue
        qtd = int(scalar(raw.get("count"), 0) or 0)
        if qtd <= 0:
            continue
        nome = scalar(dig(raw, "item", "static_id"), "") or "?"
        out.append((str(nome), qtd))
    return out


def donos_pelos_mapobjects(world) -> set[str]:
    usados: set[str] = set()
    for entrada in entries_of(dig(world, "MapObjectSaveData")) or []:
        usados |= coletar_guids(entrada, "target_container_id")
    return usados


def donos_pelos_players(cfg: Servidor) -> tuple[dict[str, str], int]:
    """GUID de container -> uid do jogador que o aponta."""
    t, sftp = _sftp(cfg)
    try:
        arquivos = [n for n in sftp.listdir(PLAYERS_DIR.format(guid=cfg.guid))
                    if n.endswith(".sav") and not n.endswith("_dps.sav")]
        dono: dict[str, str] = {}
        lidos = 0
        for nome in arquivos:
            buf = io.BytesIO()
            try:
                sftp.getfo(f"{PLAYERS_DIR.format(guid=cfg.guid)}/{nome}", buf)
                props = ler_gvas(buf.getvalue(), {}).properties
            except Exception:  # noqa: BLE001 — um save ruim não pode parar a varredura
                continue
            save_data = dig(props, "SaveData", "value", default=props)
            for campo in CAMPOS_DE_CONTAINER:
                gid = guid_sob(save_data, campo)
                if gid:
                    dono[gid] = nome[:8]
            lidos += 1
        return dono, lidos
    finally:
        t.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Procura containers de item órfãos com conteúdo")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--minimo", type=int, default=1, help="só mostrar com pelo menos N slots ocupados")
    ap.add_argument("--mostrar", type=int, default=25, help="quantos órfãos detalhar")
    args = ap.parse_args()

    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    print(f"=== {cfg.slug} ===", flush=True)
    world = ler_gvas(baixar(cfg, SAVE_PATH.format(guid=cfg.guid)), custom
                     ).properties["worldSaveData"]["value"]

    todos = secao_por_id(world, "ItemContainerSaveData")
    com_coisa = {gid: conteudo(e) for gid, e in todos.items()}
    com_coisa = {gid: itens for gid, itens in com_coisa.items() if itens}
    print(f"  ItemContainerSaveData: {len(todos)} containers, {len(com_coisa)} com conteúdo", flush=True)

    de_mapa = donos_pelos_mapobjects(world)
    print(f"  apontados por objeto de mapa (baú, fábrica): {len(de_mapa)}", flush=True)

    de_jogador, lidos = donos_pelos_players(cfg)
    print(f"  apontados por save individual: {len(de_jogador)} (de {lidos} jogadores lidos)", flush=True)

    orfaos = {gid: itens for gid, itens in com_coisa.items()
              if gid not in de_mapa and gid not in de_jogador and gid != ZERO_UID}
    orfaos = {g: i for g, i in orfaos.items() if len(i) >= args.minimo}

    print(f"\n  ➜ {len(orfaos)} containers COM CONTEÚDO e SEM DONO")
    if not orfaos:
        print("     Nenhum. O que sumiu não está mais no mundo — não há o que religar.")
        return 0

    for gid, itens in sorted(orfaos.items(), key=lambda kv: -len(kv[1]))[: args.mostrar]:
        total = sum(q for _, q in itens)
        print(f"\n    {gid}: {len(itens)} slots, {total} itens no total")
        for nome, qtd in itens[:12]:
            print(f"      {qtd:>5}x {nome}")
        if len(itens) > 12:
            print(f"      … e mais {len(itens) - 12} slots")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
