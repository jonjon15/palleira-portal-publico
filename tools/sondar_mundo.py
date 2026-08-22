#!/usr/bin/env python3
"""
Sonda o `Level.sav` atrás dos pontos do mundo — dungeon, acampamento, torre.

Existe para responder UMA pergunta com número em vez de opinião: o nosso
próprio save já sabe onde ficam as dungeons? Se souber, a camada do mapa sai
da nossa fonte, sem depender de dataset de ninguém — e ainda por cima fica
**ao vivo**, mostrando o que está aberto no servidor da Palleira agora, que é
mais do que qualquer mapa estático mostra.

Não grava nada. Lê, mede e imprime.

⚠️ Roda no GitHub Actions pelo mesmo motivo do `import_save.py`: o save
descomprimido passa de 300 MB e o parser é Python (§3.8 do PROMPT.md).

⚠️ Lê o GVAS **sem custom properties**. É de propósito: o decodificador caro
é justamente o que estoura o tempo do runner, e para saber *o que existe* e
*se tem coordenada* basta a árvore comum — as seções pesadas ficam como bytes
crus e a gente só conta o tamanho delas.
"""

from __future__ import annotations

import io
import json
import os
import sys
import time

import paramiko

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

# O que interessa, e por quê. Os nomes vêm dos type hints do parser, que já
# mencionam DungeonSaveData — sinal de que a seção existe no formato.
ALVOS = (
    "DungeonSaveData",                   # as dungeons
    "DungeonPointMarkerSaveData",        # os marcadores de entrada, se existirem
    "EnemyCampSaveData",                 # acampamentos inimigos ("Camps")
    "MapObjectSpawnerInStageSaveData",   # spawners de objeto do mundo
    "OilrigSaveData",                    # plataformas
    "SupplySaveData",                    # supply drops
    "InvaderSaveData",                   # invasões
    "BaseCampSaveData",                  # bases — referência, já sabemos que tem
)

# Nome de campo que costuma carregar posição no GVAS do Palworld.
PISTAS_DE_POSICAO = ("location", "transform", "worldlocation", "pos", "translation")


def rotulo(node) -> str:
    """Descreve um nó do GVAS em uma linha, sem despejar a árvore inteira."""
    if isinstance(node, dict):
        if "value" in node and len(node) <= 3:
            return f"{node.get('type', 'valor')} → {rotulo(node['value'])}"
        return "{" + ", ".join(list(node)[:8]) + ("…}" if len(node) > 8 else "}")
    if isinstance(node, list):
        return f"lista[{len(node)}]" + (f" de {rotulo(node[0])}" if node else "")
    if isinstance(node, (bytes, bytearray)):
        return f"{len(node):,} bytes crus"
    return repr(node)[:70]


def procurar_posicao(node, caminho="", achados=None, profundidade=0):
    """Varre à procura de campo que cheire a coordenada. Para em 6 níveis."""
    if achados is None:
        achados = []
    if profundidade > 6 or len(achados) >= 6:
        return achados
    if isinstance(node, dict):
        for chave, valor in node.items():
            atual = f"{caminho}.{chave}"
            if any(p in str(chave).lower() for p in PISTAS_DE_POSICAO):
                achados.append((atual, rotulo(valor)))
            procurar_posicao(valor, atual, achados, profundidade + 1)
    elif isinstance(node, list) and node:
        procurar_posicao(node[0], f"{caminho}[0]", achados, profundidade + 1)
    return achados


def fetch_save(cfg: dict) -> bytes:
    transport = paramiko.Transport((cfg["host"], 2022))
    transport.connect(username=cfg["user"], password=cfg["password"])
    try:
        sftp = paramiko.SFTPClient.from_transport(transport)
        buf = io.BytesIO()
        sftp.getfo(SAVE_PATH.format(guid=cfg["guid"]), buf)
        return buf.getvalue()
    finally:
        transport.close()


def main() -> int:
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_TYPE_HINTS

    raw_cfg = os.environ.get("PALLEIRA_SERVERS", "").strip()
    if not raw_cfg:
        sys.exit("PALLEIRA_SERVERS ausente")

    alvo_slug = os.environ.get("SLUG", "pve-free")
    servidores = json.loads(raw_cfg)
    cfg = next((s for s in servidores if s["slug"] == alvo_slug), servidores[0])

    print(f"=== sondando {cfg['slug']} ===", flush=True)
    started = time.time()
    raw = fetch_save(cfg)
    print(f"  save: {len(raw):,} bytes", flush=True)

    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    print(f"  descomprimido: {len(gvas_bytes):,} bytes", flush=True)

    # Sem custom properties: rápido, e suficiente para inventariar.
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, {})
    print(f"  parse: {time.time() - started:.0f}s\n", flush=True)

    world = gvas.properties["worldSaveData"]["value"]
    print(f"worldSaveData tem {len(world)} seções:\n")
    for chave in sorted(world):
        marca = " ←" if chave in ALVOS else "  "
        print(f" {marca} {chave}: {rotulo(world[chave])}")

    print("\n" + "=" * 70)
    for chave in ALVOS:
        if chave not in world:
            print(f"\n### {chave}: NÃO EXISTE neste save")
            continue
        secao = world[chave]
        print(f"\n### {chave}")
        print(f"   forma: {rotulo(secao)}")
        posicoes = procurar_posicao(secao)
        if posicoes:
            print("   campos que parecem coordenada:")
            for caminho, desc in posicoes:
                print(f"     {caminho} = {desc}")
        else:
            print("   nenhum campo de posição visível na árvore comum")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
