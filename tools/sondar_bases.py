#!/usr/bin/env python3
"""
Sonda se `BaseCampSaveData`/`MapObjectSaveData` decodificam de verdade nesta
versão do `palsav-flex` — pergunta que precisa de resposta antes de escrever
qualquer script que reescreva base de jogador (§ restauração de base).

A lib ancestral (`palworld_save_tools` 0.24.0 do PyPI) marca
`BaseCampSaveData.Value.ModuleMap` e `MapObjectSaveData` como "quebrado em
versões mais novas" (`DISABLED_PROPERTIES`). Não sabemos se o fork usado aqui
já corrigiu isso — só um teste real no runner responde.

Estratégia: tenta decodificar com um conjunto de seções cada vez maior,
capturando a exceção de cada tentativa em vez de deixar a mais ambiciosa
derrubar tudo. Reporta até onde deu certo.

Não grava nada. Lê, mede e imprime.
"""

from __future__ import annotations

import io
import json
import os
import sys
import time

import paramiko

SAVE_DIR = "Pal/Saved/SaveGames/0/{guid}"

NIVEL_1 = (".worldSaveData.GroupSaveDataMap",)
NIVEL_2 = NIVEL_1 + (".worldSaveData.BaseCampSaveData.Value.RawData",)
NIVEL_3 = NIVEL_2 + (".worldSaveData.MapObjectSaveData",)
NIVEIS = [("GroupSaveDataMap só", NIVEL_1), ("+ BaseCampSaveData.RawData", NIVEL_2), ("+ MapObjectSaveData", NIVEL_3)]


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


def rotulo(node) -> str:
    if isinstance(node, dict):
        if "value" in node and len(node) <= 3:
            return f"{node.get('type', 'valor')} -> {rotulo(node['value'])}"
        return "{" + ", ".join(list(node)[:8]) + ("...}" if len(node) > 8 else "}")
    if isinstance(node, list):
        return f"lista[{len(node)}]" + (f" de {rotulo(node[0])}" if node else "")
    if isinstance(node, (bytes, bytearray)):
        return f"{len(node):,} bytes crus"
    return repr(node)[:70]


def fetch(sftp, guid: str, arquivo: str) -> bytes:
    buf = io.BytesIO()
    sftp.getfo(f"{SAVE_DIR.format(guid=guid)}/{arquivo}", buf)
    return buf.getvalue()


def procurar_base_camp(world, base_ids: set[str]) -> dict:
    achados = {}
    secao = dig(world, "BaseCampSaveData", "value", default=None)
    if secao is None:
        return achados
    # BaseCampSaveData é um MapProperty: lista de {key, value}.
    for entry in secao if isinstance(secao, list) else []:
        chave = norm_uid(dig(entry, "key", default=""))
        if chave in base_ids:
            achados[chave] = dig(entry, "value", "RawData", "value", default=entry.get("value"))
    return achados


def contar_map_objects(world, base_ids: set[str]) -> dict[str, int]:
    contagem = {b: 0 for b in base_ids}
    secao = dig(world, "MapObjectSaveData", "value", default=None)
    if not isinstance(secao, list):
        return contagem
    for entry in secao:
        # Estrutura ainda desconhecida nesta versão — procura qualquer campo
        # de string/uuid no entry que bata com uma das base_ids pedidas.
        texto = json.dumps(entry, default=str)
        for b in base_ids:
            if b.lower() in texto.lower() or b in texto:
                contagem[b] += 1
    return contagem


def analisar(raw: bytes, base_ids: set[str]) -> None:
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    print(f"  save: {len(raw):,} bytes", flush=True)
    gvas_bytes, tipo = decompress_sav_to_gvas(raw)
    print(f"  descomprimido: {len(gvas_bytes):,} bytes (tipo {tipo})", flush=True)

    ultimo_sucesso = None
    ultimo_world = None
    for nome, secoes in NIVEIS:
        custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in secoes}
        started = time.time()
        try:
            gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
            world = gvas.properties["worldSaveData"]["value"]
            print(f"  ✓ nível '{nome}' decodificou em {time.time() - started:.0f}s", flush=True)
            ultimo_sucesso = nome
            ultimo_world = world
        except Exception as err:  # noqa: BLE001 — queremos ver exatamente o que quebra
            print(f"  ✗ nível '{nome}' FALHOU: {type(err).__name__}: {err}", flush=True)
            break

    print(f"\n  melhor nível alcançado: {ultimo_sucesso}")
    if ultimo_world is None:
        return

    if "BaseCampSaveData" in json.dumps(list(ultimo_world.keys())):
        achados = procurar_base_camp(ultimo_world, base_ids)
        print(f"\n  BaseCampSaveData: {len(achados)}/{len(base_ids)} UUIDs pedidos encontrados")
        for uid, dados in achados.items():
            print(f"    {uid}: {rotulo(dados)}")
        faltando = base_ids - achados.keys()
        if faltando:
            print(f"    faltando: {faltando}")

    if "MapObjectSaveData" in ultimo_world:
        contagem = contar_map_objects(ultimo_world, base_ids)
        print(f"\n  MapObjectSaveData: entradas que citam cada base_id (heurística de texto)")
        for uid, n in contagem.items():
            print(f"    {uid}: {n} entradas")
        total = dig(ultimo_world, "MapObjectSaveData", "value", default=[])
        print(f"    total de entradas em MapObjectSaveData: {len(total) if isinstance(total, list) else '?'}")


def main() -> int:
    raw_cfg = os.environ.get("PALLEIRA_SERVERS", "").strip()
    if not raw_cfg:
        sys.exit("PALLEIRA_SERVERS ausente")

    slug = os.environ.get("SLUG", "pve-free")
    arquivos = [a.strip() for a in os.environ.get("ARQUIVOS", "Level.sav.bak-20260822-154657").split(",") if a.strip()]
    base_ids = {
        norm_uid(b.strip()) for b in os.environ.get(
            "BASE_IDS",
            "e71a3d75-c6fb-4eab-a4ba-20baaecd76c4,75eb802a-4842-8885-beb8-3eb76e6ef6ac,3f05b9ee-48ef-1eda-6ce5-c8b625cfb1e8",
        ).split(",")
        if b.strip()
    }

    servidores = json.loads(raw_cfg)
    cfg = next((s for s in servidores if s["slug"] == slug), servidores[0])

    print(f"procurando base_ids: {base_ids}\n")

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
            analisar(raw, base_ids)
    finally:
        transport.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
