#!/usr/bin/env python3
"""
Sonda onde moram, de verdade, os containers de Pal de um jogador.

Existe porque `tools/restaurar_pals.py` copiava os Pals certo mas achava
`(vazio)` os dois containers: procurava `PalStorageContainerId` /
`OtomoCharacterContainerId` dentro do SaveParameter do jogador no `Level.sav`,
e o código-fonte do Save Pal (`player::container_id_from`, chamado com o
`SaveData` de `Players/<uid>.sav`) diz que esses campos moram no **save
individual do jogador**, não no mundo. Antes de reescrever o script de novo,
esta sondagem mede a forma real dos três lugares:

  1. o SaveParameter do jogador no `Level.sav` (tem ou não campo *Container*?);
  2. o `SlotID`/`SlotId` -> `ContainerId.ID` de cada Pal — o caminho que o Save
     Pal usa para saber em que container o Pal está (`base_container_membership`
     em guild.rs), e que permite deduzir os containers sem depender do
     `Players/<uid>.sav`;
  3. o `Players/<uid>.sav`, com dump cru dos dois campos.

Não grava nada. Lê, mede e imprime.

Uso:
    python tools/sondar_containers.py --servidor pve-free \
        --uids 21F2BD36...,502FCA99... \
        --arquivo-backup Level.sav.bak-20260905-172655
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    baixar, dig, norm_uid, scalar, servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
BACKUP_PATH = "Pal/Saved/SaveGames/0/{guid}/{arquivo}"
PLAYER_PATH = "Pal/Saved/SaveGames/0/{guid}/Players/{uid}.sav"

NEEDED_SECTIONS = (
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
    ".worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData",
)

ZERO = "0" * 32


# ------------------------------------------------------------------ impressão

def esboco(node, prof: int = 3, recuo: str = "      ") -> str:
    """Estrutura resumida de um nó, até `prof` níveis — dump cru, sem adivinhar
    caminho nenhum. É assim que se acha o nome real de um campo."""
    if prof <= 0:
        return f"{type(node).__name__}(...)"
    if isinstance(node, dict):
        partes = []
        for k, v in list(node.items())[:12]:
            partes.append(f"{recuo}  {k}: {esboco(v, prof - 1, recuo + '  ')}")
        extra = f"\n{recuo}  ...(+{len(node) - 12})" if len(node) > 12 else ""
        return "{\n" + "\n".join(partes) + extra + f"\n{recuo}}}"
    if isinstance(node, list):
        if not node:
            return "lista[0]"
        return f"lista[{len(node)}] primeiro=" + esboco(node[0], prof - 1, recuo + "  ")
    if isinstance(node, (bytes, bytearray)):
        return f"{len(node):,} bytes crus"
    return repr(node)[:80]


# ----------------------------------------------------------------- navegação

def personagens(world) -> list:
    return dig(world, "CharacterSaveParameterMap", "value", default=[]) or []


def param_de(entrada):
    return dig(entrada, "value", "RawData", "value", "object", "SaveParameter", "value")


def slot_do_pal(param: dict):
    """O struct de slot do Pal — a grafia muda entre versões do jogo."""
    for chave in ("SlotID", "SlotId"):
        if chave in param:
            return chave, param[chave]
    return None, None


def container_do_slot(slot) -> str:
    for caminho in (("value", "ContainerId", "value", "ID"),
                    ("value", "ContainerId", "ID"),
                    ("ContainerId", "value", "ID")):
        valor = scalar(dig(slot, *caminho, default=None), None)
        if valor:
            return norm_uid(valor)
    return ""


def containers_do_mundo(world) -> dict[str, dict]:
    """id -> {"slots": n, "ocupados": n} de CharacterContainerSaveData."""
    out = {}
    for entrada in dig(world, "CharacterContainerSaveData", "value", default=[]) or []:
        cid = norm_uid(scalar(dig(entrada, "key", "ID"), ""))
        if not cid:
            continue
        slots = dig(entrada, "value", "Slots", "value", "values", default=None)
        if slots is None:
            slots = dig(entrada, "value", "Slots", "value", default=None)
        slots = slots if isinstance(slots, list) else []
        ocupados = 0
        for s in slots:
            iid = norm_uid(scalar(dig(s, "RawData", "value", "instance_id"), "")
                           or scalar(dig(s, "IndividualId", "value", "InstanceId"), ""))
            if iid and iid != ZERO:
                ocupados += 1
        out[cid] = {"slots": len(slots), "ocupados": ocupados, "entrada": entrada}
    return out


# ------------------------------------------------------------------- sondagem

def sondar_mundo(rotulo: str, world, uids: list[str]) -> None:
    print(f"\n--- {rotulo} ---", flush=True)

    conts = containers_do_mundo(world)
    print(f"  CharacterContainerSaveData: {len(conts)} containers")
    exemplo = next(iter(conts.values()), None)
    if exemplo is not None:
        print("  forma de uma entrada de container:")
        print("      " + esboco(exemplo["entrada"], prof=5))

    todos = personagens(world)
    print(f"  CharacterSaveParameterMap: {len(todos)} entradas")

    for uid in uids:
        print(f"\n  == uid {uid} ==")
        jogador = None
        pals = []
        for entrada in todos:
            param = param_de(entrada)
            if not isinstance(param, dict):
                continue
            if scalar(param.get("IsPlayer"), False):
                if norm_uid(scalar(dig(entrada, "key", "PlayerUId"), "")) == uid:
                    jogador = param
            elif norm_uid(scalar(param.get("OwnerPlayerUId"), "")) == uid:
                pals.append(param)

        if jogador is None:
            print("    ✗ jogador não está neste save")
        else:
            chaves = sorted(jogador.keys())
            print(f"    SaveParameter do jogador: {len(chaves)} campos")
            print(f"      todos: {chaves}")
            com_container = [k for k in chaves if "ontainer" in k]
            print(f"      campos com 'Container' no nome: {com_container or 'NENHUM'}")
            for k in com_container:
                print(f"      {k} = " + esboco(jogador[k], prof=4))

        print(f"    Pals com OwnerPlayerUId = uid: {len(pals)}")
        if pals:
            chave_slot, slot = slot_do_pal(pals[0])
            print(f"      grafia do slot: {chave_slot or 'NENHUMA'}")
            if slot is not None:
                print("      forma do slot: " + esboco(slot, prof=5))
            por_container = Counter()
            sem_slot = 0
            for p in pals:
                _, s = slot_do_pal(p)
                cid = container_do_slot(s) if s is not None else ""
                if cid:
                    por_container[cid] += 1
                else:
                    sem_slot += 1
            print(f"      containers apontados pelos Pals ({len(por_container)}):")
            for cid, n in por_container.most_common():
                info = conts.get(cid)
                onde = (f"existe aqui: {info['ocupados']}/{info['slots']} slots ocupados"
                        if info else "NÃO existe em CharacterContainerSaveData deste save")
                print(f"        {cid}: {n} Pals — {onde}")
            if sem_slot:
                print(f"      Pals sem container legível: {sem_slot}")


def sondar_player_sav(cfg, uid: str, custom) -> None:
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_TYPE_HINTS

    caminho = PLAYER_PATH.format(guid=cfg.guid, uid=uid)
    print(f"\n--- Players/{uid}.sav ---", flush=True)
    try:
        raw = baixar(cfg, caminho)
    except FileNotFoundError:
        print("  ✗ não existe no servidor")
        return
    print(f"  {len(raw):,} bytes")
    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    save_data = dig(gvas.properties, "SaveData", "value", default=None)
    if not isinstance(save_data, dict):
        print("  ✗ SaveData não é struct: " + esboco(gvas.properties, prof=3))
        return
    print(f"  SaveData: {sorted(save_data.keys())}")
    for campo in ("PalStorageContainerId", "OtomoCharacterContainerId"):
        if campo in save_data:
            print(f"  {campo} = " + esboco(save_data[campo], prof=4))
        else:
            print(f"  {campo}: AUSENTE")
    if "InventoryInfo" in save_data:
        print("  InventoryInfo = " + esboco(save_data["InventoryInfo"], prof=4))


def main() -> int:
    ap = argparse.ArgumentParser(description="Sonda os containers de Pal de um jogador")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", required=True, help="UIDs (32 hex), separados por vírgula")
    ap.add_argument("--arquivo-backup", default="Level.sav.bak-20260905-172655")
    ap.add_argument("--pular-atual", action="store_true", help="não ler o Level.sav de hoje")
    args = ap.parse_args()

    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED_SECTIONS}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    uids = [norm_uid(u) for u in args.uids.split(",") if u.strip()]
    print(f"=== {cfg.slug} === uids: {uids}", flush=True)

    alvos = [] if args.pular_atual else [("Level.sav (hoje)", SAVE_PATH.format(guid=cfg.guid))]
    alvos.append((f"{args.arquivo_backup} (backup)",
                  BACKUP_PATH.format(guid=cfg.guid, arquivo=args.arquivo_backup)))

    for rotulo, caminho in alvos:
        try:
            raw = baixar(cfg, caminho)
        except FileNotFoundError:
            print(f"\n--- {rotulo} --- ✗ não existe no servidor")
            continue
        gvas_bytes, _ = decompress_sav_to_gvas(raw)
        gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
        sondar_mundo(rotulo, gvas.properties["worldSaveData"]["value"], uids)

    for uid in uids:
        sondar_player_sav(cfg, uid, {})

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
