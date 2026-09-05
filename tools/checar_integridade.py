#!/usr/bin/env python3
"""
Checagem de emergência: soma total de guildas, jogadores e base_ids em vários
arquivos de save, pra comparar antes/depois de uma gravação e confirmar que
nada além do esperado foi perdido. Só leitura.
"""
from __future__ import annotations

import io
import json
import os
import sys
import time

import paramiko

SAVE_DIR = "Pal/Saved/SaveGames/0/{guid}"

NEEDED_SECTIONS = (
    ".worldSaveData.GroupSaveDataMap",
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
)


def dig(node, *path, default=None):
    for key in path:
        if node is None:
            return default
        if isinstance(node, dict):
            node = node.get(key)
        else:
            return default
    return default if node is None else node


def fetch(sftp, guid: str, arquivo: str) -> bytes:
    buf = io.BytesIO()
    sftp.getfo(f"{SAVE_DIR.format(guid=guid)}/{arquivo}", buf)
    return buf.getvalue()


def resumo(raw: bytes, custom) -> None:
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_TYPE_HINTS

    print(f"  save: {len(raw):,} bytes", flush=True)
    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    world = gvas.properties["worldSaveData"]["value"]

    guilds = dig(world, "GroupSaveDataMap", "value", default=[]) or []
    n_guildas = 0
    n_bases_total = 0
    n_membros_total = 0
    for entry in guilds:
        raw_g = dig(entry, "value", "RawData", "value", default={}) or {}
        if raw_g.get("group_type") != "EPalGroupType::Guild":
            continue
        n_guildas += 1
        n_bases_total += len(raw_g.get("base_ids") or [])
        n_membros_total += len(raw_g.get("players") or [])

    chars = dig(world, "CharacterSaveParameterMap", "value", default=[]) or []
    n_personagens = 0
    n_pals = 0
    for entry in chars:
        param = dig(entry, "value", "RawData", "value", "object", "SaveParameter", "value")
        if not isinstance(param, dict):
            continue
        is_player = dig(param, "IsPlayer", "value", default=False)
        if is_player:
            n_personagens += 1
        else:
            n_pals += 1

    print(f"  guildas: {n_guildas}")
    print(f"  membros (somados em todas guildas): {n_membros_total}")
    print(f"  base_ids (somados em todas guildas): {n_bases_total}")
    print(f"  personagens (CharacterSaveParameterMap, IsPlayer): {n_personagens}")
    print(f"  pals (CharacterSaveParameterMap): {n_pals}")


def main() -> int:
    raw_cfg = os.environ.get("PALLEIRA_SERVERS", "").strip()
    if not raw_cfg:
        sys.exit("PALLEIRA_SERVERS ausente")
    slug = os.environ.get("SLUG", "pve-free")
    arquivos = [a.strip() for a in os.environ.get("ARQUIVOS", "Level.sav").split(",") if a.strip()]

    servidores = json.loads(raw_cfg)
    cfg = next((s for s in servidores if s["slug"] == slug), servidores[0])

    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES
    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED_SECTIONS}

    transport = paramiko.Transport((cfg["host"], 2022))
    transport.connect(username=cfg["user"], password=cfg["password"])
    try:
        sftp = paramiko.SFTPClient.from_transport(transport)
        for arquivo in arquivos:
            print(f"\n=== {cfg['slug']} / {arquivo} ===", flush=True)
            try:
                raw = fetch(sftp, cfg["guid"], arquivo)
            except FileNotFoundError:
                print("  ✗ arquivo não existe no servidor")
                continue
            t0 = time.time()
            resumo(raw, custom)
            print(f"  (levou {time.time()-t0:.0f}s)")
    finally:
        transport.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
