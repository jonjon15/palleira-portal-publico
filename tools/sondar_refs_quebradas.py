#!/usr/bin/env python3
"""
Varre o mundo inteiro atrás de **referência quebrada**: objeto de mapa, base,
Pal ou jogador que aponta para um container que não existe mais no save.

Existe por causa do crash-loop do pve-free de 16/09/2026:
`EXCEPTION_ACCESS_VIOLATION reading address 0x88`, sempre com jogador
conectado, sobrevivendo horas quando o servidor está vazio. O `0x88` é leitura
de campo em ponteiro nulo — exatamente o que o Save Pal descreve em
`blueprint/capture.rs`:

    "a captured structure that references a container must ship with that
     container, or the game crashes dereferencing it"

Ou seja: o objeto é carregado quando um jogador chega perto, o jogo segue a
referência, acha nada, e morre. Um servidor vazio nunca carrega aquela região
— daí o crash depender de gente online.

Diferente de `sondar_base_refs.py`, que checa bases nomeadas à mão, aqui a
varredura é do save inteiro e sem lista prévia: qualquer `target_container_id`,
`container_id`, `PalStorageContainerId`, `OtomoCharacterContainerId` ou
`SlotID.ContainerId` que não case com uma entrada real é reportado.

Não grava nada.

Uso:
    python tools/sondar_refs_quebradas.py --servidor pve-free
    python tools/sondar_refs_quebradas.py --servidor pve-free --arquivo Level.sav.bak-...
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    ZERO_UID, baixar, coletar_guids, dig, entries_of, norm_uid, scalar,
    secao_por_id, servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/{arquivo}"

SECOES = (
    ".worldSaveData.MapObjectSaveData",
    ".worldSaveData.BaseCampSaveData",
    ".worldSaveData.ItemContainerSaveData",
    ".worldSaveData.CharacterContainerSaveData",
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
    ".worldSaveData.GroupSaveDataMap",
)

# Campos que guardam referência a container, em qualquer profundidade.
CAMPOS_ITEM = ("target_container_id", "container_id")
CAMPOS_CHAR = ("PalStorageContainerId", "OtomoCharacterContainerId")


def main() -> int:
    ap = argparse.ArgumentParser(description="Acha referências quebradas no Level.sav")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--arquivo", default="Level.sav",
                    help="Level.sav (padrão) ou um Level.sav.bak-* para comparar")
    args = ap.parse_args()

    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    caminho = SAVE_PATH.format(guid=cfg.guid, arquivo=args.arquivo)
    print(f"=== {cfg.slug} / {args.arquivo} ===", flush=True)

    t0 = time.time()
    bruto = baixar(cfg, caminho)
    print(f"  baixado:       {len(bruto):,} bytes em {time.time()-t0:.0f}s", flush=True)

    t0 = time.time()
    gvas_bytes, _ = decompress_sav_to_gvas(bruto)
    print(f"  descomprimido: {len(gvas_bytes):,} bytes em {time.time()-t0:.0f}s", flush=True)

    t0 = time.time()
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    world = gvas.properties["worldSaveData"]["value"]
    print(f"  parse:         {time.time()-t0:.0f}s\n", flush=True)

    # --- o que EXISTE -------------------------------------------------------
    itens = secao_por_id(world, "ItemContainerSaveData")
    chars = secao_por_id(world, "CharacterContainerSaveData")
    print(f"  ItemContainerSaveData:      {len(itens):,} containers")
    print(f"  CharacterContainerSaveData: {len(chars):,} containers", flush=True)

    quebradas: list[tuple[str, str, str]] = []  # (origem, campo, guid)
    contagem = Counter()

    # --- objetos de mapa (baús, fábricas, caixas de Pal) --------------------
    objetos = entries_of(dig(world, "MapObjectSaveData", default=None)) or []
    print(f"\n  varrendo {len(objetos):,} objetos de mapa...", flush=True)
    for obj in objetos:
        nome = scalar(dig(obj, "MapObjectId"), "") or scalar(dig(obj, "key", "MapObjectId"), "") or "?"
        for campo in CAMPOS_ITEM:
            for guid in coletar_guids(obj, campo):
                # 🔴 `target_container_id` aponta para QUALQUER um dos dois
                # tipos de container: um baú guarda itens, um PalBooth ou uma
                # esteira guardam Pals. Checar só ItemContainerSaveData dava
                # 5 falsos positivos (2 PalBooth, 3 DismantlingConveyor) na
                # primeira versão desta sonda, em 16/09/2026.
                if guid not in itens and guid not in chars:
                    quebradas.append((f"MapObject[{nome}]", campo, guid))
                    contagem[f"MapObject.{campo}"] += 1

    # --- bases --------------------------------------------------------------
    bases = entries_of(dig(world, "BaseCampSaveData", default=None)) or []
    print(f"  varrendo {len(bases):,} bases...", flush=True)
    for base in bases:
        bid = norm_uid(scalar(dig(base, "key"), "")) or "?"
        for campo in CAMPOS_ITEM:
            for guid in coletar_guids(base, campo):
                # Mesmo motivo do MapObject: o container pode ser de item ou
                # de personagem.
                if guid not in itens and guid not in chars:
                    quebradas.append((f"BaseCamp[{bid[:8]}]", campo, guid))
                    contagem[f"BaseCamp.{campo}"] += 1
        for campo in CAMPOS_CHAR:
            for guid in coletar_guids(base, campo):
                if guid not in chars:
                    quebradas.append((f"BaseCamp[{bid[:8]}]", campo, guid))
                    contagem[f"BaseCamp.{campo}"] += 1

    # --- personagens (jogadores e Pals) -------------------------------------
    personagens = entries_of(dig(world, "CharacterSaveParameterMap", default=None)) or []
    print(f"  varrendo {len(personagens):,} personagens...", flush=True)
    sem_container = 0
    for entrada in personagens:
        param = dig(entrada, "value", "RawData", "value", "object", "SaveParameter", "value")
        if not isinstance(param, dict):
            continue
        eh_jogador = bool(scalar(param.get("IsPlayer"), False))
        quem = scalar(param.get("NickName"), "") or scalar(param.get("CharacterID"), "") or "?"
        rotulo = f"{'Jogador' if eh_jogador else 'Pal'}[{quem}]"

        # Onde o Pal está guardado: SlotID -> ContainerId
        for guid in coletar_guids(entrada, "ContainerId"):
            if guid not in chars:
                quebradas.append((rotulo, "SlotID.ContainerId", guid))
                contagem["Character.SlotID.ContainerId"] += 1
                sem_container += 1

        for campo in CAMPOS_CHAR:
            for guid in coletar_guids(param, campo):
                if guid not in chars:
                    quebradas.append((rotulo, campo, guid))
                    contagem[f"Character.{campo}"] += 1

    # --- guildas ------------------------------------------------------------
    guildas = entries_of(dig(world, "GroupSaveDataMap", default=None)) or []
    print(f"  varrendo {len(guildas):,} guildas...", flush=True)
    for g in guildas:
        raw = dig(g, "value", "RawData", "value", default={}) or {}
        if raw.get("group_type") != "EPalGroupType::Guild":
            continue
        nome = raw.get("guild_name") or "?"
        for bid in (raw.get("base_ids") or []):
            alvo = norm_uid(bid)
            existe = any(norm_uid(scalar(dig(b, "key"), "")) == alvo for b in bases)
            if not existe and alvo and alvo != ZERO_UID:
                quebradas.append((f"Guild[{nome}]", "base_ids", alvo))
                contagem["Guild.base_ids"] += 1

    # --- relatório ----------------------------------------------------------
    print(f"\n{'='*70}")
    if not quebradas:
        print("  ✅ NENHUMA referência quebrada. O save está integro nesse aspecto.")
        return 0

    print(f"  ⚠️  {len(quebradas):,} REFERÊNCIAS QUEBRADAS encontradas\n")
    print("  Por tipo:")
    for tipo, n in contagem.most_common():
        print(f"    {n:>6,}  {tipo}")

    print(f"\n  Primeiras 40 (de {len(quebradas):,}):")
    for origem, campo, guid in quebradas[:40]:
        print(f"    {origem:<45} {campo:<28} -> {guid}")

    print(f"\n  🔴 Cada uma dessas é um ponteiro para o nada. Quando o jogo carrega")
    print(f"     o objeto e segue a referência, é EXCEPTION_ACCESS_VIOLATION.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
