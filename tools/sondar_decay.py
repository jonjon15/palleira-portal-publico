#!/usr/bin/env python3
"""
Mede se o `bAutoResetGuildNoOnlinePlayers` está mesmo apagando as bases das
guildas inativas — ou se a base restaurada some por outro motivo.

O teste é simples e não depende de teoria: se a limpeza de 72h fosse a causa,
**nenhuma** guild parada há mais de 72h teria base no save vivo. Se houver
dezenas delas com base intacta, a limpeza não é o que come a base do Tenshi, e
mexer no `PalWorldSettings.ini` seria tratar o sintoma errado.

A inatividade de cada guild é o `last_online_real_time` mais recente entre os
membros, comparado com o `GameTimeSaveData.RealDateTimeTicks` (o "agora" do
save, mesma escala — ver `agora_na_escala_do_save` em `restaurar_base.py`).

Não grava nada.

Uso:
    python tools/sondar_decay.py --servidor pve-free
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    TICKS_POR_DIA, agora_na_escala_do_save, baixar, dig, norm_uid, servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
BACKUP_PATH = "Pal/Saved/SaveGames/0/{guid}/{arquivo}"

NEEDED_SECTIONS = (".worldSaveData.GroupSaveDataMap",)

LIMITE_HORAS = 72.0  # AutoResetGuildTimeNoOnlinePlayers do pve-free


def guildas(world) -> list[dict]:
    out = []
    for entrada in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        raw = dig(entrada, "value", "RawData", "value", default={}) or {}
        if raw.get("group_type") != "EPalGroupType::Guild":
            continue
        membros = raw.get("players") or []
        ultimos = [int((m.get("player_info") or {}).get("last_online_real_time") or 0)
                   for m in membros]
        out.append({
            "nome": (raw.get("guild_name") or "").strip() or "(sem nome)",
            "id": norm_uid(entrada.get("key", "")),
            "bases": len(raw.get("base_ids") or []),
            "membros": len(membros),
            "ultimo": max(ultimos) if ultimos else 0,
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Mede a relação entre inatividade e base viva")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--arquivo", default="Level.sav", help="qual save ler (default: o vivo)")
    ap.add_argument("--guildas", default="", help="nomes a detalhar, separados por vírgula")
    args = ap.parse_args()

    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED_SECTIONS}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    caminho = (SAVE_PATH.format(guid=cfg.guid) if args.arquivo == "Level.sav"
               else BACKUP_PATH.format(guid=cfg.guid, arquivo=args.arquivo))
    raw = baixar(cfg, caminho)
    print(f"=== {cfg.slug} / {args.arquivo}: {len(raw):,} bytes", flush=True)
    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    world = gvas.properties["worldSaveData"]["value"]

    agora = agora_na_escala_do_save(world)
    print(f"  'agora' do save: {agora}")

    todas = guildas(world)
    limite = LIMITE_HORAS / 24.0
    com_base_paradas = []
    faixas = {"com base, ativa (<72h)": 0, "com base, parada (>72h)": 0,
              "sem base, ativa (<72h)": 0, "sem base, parada (>72h)": 0}

    for g in todas:
        dias = (agora - g["ultimo"]) / TICKS_POR_DIA if (agora and g["ultimo"]) else None
        parada = dias is None or dias > limite
        chave = ("com base" if g["bases"] else "sem base") + (", parada (>72h)" if parada else ", ativa (<72h)")
        faixas[chave] += 1
        if g["bases"] and parada:
            com_base_paradas.append((dias if dias is not None else 9e9, g))

    print(f"\n  {len(todas)} guildas no total:")
    for chave, n in faixas.items():
        print(f"    {chave}: {n}")

    print(f"\n  As 15 guildas com base MAIS paradas (se essa lista não estiver vazia,")
    print("  a limpeza de 72h não está apagando base de guild inativa):")
    for dias, g in sorted(com_base_paradas, reverse=True)[:15]:
        quanto = "sem registro de online" if dias > 1e8 else f"{dias:.1f}d parada"
        print(f"    {g['nome']}: {g['bases']} base(s), {g['membros']} membro(s), {quanto}")

    procurados = [n.strip().lower() for n in args.guildas.split(",") if n.strip()]
    if procurados:
        # A pergunta que sobra: a renovação do contador feita pelo
        # restaurar_base pegou? Se a guild aparece como ativa e mesmo assim
        # perdeu a base, o critério do jogo é outro campo.
        print("\n  Guildas pedidas:")
        for g in todas:
            if not any(p in g["nome"].lower() for p in procurados):
                continue
            dias = (agora - g["ultimo"]) / TICKS_POR_DIA if (agora and g["ultimo"]) else None
            quanto = "sem registro de online" if dias is None else f"{dias:.2f}d parada"
            print(f"    {g['nome']}: {g['bases']} base(s), {g['membros']} membro(s), "
                  f"{quanto} (last_online={g['ultimo']})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
