#!/usr/bin/env python3
"""
Lista os jogadores das guildas que AINDA TEM BASE VIVA (sem decay) no
pve-free -- as 12 que o sondar_decay.py contou.

Para cada guilda: nome, ha quanto tempo parada, quantas bases, e os membros
com uid + nome. A saida serve de lista de trabalho para a restauracao no
mundo novo.

Nao grava nada.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
sys.path.insert(0, "tools")

from restaurar_base import (  # noqa: E402
    TICKS_POR_DIA, agora_na_escala_do_save, baixar, dig, norm_uid, servidores,
)

SAVE = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
NEEDED = (".worldSaveData.GroupSaveDataMap",)
LIMITE_H = 72.0


def main() -> int:
    cfg = servidores()["pve-free"]
    raw = baixar(cfg, SAVE.format(guid=cfg.guid))
    print(f"save: {len(raw):,} bytes", flush=True)

    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED}
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    world = gvas.properties["worldSaveData"]["value"]

    agora = agora_na_escala_do_save(world)

    linhas = []
    for e in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        rawg = dig(e, "value", "RawData", "value", default={}) or {}
        if rawg.get("group_type") != "EPalGroupType::Guild":
            continue
        bases = rawg.get("base_ids") or []
        if not bases:
            continue
        membros = rawg.get("players") or []
        ult = 0
        for m in membros:
            v = dig(m, "player_info", "last_online_real_time", default=0) or 0
            ult = max(ult, v)
        horas = (agora - ult) / TICKS_POR_DIA * 24 if ult else 9e9
        if horas > LIMITE_H:
            continue
        linhas.append({
            "nome": rawg.get("guild_name") or "?",
            "horas": horas,
            "bases": len(bases),
            "membros": [(norm_uid(str(dig(m, "player_uid", default=""))),
                         dig(m, "player_info", "player_name", default="?"))
                        for m in membros],
        })

    linhas.sort(key=lambda x: x["horas"])
    print()
    print("=" * 78)
    print(f"{len(linhas)} GUILDAS COM BASE VIVA (sem decay)")
    print("=" * 78)
    uids = []
    for g in linhas:
        print(f"\n[{g['horas']:6.1f}h parada]  {g['nome']}   ({g['bases']} base(s), {len(g['membros'])} membro(s))")
        for uid, nome in g["membros"]:
            print(f"     {uid}  {nome}")
            uids.append(uid)

    print()
    print("=" * 78)
    print(f"TOTAL: {len(uids)} jogadores em {len(linhas)} guildas")
    print("=" * 78)
    print("\nUIDs (um por linha):")
    for u in uids:
        print(u)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
