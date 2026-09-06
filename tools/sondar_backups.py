#!/usr/bin/env python3
"""
Diz de quanto em quanto tempo o servidor faz backup, e por quanto tempo
guarda.

A pergunta é do dono, em 06/09/2026, e não tinha resposta escrita em lugar
nenhum: o painel não guarda backup (`backup_count: 0`), então tudo depende da
pasta `backup/world/` que o próprio jogo escreve — e ninguém sabia o ritmo
nem a janela dela. Sem esse número não dá para dizer ao jogador em quanto
tempo uma base perdida deixa de ser recuperável pelo servidor.

Não grava nada. Lista, mede e imprime.

Uso:
    python tools/sondar_backups.py --servidor pve-free
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import _sftp, servidores  # noqa: E402

BASE_DIR = "Pal/Saved/SaveGames/0/{guid}"


def quando(nome: str) -> datetime | None:
    """A data no nome da pasta: `2026.09.04-23.59.35`."""
    try:
        return datetime.strptime(nome, "%Y.%m.%d-%H.%M.%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Ritmo e janela dos backups do servidor")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--listar", type=int, default=12,
                    help="quantos backups mostrar, do mais novo para o mais velho")
    args = ap.parse_args()

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    base = BASE_DIR.format(guid=cfg.guid)
    t, sftp = _sftp(cfg)
    try:
        try:
            pastas = sorted(sftp.listdir(f"{base}/backup/world"), reverse=True)
        except FileNotFoundError:
            pastas = []
        # Tamanho do Level.sav de cada um, para ver se algum veio truncado.
        tamanhos: dict[str, int] = {}
        for p in pastas[: args.listar]:
            try:
                tamanhos[p] = sftp.stat(f"{base}/backup/world/{p}/Level.sav").st_size
            except FileNotFoundError:
                tamanhos[p] = 0
        proprios = sorted(
            (a.filename, a.st_size) for a in sftp.listdir_attr(base)
            if a.filename.startswith("Level.sav.bak-")
        )
        # O Level.sav vivo separa "o backup parou" de "o servidor parou de
        # salvar". São problemas diferentes e a diferença importa.
        vivo = sftp.stat(f"{base}/Level.sav")
    finally:
        t.close()

    print(f"=== {cfg.slug}: {len(pastas)} backup(s) em backup/world/ ===")

    agora_ts = datetime.now(timezone.utc)
    salvo = datetime.fromtimestamp(vivo.st_mtime, timezone.utc)
    print(f"  Level.sav vivo: {vivo.st_size:,} bytes, salvo {salvo:%d/%m %H:%M} UTC "
          f"(há {(agora_ts - salvo).total_seconds()/60:.0f} min)")

    datas = [d for d in (quando(p) for p in pastas) if d]
    datas.sort(reverse=True)

    if datas:
        agora = datetime.now(timezone.utc)
        print(f"  mais novo: {datas[0]:%d/%m %H:%M} UTC "
              f"(há {(agora - datas[0]).total_seconds()/60:.0f} min)")
        print(f"  mais velho: {datas[-1]:%d/%m %H:%M} UTC "
              f"(há {(agora - datas[-1]).total_seconds()/3600:.1f} h)")
        print(f"  janela guardada: {(datas[0] - datas[-1]).total_seconds()/3600:.1f} h")

    # O intervalo não é um número só: o jogo costuma ter um ritmo curto para
    # os recentes e guardar um por dia mais atrás. Mostrar a distribuição
    # conta essa história melhor do que uma média.
    if len(datas) > 1:
        gaps = [(datas[i] - datas[i + 1]).total_seconds() / 60
                for i in range(len(datas) - 1)]
        print(f"\n  intervalo entre backups (minutos): "
              f"menor {min(gaps):.0f} · mediana {sorted(gaps)[len(gaps)//2]:.0f} · "
              f"maior {max(gaps):.0f}")
        faixas = {"até 5 min": 0, "5–30 min": 0, "30 min–3 h": 0,
                  "3–24 h": 0, "mais de 1 dia": 0}
        for g in gaps:
            chave = ("até 5 min" if g <= 5 else "5–30 min" if g <= 30
                     else "30 min–3 h" if g <= 180 else "3–24 h" if g <= 1440
                     else "mais de 1 dia")
            faixas[chave] += 1
        for chave, n in faixas.items():
            if n:
                print(f"    {chave:<14} {n:>4} intervalo(s)")

    print(f"\n  os {min(args.listar, len(pastas))} mais recentes:")
    for p in pastas[: args.listar]:
        tam = tamanhos.get(p, 0)
        print(f"    {p}  Level.sav {tam:>13,} bytes" if tam
              else f"    {p}  ⚠ sem Level.sav")

    print(f"\n  Level.sav.bak-* deixados pelos nossos scripts: {len(proprios)}")
    for nome, tam in proprios[-5:]:
        print(f"    {nome}  ({tam:,} bytes)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
