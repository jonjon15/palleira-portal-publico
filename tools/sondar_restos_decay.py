#!/usr/bin/env python3
"""
Procura **restos de guilda comida pelo decay**: objeto, base, worker ou Pal
que continua no mundo apontando para uma guilda ou base que já não existe.

Hipótese do dono do servidor, 17/09/2026, e ela explica o que as outras
sondas não explicavam: o `EXCEPTION_ACCESS_VIOLATION 0x88` acontece no
carregamento do mundo, sem depender de jogador online, e o `Level.sav` passa
em todas as checagens de container. Se o decay apagou a guilda mas deixou uma
peça apontando para ela, o jogo segue esse ponteiro ao montar o mundo e morre.

No pve-free são 239 grupos sem base e parados há mais de 72 h — bastante
oportunidade de ter sobrado sujeira.

Diferente das outras sondas:
  - `sondar_refs_quebradas.py` olha `target_container_id`/`container_id`
  - `sondar_orfaos.py` olha container SEM dono
  - aqui olha o inverso: quem aponta para **guilda/base que sumiu**

Checa, contra os ids que existem de verdade:
  - `BaseCampSaveData` → `group_id_belong_to` (guilda da base)
  - `GroupSaveDataMap` → `base_ids` (bases da guilda)
  - `MapObjectSaveData` → `group_id_belong_to`, `base_camp_id_belong_to`
  - `WorkSaveData` → `base_camp_id_belong_to`
  - `CharacterSaveParameterMap` → `group_id_belong_to`, `base_camp_id_belong_to`

Não grava nada.

Uso:
    python tools/sondar_restos_decay.py --servidor pve-free
    python tools/sondar_restos_decay.py --servidor pve-free --arquivo Level.sav.bak-...
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    ZERO_UID, baixar, coletar_guids, dig, entries_of, norm_uid, scalar,
    servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/{arquivo}"

SECOES = (
    ".worldSaveData.MapObjectSaveData",
    ".worldSaveData.BaseCampSaveData",
    ".worldSaveData.BaseCampSaveData.Value.RawData",
    ".worldSaveData.BaseCampSaveData.Value.WorkerDirector.RawData",
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
    ".worldSaveData.GroupSaveDataMap",
    ".worldSaveData.WorkSaveData",
)

CAMPOS_GUILDA = ("group_id_belong_to", "GroupID", "group_id")
CAMPOS_BASE = ("base_camp_id_belong_to", "BaseCampId", "base_camp_id")


def ids_existentes(world) -> tuple[set, set]:
    """Os ids de guilda e de base que realmente existem no save."""
    guildas, bases = set(), set()

    for entrada in entries_of(world, "GroupSaveDataMap"):
        gid = norm_uid(scalar(dig(entrada, "key"), ""))
        if gid:
            guildas.add(gid)
        raw = dig(entrada, "value", "RawData", "value", default={}) or {}
        for bid in raw.get("base_ids") or []:
            b = norm_uid(str(bid))
            if b:
                bases.add(b)

    # a base existe de fato se tem entrada própria em BaseCampSaveData
    bases_reais = set()
    for entrada in entries_of(world, "BaseCampSaveData"):
        bid = norm_uid(scalar(dig(entrada, "key"), ""))
        if bid:
            bases_reais.add(bid)

    return guildas, bases_reais


def main() -> int:
    ap = argparse.ArgumentParser(description="Acha restos de guilda/base apagada pelo decay")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--arquivo", default="Level.sav")
    args = ap.parse_args()

    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    caminho = SAVE_PATH.format(guid=cfg.guid, arquivo=args.arquivo)
    print(f"=== {args.servidor} / {args.arquivo} ===", flush=True)
    raw = baixar(cfg, caminho)
    print(f"  baixado: {len(raw):,} bytes", flush=True)

    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    world = gvas.properties["worldSaveData"]["value"]

    guildas, bases = ids_existentes(world)
    print(f"  guildas existentes: {len(guildas):,}")
    print(f"  bases existentes:   {len(bases):,}\n", flush=True)

    quebradas: list[tuple[str, str, str]] = []
    contagem: Counter[str] = Counter()

    def checar(rotulo: str, no, campos: tuple, universo: set, tipo: str) -> None:
        for campo in campos:
            for gid in coletar_guids(no, campo):
                if not gid or gid == ZERO_UID:
                    continue
                if gid not in universo:
                    quebradas.append((rotulo, f"{campo} ({tipo})", gid))
                    contagem[f"{rotulo.split('[')[0]}.{campo}"] += 1

    objetos = entries_of(world, "MapObjectSaveData")
    print(f"  varrendo {len(objetos):,} objetos de mapa...", flush=True)
    for obj in objetos:
        nome = scalar(dig(obj, "MapObjectId"), "") or "?"
        checar(f"MapObject[{nome}]", obj, CAMPOS_GUILDA, guildas, "guilda")
        checar(f"MapObject[{nome}]", obj, CAMPOS_BASE, bases, "base")

    camps = entries_of(world, "BaseCampSaveData")
    print(f"  varrendo {len(camps):,} bases...", flush=True)
    for base in camps:
        bid = norm_uid(scalar(dig(base, "key"), "")) or "?"
        checar(f"BaseCamp[{bid[:8]}]", base, CAMPOS_GUILDA, guildas, "guilda")

    grupos = entries_of(world, "GroupSaveDataMap")
    print(f"  varrendo {len(grupos):,} guildas...", flush=True)
    for entrada in grupos:
        gid = norm_uid(scalar(dig(entrada, "key"), "")) or "?"
        raw_g = dig(entrada, "value", "RawData", "value", default={}) or {}
        for bid in raw_g.get("base_ids") or []:
            b = norm_uid(str(bid))
            if b and b != ZERO_UID and b not in bases:
                quebradas.append((f"Guild[{gid[:8]}]", "base_ids (base)", b))
                contagem["Guild.base_ids"] += 1

    works = entries_of(world, "WorkSaveData")
    print(f"  varrendo {len(works):,} trabalhos...", flush=True)
    for w in works:
        checar("Work", w, CAMPOS_BASE, bases, "base")

    chars = entries_of(world, "CharacterSaveParameterMap")
    print(f"  varrendo {len(chars):,} personagens...", flush=True)
    for c in chars:
        checar("Character", c, CAMPOS_GUILDA, guildas, "guilda")
        checar("Character", c, CAMPOS_BASE, bases, "base")

    print()
    print("=" * 70)
    if not quebradas:
        print("  ✅ Nenhum resto de guilda/base apagada.")
        return 0

    print(f"  ⚠️  {len(quebradas):,} REFERÊNCIAS A GUILDA/BASE QUE NÃO EXISTE")
    print()
    print("  Por tipo:")
    for chave, qtd in contagem.most_common():
        print(f"    {qtd:7,}  {chave}")

    print(f"\n  Primeiras 40 (de {len(quebradas):,}):")
    for rotulo, campo, gid in quebradas[:40]:
        print(f"    {rotulo:<44} {campo:<30} -> {gid}")

    alvos = Counter(g for _, _, g in quebradas)
    print(f"\n  Alvos distintos: {len(alvos):,}")
    for gid, qtd in alvos.most_common(20):
        print(f"    {qtd:6,}x  {gid}")

    print()
    print("  🔴 Cada uma dessas é um ponteiro para o nada. Quando o jogo monta")
    print("     o mundo e segue a referência, é EXCEPTION_ACCESS_VIOLATION.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
