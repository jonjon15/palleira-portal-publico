#!/usr/bin/env python3
"""
Variante 100% offline do `migrar_sem_decay.py`, para o caso pontual em que o
mundo de origem está corrompido no servidor (EXCEPTION_ACCESS_VIOLATION
0x88) mas existe uma cópia local íntegra em disco (backup manual, fora do
SFTP).

Reaproveita a mesma lógica de filtro (`guildas_com_base`) e o mesmo patch do
`palworld_aio.managers.backup_manager`, só que lê/escreve arquivos locais em
vez de baixar/subir por SFTP. Não toca no servidor.

Uso:
    python tools/migrar_offline_decay.py \
        --origem "G:/Downloads/Servidor/FREE/BKP all/E99C.../Level.sav.bak-20260916-013401" \
        --origem-players "G:/Downloads/Servidor/FREE/BKP all/E99C.../Players" \
        --destino "G:/Downloads/Servidor/FREE/BKP all/D110.../Level.sav" \
        --destino-players "G:/Downloads/Servidor/FREE/BKP all/D110.../Players" \
        --limite-horas 80 \
        --saida mundo_destino_reconstruido/Level.sav
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from migrar_sem_decay import guildas_com_base  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Migra guildas com base viva, 100% offline")
    ap.add_argument("--origem", required=True, help="Level.sav (ou .bak-*) do mundo corrompido")
    ap.add_argument("--origem-players", required=True, help="pasta Players/ do mundo corrompido")
    ap.add_argument("--destino", required=True, help="Level.sav do mundo de destino")
    ap.add_argument("--destino-players", required=True, help="pasta Players/ do mundo de destino")
    ap.add_argument("--limite-horas", type=float, default=72.0)
    ap.add_argument("--saida", required=True, help="onde gravar o Level.sav reconstruído")
    ap.add_argument("--aplicar", action="store_true",
                    help="sem isso, só exporta e lista — não grava --saida")
    args = ap.parse_args()

    from patch_backup_manager import aplicar as corrigir_backup_manager
    corrigir_backup_manager()

    import palworld_aio.managers.backup_manager as bm
    export_player_backup = bm.export_player_backup
    import_player_backup = bm.import_player_backup

    os.makedirs("mundo_origem/Players", exist_ok=True)
    os.makedirs("mundo_destino/Players", exist_ok=True)

    shutil.copy(args.origem, "mundo_origem/Level.sav")
    shutil.copy(args.destino, "mundo_destino/Level.sav")

    for nome in os.listdir(args.origem_players):
        shutil.copy(os.path.join(args.origem_players, nome),
                    os.path.join("mundo_origem/Players", nome.lower()))
    for nome in os.listdir(args.destino_players):
        shutil.copy(os.path.join(args.destino_players, nome),
                    os.path.join("mundo_destino/Players", nome.lower()))

    print(f"  origem : {os.path.getsize('mundo_origem/Level.sav'):,} bytes, "
          f"{len(os.listdir('mundo_origem/Players'))} players")
    print(f"  destino: {os.path.getsize('mundo_destino/Level.sav'):,} bytes, "
          f"{len(os.listdir('mundo_destino/Players'))} players", flush=True)

    import migrar_sem_decay as msd
    msd.LIMITE_H = args.limite_horas

    guildas = guildas_com_base("mundo_origem/Level.sav")
    alvos = [(uid, nome) for g in guildas for uid, nome in g["membros"]]

    print("=" * 70)
    print(f"{len(guildas)} guildas com base viva (<= {args.limite_horas}h) — {len(alvos)} jogadores")
    print("=" * 70)
    for g in guildas:
        print(f"\n  [{g['horas']:6.1f}h parada]  {g['nome']}  ({g['bases']} base(s))")
        for uid, nome in g["membros"]:
            print(f"      {uid}  {nome}")
    print(flush=True)

    os.makedirs("exports", exist_ok=True)
    exportados: list[tuple[str, str, str]] = []
    falhas: list[tuple[str, str]] = []
    print("\nexportando...", flush=True)
    for uid, nome in alvos:
        saida = os.path.join("exports", f"{uid}.player.pstz")
        try:
            export_player_backup("mundo_origem/Level.sav", uid, saida)
            # 🔴 export_player_backup acrescenta ".pst7" ao output_path por
            # conta própria quando ele não termina assim — o caminho real
            # gravado em disco não é o `saida` pedido.
            real = saida if os.path.exists(saida) else saida + ".pst7"
            print(f"  OK {nome:<26} {os.path.getsize(real):>10,} bytes", flush=True)
            exportados.append((uid, nome, real))
        except Exception as exc:  # noqa: BLE001
            print(f"  FALHA {nome:<26} {exc}", flush=True)
            falhas.append((nome, str(exc)))

    print(f"\nexportados: {len(exportados)}   falharam: {len(falhas)}")

    if not args.aplicar:
        print("\n(sem --aplicar — nada foi importado nem gravado em --saida)")
        return 0

    if not exportados:
        print("nada exportado, não há o que importar.")
        return 1

    print("\nimportando no destino...", flush=True)
    importados: list[str] = []
    for uid, nome, caminho in exportados:
        try:
            import_player_backup(caminho, "mundo_destino/Level.sav")
            print(f"  OK {nome}", flush=True)
            importados.append(nome)
        except Exception as exc:  # noqa: BLE001
            print(f"  FALHA {nome}: {exc}", flush=True)

    print(f"\nimportados: {len(importados)} de {len(exportados)}")
    if not importados:
        print("nada importado — não vou gravar --saida.")
        return 1

    os.makedirs(os.path.dirname(args.saida) or ".", exist_ok=True)
    shutil.copy("mundo_destino/Level.sav", args.saida)
    print(f"\n  gravado: {args.saida} ({os.path.getsize(args.saida):,} bytes)")
    print("  (isso NÃO tocou no servidor — envie por SFTP quando conferir)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
