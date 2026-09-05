#!/usr/bin/env python3
"""
Compara a guild/base de um jogador entre o `Level.sav` atual e um backup
antigo do mesmo servidor — existe pra responder "a base sumiu por decay, ou
já não existia nem no backup de tal data?" com dado, não achismo.

Não grava nada. Baixa os dois arquivos por SFTP, decodifica só
GroupSaveDataMap e CharacterSaveParameterMap (mesma técnica do
`import_save.py`) e imprime o que acha do nome procurado nos dois.

Uso (variáveis de ambiente):
  PALLEIRA_SERVERS  JSON com a lista de servidores (mesmo formato do
                    import_save.py: slug, host, user, password, guid)
  SLUG              qual servidor (default: pve-free)
  NOME              nome do jogador a procurar (default: Tenshi)
  ARQUIVOS          nomes de arquivo dentro da pasta do save, separados por
                    vírgula (default: "Level.sav,Level.sav.bak-20260822-154657")
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


def norm_uid(value) -> str:
    return str(value).replace("-", "").upper()


def dig(node, *path, default=None):
    for key in path:
        if node is None:
            return default
        if isinstance(node, dict):
            node = node.get(key)
        else:
            return default
    return default if node is None else node


def scalar(node, default=None):
    for _ in range(6):
        if isinstance(node, dict) and "value" in node:
            node = node["value"]
        else:
            break
    if node is None or isinstance(node, (dict, list)):
        return default
    return node


def extract(world) -> dict:
    guilds: dict[str, dict] = {}
    players: dict[str, dict] = {}

    for entry in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        raw = dig(entry, "value", "RawData", "value", default={}) or {}
        if raw.get("group_type") != "EPalGroupType::Guild":
            continue
        gid = norm_uid(dig(entry, "key", default="") or raw.get("group_id", ""))
        members = raw.get("players") or []
        guilds[gid] = {
            "guild_id": gid,
            "name": (raw.get("guild_name") or "").strip() or "Guild sem nome",
            "bases": raw.get("base_ids") or [],
            "member_uids": [norm_uid(m.get("player_uid", "")) for m in members],
        }
        for member in members:
            uid = norm_uid(member.get("player_uid", ""))
            info = member.get("player_info") or {}
            p = players.setdefault(uid, {"uid": uid, "name": "", "guild_id": None, "pals": 0})
            p["guild_id"] = gid
            if info.get("player_name"):
                p["name"] = info["player_name"]
            if info.get("last_online_real_time"):
                p["last_online_real_time"] = info["last_online_real_time"]

    for entry in dig(world, "CharacterSaveParameterMap", "value", default=[]) or []:
        param = dig(entry, "value", "RawData", "value", "object", "SaveParameter", "value")
        if not isinstance(param, dict):
            continue
        if bool(scalar(param.get("IsPlayer"), False)):
            uid = norm_uid(scalar(dig(entry, "key", "PlayerUId"), ""))
            if not uid:
                continue
            p = players.setdefault(uid, {"uid": uid, "name": "", "guild_id": None, "pals": 0})
            name = scalar(param.get("NickName"), "")
            if name:
                p["name"] = str(name)
            p["level"] = int(scalar(param.get("Level"), 1) or 1)
        else:
            owner = norm_uid(scalar(param.get("OwnerPlayerUId"), ""))
            if owner and owner != "0" * 32:
                players.setdefault(owner, {"uid": owner, "name": "", "guild_id": None, "pals": 0})
                players[owner]["pals"] = players[owner].get("pals", 0) + 1

    return {"guilds": guilds, "players": players}


def fetch(sftp, guid: str, arquivo: str) -> bytes:
    buf = io.BytesIO()
    sftp.getfo(f"{SAVE_DIR.format(guid=guid)}/{arquivo}", buf)
    return buf.getvalue()


def analisar(raw: bytes, nome_procurado: str, custom) -> None:
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_TYPE_HINTS

    print(f"  save: {len(raw):,} bytes", flush=True)
    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    print(f"  descomprimido: {len(gvas_bytes):,} bytes", flush=True)

    started = time.time()
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    print(f"  parse: {time.time() - started:.0f}s", flush=True)

    world = gvas.properties["worldSaveData"]["value"]
    data = extract(world)

    achados = [p for p in data["players"].values() if nome_procurado.lower() in (p.get("name") or "").lower()]
    if not achados:
        print(f"  ✗ nenhum jogador com nome contendo '{nome_procurado}'")
        return

    for p in achados:
        print(f"  ✓ jogador: {p['name']} (uid={p['uid']}, level={p.get('level')}, pals={p.get('pals')})")
        gid = p.get("guild_id")
        if gid and gid in data["guilds"]:
            g = data["guilds"][gid]
            print(f"      guild: {g['name']} (guild_id={gid})")
            print(f"      bases (base_ids): {g['bases']}")
            print(f"      membros: {len(g['member_uids'])}")
        else:
            print("      sem guild associada nesse save")


def main() -> int:
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    raw_cfg = os.environ.get("PALLEIRA_SERVERS", "").strip()
    if not raw_cfg:
        sys.exit("PALLEIRA_SERVERS ausente")

    slug = os.environ.get("SLUG", "pve-free")
    nome = os.environ.get("NOME", "Tenshi")
    arquivos = [a.strip() for a in os.environ.get(
        "ARQUIVOS", "Level.sav,Level.sav.bak-20260822-154657"
    ).split(",") if a.strip()]

    servidores = json.loads(raw_cfg)
    cfg = next((s for s in servidores if s["slug"] == slug), servidores[0])

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
            analisar(raw, nome, custom)
    finally:
        transport.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
