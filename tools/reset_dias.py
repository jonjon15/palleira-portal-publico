#!/usr/bin/env python3
"""
Zera (ou ajusta) o contador de "Dias" do mundo (pedido do dono, 04/09/2026).

O "Dias" que aparece no browser de servidor do jogo não vem de nenhuma REST
nem RCON — é calculado ao vivo pelo próprio Palworld a partir de um campo do
`Level.sav`: `worldSaveData.GameTimeSaveData.GameDateTimeTicks`, um Int64 em
ticks .NET (100ns cada). Achado sondando o VIP com `tools/sondar_mundo.py
--deep GameTimeSaveData`: 1.990.326.260.000.000 ticks ÷ 864.000.000.000
ticks/dia ≈ 2303,2 — bate com os "2.303" que o browser mostrava.

Reaproveita as funções de SFTP/backup/troca atômica de `reset_player.py`: é
a mesma operação de risco (reescrever o `Level.sav` de todo mundo), só que
mexendo em um Int64 solto em vez de um mapa de personagens.

Uso:
    python tools/reset_dias.py --servidor pve-vip --verificar
    python tools/reset_dias.py --servidor pve-vip --simular
    python tools/reset_dias.py --servidor pve-vip --aplicar
    python tools/reset_dias.py --servidor pve-vip --aplicar --dias 10
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reset_player import (  # noqa: E402
    SAVE_PATH,
    _abortar,
    apagar,
    baixar,
    enviar,
    info_arquivo,
    renomear,
    servidores,
)
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402

TICKS_POR_DIA = 24 * 60 * 60 * 10_000_000  # ticks .NET (100ns) num dia


def main() -> int:
    ap = argparse.ArgumentParser(description="Zera o contador de Dias do mundo")
    ap.add_argument("--servidor", required=True, help="slug: pve-free, pve-vip, pvp-free")
    ap.add_argument("--dias", type=float, default=0,
                     help="para quantos dias zerar (padrão 0)")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--verificar", action="store_true",
                       help="só prova que ler+reserializar não corrompe. Não escreve.")
    modo.add_argument("--simular", action="store_true",
                       help="mostra o valor atual e o novo. Não escreve.")
    modo.add_argument("--aplicar", action="store_true",
                       help="grava de verdade. Servidor tem que estar PARADO.")
    args = ap.parse_args()

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    caminho = SAVE_PATH.format(guid=cfg.guid)
    print(f"=== {cfg.slug} ===", flush=True)

    if args.aplicar:
        pid = PANEL_IDS.get(cfg.slug)
        if not pid:
            sys.exit(f"sem panelId para {cfg.slug} — não dá para conferir se está parado")
        try:
            atual = estado_do_painel(pid)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
        if atual != "offline":
            print(f"  ❌ O servidor está '{atual}', não 'offline'.")
            print("     Gravar com o jogo rodando corrompe o mundo de todos.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    t0 = time.time()
    original = baixar(cfg, caminho)
    print(f"  baixado:       {len(original):,} bytes em {time.time()-t0:.0f}s", flush=True)

    t0 = time.time()
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    print(f"  descomprimido: {len(gvas_bytes):,} bytes em {time.time()-t0:.0f}s "
          f"(tipo 0x{tipo:02x})", flush=True)

    # GameTimeSaveData é um StructProperty comum — não precisa de nenhuma
    # das seções custom (RawData) que reset_player.py decodifica. Sondado:
    # ler o worldSaveData inteiro sem custom já devolve esse campo pronto.
    t0 = time.time()
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, {})
    print(f"  parse:         {time.time()-t0:.0f}s", flush=True)
    world = gvas.properties["worldSaveData"]["value"]

    if args.verificar:
        t0 = time.time()
        refeito = compress_gvas_to_sav(
            gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
        print(f"  reserializado: {len(refeito):,} bytes em {time.time()-t0:.0f}s",
              flush=True)
        igual = refeito == original
        print()
        if igual:
            print("  ✅ IDÊNTICO byte a byte — o ciclo não corrompe o save.")
            return 0
        print(f"  ⚠️  DIFERENTE: {len(original):,} -> {len(refeito):,} bytes")
        volta, _ = decompress_sav_to_gvas(refeito)
        if volta == gvas_bytes:
            print("  ✅ O GVAS descomprimido é IDÊNTICO. Só a compressão variou.")
            return 0
        print("  ❌ O GVAS mudou. NÃO usar --aplicar até entender o porquê.")
        return 1

    campo = world["GameTimeSaveData"]["value"]["GameDateTimeTicks"]
    ticks_atual = campo["value"]
    dias_atual = ticks_atual / TICKS_POR_DIA
    ticks_novo = round(args.dias * TICKS_POR_DIA)

    print()
    print(f"  dias atual: {dias_atual:.2f} ({ticks_atual:,} ticks)")
    print(f"  dias novo:  {args.dias:.2f} ({ticks_novo:,} ticks)")

    if args.simular:
        print("\n  (simulação — nada foi gravado)")
        return 0

    campo["value"] = ticks_novo

    info = info_arquivo(cfg, caminho)
    if info:
        idade = time.time() - info[1]
        if idade > 900:
            print(f"  ⚠️  o Level.sav tem {idade/60:.0f} minutos — o desligamento")
            print("     pode não ter salvado. Seguindo, mas confira depois.")
        else:
            print(f"  ✅ mundo salvo há {idade/60:.0f} min pelo desligamento", flush=True)

    t0 = time.time()
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    print(f"\n  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s", flush=True)

    backup = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, backup, original)
    conf = info_arquivo(cfg, backup)
    if not conf or conf[0] != len(original):
        return _abortar(
            f"backup incompleto ({conf[0] if conf else 0} de {len(original)} bytes)."
        )
    print(f"  ✅ backup conferido: {backup} ({conf[0]:,} bytes)", flush=True)

    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(novo):
        apagar(cfg, temporario)
        return _abortar(
            f"upload incompleto ({conf_novo[0] if conf_novo else 0} de {len(novo)} bytes)."
        )

    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes, por rename)", flush=True)
    print(f"\n  ✅ Feito. Dias {dias_atual:.2f} -> {args.dias:.2f}. Suba o servidor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
