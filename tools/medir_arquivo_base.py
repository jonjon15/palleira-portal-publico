#!/usr/bin/env python3
"""
Mede quanto ocupa GUARDAR uma base fora do servidor.

A pergunta é do dono, em 06/09/2026: os backups do servidor rotacionam (a
API do painel mostra `backup_count: 0` — a rede de segurança é só a pasta
`backup/world/`, que se apaga sozinha). Se a base de alguém for guardada em
lugar nosso, ele recupera quando quiser, e não quando o backup permitir.

Antes de escolher onde guardar (banco, blob, release), é preciso saber o
tamanho. Este script recorta uma base do `Level.sav` — a entrada de
`BaseCampSaveData` mais cada peça de `MapObjectSaveData` que pertence a ela —
e mede o recorte em três formatos.

Não grava nada no servidor. Lê, mede e imprime.

Uso:
    python tools/medir_arquivo_base.py --servidor pve-free
"""

from __future__ import annotations

import argparse
import gzip
import os
import pickle
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    baixar, base_camp_entries, coletar_guids, dig, entries_of, norm_uid,
    servidores,
)
from sondar_inventario import ler_gvas  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

SECOES = (
    ".worldSaveData.GroupSaveDataMap",
    ".worldSaveData.BaseCampSaveData.Value.RawData",
    ".worldSaveData.MapObjectSaveData",
)


def main() -> int:
    ap = argparse.ArgumentParser(description="Mede o tamanho de guardar uma base")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--quantas", type=int, default=3,
                    help="quantas bases medir, das maiores para as menores")
    args = ap.parse_args()

    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    bruto = baixar(cfg, SAVE_PATH.format(guid=cfg.guid))
    world = ler_gvas(bruto, custom).properties["worldSaveData"]["value"]

    objetos = entries_of(dig(world, "MapObjectSaveData", default=None)) or []
    camps = base_camp_entries(world)
    print(f"=== {cfg.slug}: Level.sav {len(bruto):,} bytes comprimidos, "
          f"{len(camps)} base(s), {len(objetos):,} peça(s) ===")

    # peça -> base a que pertence
    por_base: dict[str, list] = {}
    for obj in objetos:
        for bid in coletar_guids(obj, "base_camp_id_belong_to"):
            por_base.setdefault(bid, []).append(obj)
            break

    ordenadas = sorted(por_base.items(), key=lambda kv: -len(kv[1]))[: args.quantas]

    for bid, pecas in ordenadas:
        entrada = next((e for e in camps if norm_uid(dig(e, "key", default="")) == bid), None)
        recorte = {"base": entrada, "pecas": pecas}
        cru = pickle.dumps(recorte, protocol=5)
        comprimido = gzip.compress(cru, 6)
        print(f"\n  base {bid[:8]}… — {len(pecas):,} peça(s)")
        print(f"    pickle:        {len(cru):>12,} bytes")
        print(f"    pickle+gzip:   {len(comprimido):>12,} bytes "
              f"({len(comprimido)/1_048_576:.2f} MB)")
        print(f"    por peça:      {len(comprimido)//max(len(pecas),1):>12,} bytes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
