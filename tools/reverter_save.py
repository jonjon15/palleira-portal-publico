#!/usr/bin/env python3
"""
Devolve o `Level.sav` para um backup — a saída de emergência quando uma
gravação faz o servidor não subir.

Existe porque em 05/09/2026 21:26 UTC uma restauração de base derrubou o
pve-free (o jogo crashava em menos de 60s a cada tentativa de subir) e a volta
teve de ser feita à mão, arquivo por arquivo, com o servidor no chão. Uma
reversão precisa ser um comando, não uma operação manual sob pressão.

É cópia binária: não decodifica nada, então não tem como corromper. Guarda o
save problemático em vez de apagá-lo — sem ele não há como descobrir o que
derrubou o servidor.

Uso:
    python tools/reverter_save.py --servidor pve-free --backup Level.sav.bak-... --aplicar
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from restaurar_base import (  # noqa: E402
    Servidor, _abortar, _sftp, baixar, enviar, info_arquivo, renomear, servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
DIR_PATH = "Pal/Saved/SaveGames/0/{guid}"


def listar_backups(cfg: Servidor) -> list[tuple[str, int, float]]:
    t, sftp = _sftp(cfg)
    try:
        itens = sftp.listdir_attr(DIR_PATH.format(guid=cfg.guid))
    finally:
        t.close()
    saves = [(a.filename, a.st_size, a.st_mtime) for a in itens
             if a.filename.startswith("Level.sav.bak-")]
    return sorted(saves, key=lambda x: -x[2])


def main() -> int:
    ap = argparse.ArgumentParser(description="Devolve o Level.sav para um backup")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--backup", help="nome do backup (default: o mais recente)")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--listar", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    print(f"=== {cfg.slug} ===", flush=True)
    backups = listar_backups(cfg)
    if not backups:
        return _abortar("nenhum Level.sav.bak-* no servidor.")

    print("  backups disponíveis (mais novo primeiro):")
    for nome, tam, _ in backups[:10]:
        print(f"    {nome}  ({tam:,} bytes)")

    if args.listar:
        return 0

    escolhido = args.backup or backups[0][0]
    origem = f"{DIR_PATH.format(guid=cfg.guid)}/{escolhido}"
    info = info_arquivo(cfg, origem)
    if not info:
        return _abortar(f"backup '{escolhido}' não existe no servidor.")
    print(f"\n  escolhido: {escolhido} ({info[0]:,} bytes)", flush=True)

    pid = PANEL_IDS.get(cfg.slug)
    if not pid:
        sys.exit(f"sem panelId para {cfg.slug}")
    try:
        estado = estado_do_painel(pid)
    except Exception as err:  # noqa: BLE001
        sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
    if estado != "offline":
        print(f"  ❌ O servidor está '{estado}', não 'offline'. Pare antes de reverter.")
        return 1
    print("  ✅ servidor confirmado 'offline'", flush=True)

    destino = SAVE_PATH.format(guid=cfg.guid)
    atual = info_arquivo(cfg, destino)
    if atual:
        # O save problemático é a única evidência do que derrubou o servidor.
        guardado = destino + time.strftime(".naosobe-%Y%m%d-%H%M%S")
        renomear(cfg, destino, guardado)
        print(f"  save que estava no lugar guardado como {guardado.split('/')[-1]}"
              f" ({atual[0]:,} bytes)", flush=True)

    dados = baixar(cfg, origem)
    if len(dados) != info[0]:
        return _abortar(f"leitura incompleta do backup ({len(dados)} de {info[0]} bytes).")
    temporario = destino + ".novo"
    enviar(cfg, temporario, dados)
    conf = info_arquivo(cfg, temporario)
    if not conf or conf[0] != len(dados):
        return _abortar(f"upload incompleto ({conf[0] if conf else 0} de {len(dados)} bytes).")
    renomear(cfg, temporario, destino)
    print(f"  ✅ Level.sav revertido para {escolhido} ({len(dados):,} bytes)")
    print("\n  ✅ Feito. Suba o servidor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
