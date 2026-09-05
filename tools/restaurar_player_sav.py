#!/usr/bin/env python3
"""
Devolve o `Players/<uid>.sav` de um jogador a partir dos backups automáticos
do painel (`.../backup/world/<AAAA.MM.DD-HH.MM.SS>/Players/`).

Por que esse arquivo importa: ele guarda os ponteiros das caixas de Pal
(`PalStorageContainerId`, `OtomoCharacterContainerId`) e o inventário — campos
que **não existem** no `Level.sav` (medido por `tools/sondar_containers.py`).
Sem ele o servidor trata as caixas do jogador como órfãs e apaga os Pals na
subida seguinte.

Foi o que aconteceu no pve-free em 05/09/2026 17:27 UTC: o `restaurar_base.py`
apagava o `Players/<uid>.sav` no fim (herança do `reset_player.py`, onde
apagar é o objetivo), o servidor subiu e levou 260 Pals do Tenshi e 107 do
Givaldo. Os dois scripts já não apagam mais nada; este aqui repõe o estrago.

É cópia binária pura — não decodifica nada, então não tem como corromper o
conteúdo. Só grava com o servidor `offline`, e nunca sobrescreve um arquivo
que já existe sem `--forcar`.

Uso:
    python tools/restaurar_player_sav.py --servidor pve-free \
        --uids 21F2BD36...,502FCA99... --simular
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from restaurar_base import (  # noqa: E402
    Servidor, _abortar, _sftp, baixar, enviar, info_arquivo, norm_uid,
    renomear, servidores,
)

PLAYERS_DIR = "Pal/Saved/SaveGames/0/{guid}/Players"
BACKUP_WORLD_DIR = "Pal/Saved/SaveGames/0/{guid}/backup/world"


def listar(cfg: Servidor, caminho: str) -> list[str]:
    t, sftp = _sftp(cfg)
    try:
        return sorted(sftp.listdir(caminho))
    except FileNotFoundError:
        return []
    finally:
        t.close()


def candidatos(cfg: Servidor, uid: str, pasta_pedida: str | None) -> list[tuple[str, int]]:
    """(pasta de backup, tamanho) onde o .sav desse jogador ainda existe, do
    mais novo para o mais velho. Os nomes de pasta são datados, então ordem
    alfabética já é ordem cronológica."""
    raiz = BACKUP_WORLD_DIR.format(guid=cfg.guid)
    pastas = [pasta_pedida] if pasta_pedida else sorted(listar(cfg, raiz), reverse=True)
    achados = []
    for pasta in pastas:
        alvo = f"{raiz}/{pasta}/Players/{uid}.sav"
        info = info_arquivo(cfg, alvo)
        if info and info[0] > 0:
            achados.append((pasta, info[0]))
    return achados


def main() -> int:
    ap = argparse.ArgumentParser(description="Devolve o Players/<uid>.sav a partir do backup do painel")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", required=True, help="UIDs (32 hex), separados por vírgula")
    ap.add_argument("--pasta-backup", help="pasta específica em backup/world (default: a mais recente que tenha o arquivo)")
    ap.add_argument("--forcar", action="store_true", help="sobrescrever um Players/<uid>.sav que já exista")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    uids = [norm_uid(u) for u in args.uids.split(",") if u.strip()]
    print(f"=== {cfg.slug} ===", flush=True)

    if args.aplicar:
        pid = PANEL_IDS.get(cfg.slug)
        if not pid:
            sys.exit(f"sem panelId para {cfg.slug}")
        try:
            estado = estado_do_painel(pid)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
        if estado != "offline":
            print(f"  ❌ O servidor está '{estado}', não 'offline'. Gravar com o jogo rodando não adianta —"
                  " o próprio servidor reescreve a pasta Players.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    planos = []
    perdidos = []
    for uid in uids:
        destino = f"{PLAYERS_DIR.format(guid=cfg.guid)}/{uid}.sav"
        atual = info_arquivo(cfg, destino)
        print(f"\n  uid {uid}:")
        print(f"    hoje: " + (f"presente ({atual[0]:,} bytes)" if atual else "AUSENTE"))

        achados = candidatos(cfg, uid, args.pasta_backup)
        if not achados:
            print("    ✗ nenhum backup do painel tem esse arquivo")
            if not atual:
                perdidos.append(uid)
            continue
        for pasta, tam in achados[:5]:
            print(f"    backup disponível: {pasta} ({tam:,} bytes)")

        if atual and not args.forcar:
            print("    → já existe hoje; não vou sobrescrever (use --forcar se for isso mesmo)")
            continue

        pasta, tam = achados[0]
        origem = f"{BACKUP_WORLD_DIR.format(guid=cfg.guid)}/{pasta}/Players/{uid}.sav"
        print(f"    → restaurar de {pasta} ({tam:,} bytes)")
        planos.append((uid, origem, destino, tam))

    if perdidos:
        # Sem esse arquivo e sem backup dele, restaurar Pals é jogar fora: o
        # servidor apaga tudo de novo na subida. Falhar aqui é o certo — em
        # cadeia, impede os passos seguintes de rodarem à toa.
        print(f"\n  ❌ Sem `Players/<uid>.sav` nem backup dele: {', '.join(perdidos)}")
        return 1

    if not planos:
        print("\n  Nada a restaurar — todos os arquivos já estão no lugar.")
        return 0

    if args.simular:
        print("\n  (simulação — nada foi gravado)")
        return 0

    for uid, origem, destino, tam in planos:
        dados = baixar(cfg, origem)
        if len(dados) != tam:
            return _abortar(f"leitura incompleta de {origem} ({len(dados)} de {tam} bytes).")
        temporario = destino + ".novo"
        enviar(cfg, temporario, dados)
        conf = info_arquivo(cfg, temporario)
        if not conf or conf[0] != len(dados):
            return _abortar(f"upload incompleto ({conf[0] if conf else 0} de {len(dados)} bytes).")
        renomear(cfg, temporario, destino)
        print(f"  ✅ Players/{uid}.sav restaurado ({len(dados):,} bytes)", flush=True)

    print("\n  ✅ Feito.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
