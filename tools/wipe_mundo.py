#!/usr/bin/env python3
"""
Wipe de verdade: move a pasta do mundo pra fora do caminho e deixa o
Palworld criar um mundo novo do zero ao subir (pedido do dono, 05/09/2026).

Diferente do `reset_dias.py`, aqui não tem GVAS para ler nem reescrever —
é só tirar a pasta do lugar. Documentado por vários provedores de hospedagem
(Physgun, Shockbyte, GGServers): pare o servidor, apague a pasta em
`Pal/Saved/SaveGames/0/<guid>/`, suba de novo — o jogo cria uma pasta nova
sozinho porque não acha mundo válido.

Não apaga de verdade: renomeia para fora de `SaveGames/0/`, para dar para
recuperar em caso de engano. Mover tem volta; apagar não.

Uso:
    python tools/wipe_mundo.py --servidor pvp-free --simular
    python tools/wipe_mundo.py --servidor pvp-free --aplicar
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reset_player import SAVE_PATH, info_arquivo, renomear, servidores  # noqa: E402
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402

WORLD_DIR = "Pal/Saved/SaveGames/0/{guid}"
WIPE_DIR = "Pal/Saved/SaveGames/{guid}.wipe-{quando}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Wipe do mundo: tira a pasta do lugar")
    ap.add_argument("--servidor", required=True, help="slug: pve-free, pve-vip, pvp-free")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true",
                       help="só confere que a pasta existe. Não move.")
    modo.add_argument("--aplicar", action="store_true",
                       help="move de verdade. Servidor tem que estar PARADO.")
    args = ap.parse_args()

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    origem = WORLD_DIR.format(guid=cfg.guid)
    destino = WIPE_DIR.format(guid=cfg.guid, quando=time.strftime("%Y%m%d-%H%M%S"))
    caminho_level = SAVE_PATH.format(guid=cfg.guid)

    print(f"=== {cfg.slug} ===", flush=True)

    info = info_arquivo(cfg, caminho_level)
    if not info:
        sys.exit(f"não achei {caminho_level} — confira o guid antes de continuar")
    print(f"  mundo atual: Level.sav com {info[0]:,} bytes, salvo há "
          f"{(time.time()-info[1])/60:.0f} min", flush=True)
    print(f"  de:  {origem}")
    print(f"  pra: {destino}")

    if args.simular:
        print("\n  (simulação — nada foi movido)")
        return 0

    pid = PANEL_IDS.get(cfg.slug)
    if not pid:
        sys.exit(f"sem panelId para {cfg.slug} — não dá para conferir se está parado")
    try:
        atual = estado_do_painel(pid)
    except Exception as err:  # noqa: BLE001
        sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
    if atual != "offline":
        print(f"  ❌ O servidor está '{atual}', não 'offline'.")
        print("     Mover a pasta com o jogo rodando corrompe o save. Pare pelo painel.")
        return 1
    print("  ✅ servidor confirmado 'offline'", flush=True)

    renomear(cfg, origem, destino)
    print(f"\n  ✅ Pasta movida para {destino}")
    print("     Suba o servidor — o Palworld cria um mundo novo sozinho.")
    print("     (o backup fica ao lado; avise se for para apagar de vez depois)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
