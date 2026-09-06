#!/usr/bin/env python3
"""
Sonda os containers de INVENTÁRIO de um jogador: mochila, equipamento, arma,
comida — os que o `Players/<uid>.sav` nomeia em `InventoryInfo`.

Existe porque em 05/09/2026, depois da restauração, o Tenshi apareceu sem
nenhum item. A restauração cuidou das caixas de Pal (`CharacterContainer`) mas
não dos containers de item do próprio jogador: o `Players/<uid>.sav` voltou do
backup apontando para containers que o servidor já tinha apagado do
`Level.sav`. Ponteiro para container que não existe = mochila vazia.

Compara os três lugares para dizer de onde dá para trazer de volta:
o save individual (quem são os containers), o `Level.sav` vivo (o que existe
hoje) e cada backup (onde ainda há conteúdo).

Não grava nada.

Uso:
    python tools/sondar_inventario.py --servidor pve-free --uids 21F2BD36...
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    ZERO_UID, baixar, candidatos_a_backup, coletar_guids, dig, entries_of,
    norm_uid, scalar, secao_por_id, servidores,
)
from sondar_containers import esboco  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
PLAYER_PATH = "Pal/Saved/SaveGames/0/{guid}/Players/{uid}.sav"

# Os seis containers de inventário que o Save Pal lê em `player_container_ids`
# (transfer.rs), mais os dois de Pal — todos moram no save individual.
CAMPOS_DE_CONTAINER = (
    "CommonContainerId",          # mochila
    "DropSlotContainerId",        # o que cai ao morrer
    "EssentialContainerId",       # itens-chave
    "WeaponLoadOutContainerId",   # armas
    "PlayerEquipArmorContainerId",  # armadura
    "FoodEquipContainerId",       # comida equipada
    "PalStorageContainerId",      # Pal Box
    "OtomoCharacterContainerId",  # party
)

SECOES_MUNDO = (
    ".worldSaveData.ItemContainerSaveData.Value.RawData",
    ".worldSaveData.ItemContainerSaveData.Value.Slots.Slots.RawData",
    ".worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData",
)


def ler_gvas(raw: bytes, custom):
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_TYPE_HINTS

    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    return GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)


def containers_do_jogador(cfg, uid: str) -> dict[str, str]:
    """campo -> GUID, lido do `Players/<uid>.sav`."""
    raw = baixar(cfg, PLAYER_PATH.format(guid=cfg.guid, uid=uid))
    props = ler_gvas(raw, {}).properties
    save_data = dig(props, "SaveData", "value", default=None)
    achados: dict[str, str] = {}
    for campo in CAMPOS_DE_CONTAINER:
        for gid in coletar_guids(save_data if save_data is not None else props, campo, prof=12):
            achados[campo] = gid
    if not achados:
        # Dump cru em vez de adivinhar de novo — foi assim que se achou o
        # `base_camp_id_belong_to` e o `SlotId.ContainerId`.
        print(f"  raiz do save individual: {sorted(props)}")
        if isinstance(save_data, dict):
            print(f"  SaveData tem {len(save_data)} campos: {sorted(save_data)}")
            for chave in sorted(save_data):
                if "ontainer" in chave or "nventor" in chave:
                    print(f"  {chave} = " + esboco(save_data[chave], prof=6))
        else:
            print("  SaveData não é struct: " + esboco(props, prof=4))
    return achados


def slots_com_coisa(entrada) -> tuple[int, int]:
    """(ocupados, total) de um container — serve para item e para personagem."""
    slots = dig(entrada, "value", "Slots", "value", "values", default=None)
    if not isinstance(slots, list):
        slots = dig(entrada, "value", "Slots", "value", default=None)
    if not isinstance(slots, list):
        return 0, 0
    ocupados = 0
    for s in slots:
        raw = dig(s, "RawData", "value", default={})
        if not isinstance(raw, dict):
            continue
        if raw.get("count") and int(scalar(raw.get("count"), 0) or 0) > 0:
            ocupados += 1
            continue
        iid = norm_uid(scalar(raw.get("instance_id"), ""))
        if iid and iid != ZERO_UID:
            ocupados += 1
    return ocupados, len(slots)


def olhar(rotulo: str, world, alvos: dict[str, str]) -> int:
    itens = secao_por_id(world, "ItemContainerSaveData")
    chars = secao_por_id(world, "CharacterContainerSaveData")
    print(f"\n--- {rotulo} ---")
    print(f"  ItemContainerSaveData: {len(itens)} | CharacterContainerSaveData: {len(chars)}")
    total_com_coisa = 0
    for campo, gid in alvos.items():
        entrada = itens.get(gid) or chars.get(gid)
        if entrada is None:
            print(f"    {campo} ({gid[:8]}…): ❌ NÃO EXISTE aqui")
            continue
        ocupados, total = slots_com_coisa(entrada)
        total_com_coisa += ocupados
        marca = "✓" if ocupados else "vazio"
        print(f"    {campo} ({gid[:8]}…): {marca} — {ocupados}/{total} slots com coisa")
    print(f"  → total de slots com conteúdo: {total_com_coisa}")
    return total_com_coisa


def main() -> int:
    ap = argparse.ArgumentParser(description="Sonda os containers de inventário de um jogador")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", required=True)
    ap.add_argument("--limite", type=int, default=6, help="quantos backups olhar")
    args = ap.parse_args()

    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES_MUNDO}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    for uid in [norm_uid(u) for u in args.uids.split(",") if u.strip()]:
        print(f"\n================ uid {uid} ================", flush=True)
        try:
            alvos = containers_do_jogador(cfg, uid)
        except FileNotFoundError:
            print("  ✗ Players/<uid>.sav não existe — sem ele nem dá para saber quais são os containers")
            continue
        if not alvos:
            print("  ✗ o save individual não tem nenhum campo *ContainerId legível")
            continue
        print("  containers que o save individual aponta:")
        for campo, gid in alvos.items():
            print(f"    {campo} = {gid}")

        world = ler_gvas(baixar(cfg, SAVE_PATH.format(guid=cfg.guid)), custom
                         ).properties["worldSaveData"]["value"]
        olhar("Level.sav (hoje)", world, alvos)

        for nome in candidatos_a_backup(cfg)[: args.limite]:
            caminho = f"Pal/Saved/SaveGames/0/{cfg.guid}/{nome}"
            try:
                w = ler_gvas(baixar(cfg, caminho), custom).properties["worldSaveData"]["value"]
            except Exception as err:  # noqa: BLE001
                print(f"\n--- {nome} --- não deu para ler ({type(err).__name__})")
                continue
            olhar(nome, w, alvos)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
