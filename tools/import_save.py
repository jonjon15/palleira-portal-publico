#!/usr/bin/env python3
"""
Robô de import do save da Palleira (§3.8 do PROMPT.md).

Roda no GitHub Actions, não na Vercel: o `.sav` é comprimido com Oodle e, ao
parsear, vira centenas de MB — não cabe numa função serverless, e o parser é
Python.

O que faz, por servidor:
  1. baixa Level.sav por SFTP (porta 2022 — SFTP, não FTP simples)
  2. descomprime o container PlM (Oodle/Kraken) via ooz
  3. lê o GVAS e extrai jogadores e guilds
  4. grava no Neon

⚠️ Nunca baixar a pasta Players/ inteira: no PVE VIP ela tem 394 MB.
O Level.sav já traz jogador, guild e contagem de Pal.
"""

from __future__ import annotations

import ctypes
import io
import json
import os
import struct
import sys
import time
from dataclasses import dataclass, field

import paramiko
import psycopg

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"


@dataclass
class ServerCfg:
    slug: str
    host: str
    user: str
    password: str
    guid: str


@dataclass
class Guild:
    guild_id: str
    name: str
    bases: int = 0
    pals: int = 0
    members: int = 0


@dataclass
class Player:
    uid: str
    name: str = ""
    level: int = 0
    guild_id: str | None = None
    pals: int = 0
    last_online: int | None = None


@dataclass
class Extract:
    players: dict[str, Player] = field(default_factory=dict)
    guilds: dict[str, Guild] = field(default_factory=dict)


# --------------------------------------------------------------- descompressão

def decompress_plm(raw: bytes) -> bytes:
    """
    Container do Palworld: [tamanho_descomprimido u32][tamanho_comprimido u32]
    [magic 3 bytes][tipo 1 byte][payload].

    PlZ = zlib (formato antigo). PlM = Oodle/Kraken, usado desde a v0.6.
    Para PlM chamamos o `ooz`, um descompressor Kraken open source — a gente
    só lê o save, então descompressão basta.
    """
    if len(raw) < 12:
        raise ValueError("arquivo pequeno demais para ser um save")

    uncompressed_len, compressed_len = struct.unpack_from("<II", raw, 0)
    magic = raw[8:11]
    save_type = raw[11]
    payload = raw[12:]

    if magic == b"PlZ":
        import zlib

        data = zlib.decompress(payload)
        # tipo 0x31 = comprimido duas vezes
        return zlib.decompress(data) if save_type == 0x31 else data

    if magic != b"PlM":
        raise ValueError(f"magic desconhecido: {magic!r}")

    if len(payload) < compressed_len:
        raise ValueError(
            f"payload truncado: {len(payload)} < {compressed_len} declarados"
        )

    out = run_ooz(payload[:compressed_len], uncompressed_len)
    if save_type == 0x32:  # duplamente comprimido
        inner_uncompressed, inner_compressed = struct.unpack_from("<II", out, 0)
        out = run_ooz(out[12 : 12 + inner_compressed], inner_uncompressed)
    return out


# O descompressor Kraken é carregado uma vez e reaproveitado entre servidores.
_OOZ: ctypes.CDLL | None = None

# Kraken escreve um pouco além do fim do buffer; o próprio ooz reserva 64 bytes.
SAFE_SPACE = 64


def _ooz_lib() -> ctypes.CDLL:
    global _OOZ
    if _OOZ is None:
        path = os.environ.get("OOZ_LIB", "/tmp/libooz.so")
        _OOZ = ctypes.CDLL(path)
        _OOZ.ooz_decompress.argtypes = [
            ctypes.c_char_p,
            ctypes.c_size_t,
            ctypes.c_char_p,
            ctypes.c_size_t,
        ]
        _OOZ.ooz_decompress.restype = ctypes.c_int
    return _OOZ


def run_ooz(payload: bytes, expected_len: int) -> bytes:
    """Descomprime um bloco Kraken chamando a lib compilada pelo workflow."""
    dst = ctypes.create_string_buffer(expected_len + SAFE_SPACE)
    written = _ooz_lib().ooz_decompress(payload, len(payload), dst, expected_len)
    if written != expected_len:
        raise RuntimeError(
            f"Kraken devolveu {written} bytes, esperado {expected_len}"
        )
    return dst.raw[:expected_len]


# ------------------------------------------------------------------ extração

def norm_uid(value) -> str:
    """PlayerUId vira hex maiúsculo sem hífen — o mesmo formato do playerId da API."""
    return str(value).replace("-", "").upper()


def dig(node, *path, default=None):
    """Anda pela árvore do GVAS, que aninha tudo em {'value': ...}."""
    for key in path:
        if node is None:
            return default
        if isinstance(node, dict):
            node = node.get(key)
        else:
            return default
    return default if node is None else node


def extract(world) -> Extract:
    out = Extract()

    # ---- guilds (GroupSaveDataMap) -------------------------------------
    for entry in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        raw = dig(entry, "value", "RawData", "value", default={}) or {}
        if raw.get("group_type") != "EPalGroupType::Guild":
            continue
        gid = norm_uid(dig(entry, "key", default="") or raw.get("group_id", ""))
        members = raw.get("players") or []
        guild = Guild(
            guild_id=gid,
            name=(raw.get("guild_name") or "").strip() or "Guild sem nome",
            bases=len(raw.get("base_ids") or []),
            members=len(members),
        )
        out.guilds[gid] = guild

        for member in members:
            uid = norm_uid(member.get("player_uid", ""))
            info = member.get("player_info") or {}
            player = out.players.setdefault(uid, Player(uid=uid))
            player.guild_id = gid
            if info.get("player_name"):
                player.name = info["player_name"]
            if info.get("last_online_real_time"):
                player.last_online = info["last_online_real_time"]

    # ---- jogadores e Pals (CharacterSaveParameterMap) -------------------
    for entry in dig(world, "CharacterSaveParameterMap", "value", default=[]) or []:
        param = dig(
            entry, "value", "RawData", "value", "object", "SaveParameter", "value"
        )
        if not isinstance(param, dict):
            continue

        is_player = bool(dig(param, "IsPlayer", "value", default=False))
        if is_player:
            uid = norm_uid(dig(entry, "key", "PlayerUId", "value", default=""))
            if not uid:
                continue
            player = out.players.setdefault(uid, Player(uid=uid))
            name = dig(param, "NickName", "value", default="")
            if name:
                player.name = name
            player.level = int(dig(param, "Level", "value", default=1) or 1)
        else:
            owner = norm_uid(dig(param, "OwnerPlayerUId", "value", default=""))
            if owner and owner != "0" * 32:
                out.players.setdefault(owner, Player(uid=owner)).pals += 1

    # Pals por guild = soma dos Pals dos membros
    for player in out.players.values():
        if player.guild_id and player.guild_id in out.guilds:
            out.guilds[player.guild_id].pals += player.pals

    return out


# ------------------------------------------------------------------- gravação

def save_to_db(conn, slug: str, data: Extract) -> None:
    with conn.cursor() as cur:
        for g in data.guilds.values():
            cur.execute(
                """
                insert into guilds
                  (server_slug, guild_id, name, base_count, pal_count, member_count, updated_at)
                values (%s, %s, %s, %s, %s, %s, now())
                on conflict (server_slug, guild_id) do update set
                  name = excluded.name,
                  base_count = excluded.base_count,
                  pal_count = excluded.pal_count,
                  member_count = excluded.member_count,
                  updated_at = now()
                """,
                (slug, g.guild_id, g.name, g.bases, g.pals, g.members),
            )

        for p in data.players.values():
            cur.execute(
                """
                insert into players
                  (server_slug, palworld_uid, name, level, guild_id, pal_count, updated_at)
                values (%s, %s, %s, %s, %s, %s, now())
                on conflict (server_slug, palworld_uid) do update set
                  name = case when excluded.name <> '' then excluded.name else players.name end,
                  level = greatest(players.level, excluded.level),
                  guild_id = excluded.guild_id,
                  pal_count = excluded.pal_count,
                  updated_at = now()
                """,
                (slug, p.uid, p.name, p.level, p.guild_id, p.pals),
            )
            # histórico enxuto: uma linha por jogador por dia (§7.9)
            cur.execute(
                """
                insert into player_daily (server_slug, palworld_uid, day, level, pal_count)
                values (%s, %s, current_date, %s, %s)
                on conflict (server_slug, palworld_uid, day) do update set
                  level = greatest(player_daily.level, excluded.level),
                  pal_count = excluded.pal_count
                """,
                (slug, p.uid, p.level, p.pals),
            )
    conn.commit()


def log_import(conn, slug: str, ok: bool, message: str, stats: dict, ms: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into imports (server_slug, source, ok, message, stats, duration_ms)
            values (%s, 'save', %s, %s, %s, %s)
            """,
            (slug, ok, message[:500], json.dumps(stats), ms),
        )
    conn.commit()


# ---------------------------------------------------------------------- main

def fetch_save(cfg: ServerCfg) -> bytes:
    transport = paramiko.Transport((cfg.host, 2022))
    transport.connect(username=cfg.user, password=cfg.password)
    try:
        sftp = paramiko.SFTPClient.from_transport(transport)
        buf = io.BytesIO()
        sftp.getfo(SAVE_PATH.format(guid=cfg.guid), buf)
        return buf.getvalue()
    finally:
        transport.close()


def servers_from_env() -> list[ServerCfg]:
    raw = os.environ.get("PALLEIRA_SERVERS", "").strip()
    if not raw:
        sys.exit("PALLEIRA_SERVERS ausente (JSON com a lista de servidores)")
    return [ServerCfg(**item) for item in json.loads(raw)]


# Só estas duas seções são decodificadas de verdade. Todo o resto do save
# (mapa, objetos, itens do mundo) fica como bytes crus — é o que faz o parse
# caber no tempo: decodificar o save inteiro estourou 20 minutos no runner.
NEEDED_SECTIONS = (
    ".worldSaveData.GroupSaveDataMap",  # guilds e membros
    ".worldSaveData.CharacterSaveParameterMap",  # jogadores e Pals
)


def main() -> int:
    from palworld_save_tools.gvas import GvasFile
    from palworld_save_tools.paltypes import (
        PALWORLD_CUSTOM_PROPERTIES,
        PALWORLD_TYPE_HINTS,
    )

    custom = {
        key: value
        for key, value in PALWORLD_CUSTOM_PROPERTIES.items()
        if key in NEEDED_SECTIONS
    }
    print(f"decodificando {len(custom)} de {len(PALWORLD_CUSTOM_PROPERTIES)} seções")

    conn = psycopg.connect(os.environ["DATABASE_URL"])
    failures = 0

    for cfg in servers_from_env():
        started = time.time()
        print(f"\n=== {cfg.slug} ===", flush=True)
        try:
            raw = fetch_save(cfg)
            print(f"  save: {len(raw):,} bytes", flush=True)

            gvas_bytes = decompress_plm(raw)
            print(f"  descomprimido: {len(gvas_bytes):,} bytes", flush=True)

            parse_started = time.time()
            gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
            print(f"  parse: {time.time() - parse_started:.0f}s", flush=True)
            world = gvas.properties["worldSaveData"]["value"]
            data = extract(world)

            stats = {
                "players": len(data.players),
                "guilds": len(data.guilds),
                "pals": sum(p.pals for p in data.players.values()),
                "save_bytes": len(raw),
            }
            save_to_db(conn, cfg.slug, data)
            ms = int((time.time() - started) * 1000)
            log_import(conn, cfg.slug, True, "ok", stats, ms)
            print(f"  ✓ {stats} em {ms}ms", flush=True)
        except Exception as err:  # noqa: BLE001 — queremos seguir para o próximo
            failures += 1
            ms = int((time.time() - started) * 1000)
            print(f"  ✗ {type(err).__name__}: {err}", flush=True)
            try:
                log_import(conn, cfg.slug, False, f"{type(err).__name__}: {err}", {}, ms)
            except Exception:
                pass

    conn.close()
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
