#!/usr/bin/env python3
"""
Converte o `Level.sav` em JSON — e, se o arquivo estiver corrompido, diz
exatamente onde o parser parou.

Existe por causa do crash-loop do pve-free de 16/09/2026: o
`EXCEPTION_ACCESS_VIOLATION` não deixa rastro no log, então a única forma de
achar dado inválido é forçar um parser a percorrer o arquivo inteiro. Um
resumo (como o `checar_integridade.py` faz) lê só algumas seções; a conversão
completa para JSON toca em tudo.

🔴 Dois níveis de leitura, de propósito:

1. **sem custom properties** — a árvore comum do GVAS. Se quebrar aqui, a
   corrupção é estrutural e grave.
2. **com TODAS as custom properties** — decodifica as seções pesadas
   (personagens, containers, objetos de mapa). É aqui que um registro
   inválido aparece, e é o que o `checar_integridade.py` não cobre porque
   carrega só duas seções.

Na falha, imprime o traceback inteiro e a seção em que estava — é isso que
aponta o dado ruim.

Não grava nada no servidor.

Uso:
    python tools/converter_save_json.py --servidor pve-free
    python tools/converter_save_json.py --servidor pve-free --salvar-json saida.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import baixar, servidores  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/{arquivo}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Converte o save em JSON e acha corrupção")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--arquivo", default="Level.sav")
    ap.add_argument("--salvar-json", default="",
                    help="caminho para gravar o JSON (cuidado: centenas de MB)")
    args = ap.parse_args()

    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    caminho = SAVE_PATH.format(guid=cfg.guid, arquivo=args.arquivo)
    print(f"=== {cfg.slug} / {args.arquivo} ===", flush=True)

    t0 = time.time()
    bruto = baixar(cfg, caminho)
    print(f"  baixado:       {len(bruto):,} bytes em {time.time()-t0:.0f}s", flush=True)

    # ---- descompressão -----------------------------------------------------
    t0 = time.time()
    try:
        gvas_bytes, tipo = decompress_sav_to_gvas(bruto)
    except Exception:
        print("\n  ❌ FALHOU NA DESCOMPRESSÃO — o arquivo está corrompido no nível")
        print("     do container (nem chega a ser GVAS).")
        traceback.print_exc()
        return 1
    print(f"  descomprimido: {len(gvas_bytes):,} bytes em {time.time()-t0:.0f}s "
          f"(tipo 0x{tipo:02x})", flush=True)

    # ---- passo 1: árvore comum --------------------------------------------
    print("\n  [1/2] parse SEM custom properties (árvore comum)...", flush=True)
    t0 = time.time()
    try:
        gvas_simples = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, {})
    except Exception:
        print("\n  ❌ QUEBROU NA ÁRVORE COMUM — corrupção estrutural grave.")
        traceback.print_exc()
        return 1
    print(f"        ok em {time.time()-t0:.0f}s", flush=True)

    world_simples = gvas_simples.properties["worldSaveData"]["value"]
    print(f"        seções no worldSaveData: {len(world_simples)}")

    # ---- passo 2: TODAS as custom properties, uma a uma --------------------
    #
    # Uma de cada vez em vez de todas juntas: assim a seção que quebra fica
    # identificada pelo nome, em vez de só um traceback sem contexto.
    print(f"\n  [2/2] parse COM cada custom property, uma a uma "
          f"({len(PALWORLD_CUSTOM_PROPERTIES)} seções)...", flush=True)

    ruins: list[tuple[str, str]] = []
    for nome, decoder in PALWORLD_CUSTOM_PROPERTIES.items():
        t0 = time.time()
        try:
            GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, {nome: decoder})
            print(f"        ✅ {nome}  ({time.time()-t0:.0f}s)", flush=True)
        except Exception as err:  # noqa: BLE001
            print(f"        ❌ {nome}  -> {type(err).__name__}: {err}", flush=True)
            ruins.append((nome, f"{type(err).__name__}: {err}"))

    print(f"\n{'='*70}")
    if ruins:
        print(f"  🔴 {len(ruins)} SEÇÃO(ÕES) COM DADO INVÁLIDO:\n")
        for nome, erro in ruins:
            print(f"    {nome}")
            print(f"      {erro}\n")
        print("  É aqui que mora o dado que derruba o servidor.")
        return 1

    print("  ✅ Todas as seções decodificam sem erro.")
    print("     O save está íntegro para o parser — a causa do crash é outra.")

    # ---- JSON opcional -----------------------------------------------------
    if args.salvar_json:
        print(f"\n  gerando JSON completo em {args.salvar_json}...", flush=True)
        t0 = time.time()
        gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, PALWORLD_CUSTOM_PROPERTIES)
        with open(args.salvar_json, "w", encoding="utf-8") as f:
            json.dump(gvas.dump(), f, ensure_ascii=False, default=str)
        tam = os.path.getsize(args.salvar_json)
        print(f"  ✅ {tam:,} bytes em {time.time()-t0:.0f}s")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
