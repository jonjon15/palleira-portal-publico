#!/usr/bin/env python3
"""
Tira do banco os jogadores e guildas de um mundo que sofreu wipe.

O import do save é `upsert` puro, e o level usa `greatest(players.level,
excluded.level)` — de propósito, para que uma leitura parcial não achate o
progresso de ninguém. O efeito colateral aparece depois de um wipe: quem
existia no mundo antigo **nunca some**, e o ranking segue mostrando gente
que não existe mais, com o level que ela tinha.

Foi o que aconteceu com o PVE Free em 18/09/2026: 305 personagens do mundo
velho contra 30 do novo, e o top 10 inteiro era do mundo que já não existe.

⚠️ O corte é por `updated_at`, não por nome: depois de um import
bem-sucedido, quem é do mundo atual tem o carimbo daquele import, e quem é
do mundo antigo ficou com o carimbo do último import anterior ao wipe. Por
isso **rode o import primeiro** e só então este script — sem isso, o corte
apagaria o mundo inteiro.

Medido antes de apagar (pve-free, 18/09): nenhum UID aparecia nos dois
lados, então não há risco de apagar a linha nova de alguém junto com a
velha.

Uso:
    python tools/limpar_mundo_antigo.py --servidor pve-free --simular
    python tools/limpar_mundo_antigo.py --servidor pve-free --aplicar
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

import psycopg

# Tabelas com `server_slug` + `updated_at` que guardam estado por personagem.
# `account_links` NÃO entra: o vínculo Discord↔personagem é da pessoa, não do
# mundo, e apagá-lo obrigaria 25 jogadores a vincular tudo de novo à toa.
TABELAS = ("players", "guilds")


def conectar() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        sys.exit("DATABASE_URL ausente")
    return psycopg.connect(url)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--horas", type=float, default=6.0,
                    help="linhas mais velhas que isto são do mundo antigo")
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--simular", action="store_true")
    grupo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    corte = datetime.now(timezone.utc) - timedelta(hours=args.horas)
    print(f"Servidor: {args.servidor}")
    print(f"Corte   : {corte:%Y-%m-%d %H:%M} UTC (mais velho que isto = mundo antigo)\n")

    with conectar() as con:
        for tabela in TABELAS:
            with con.cursor() as cur:
                cur.execute(
                    f"select count(*) from {tabela} "
                    "where server_slug=%s and updated_at < %s",
                    (args.servidor, corte),
                )
                velhos = cur.fetchone()[0]
                cur.execute(
                    f"select count(*) from {tabela} "
                    "where server_slug=%s and updated_at >= %s",
                    (args.servidor, corte),
                )
                novos = cur.fetchone()[0]

            print(f"  {tabela:<10} apagaria {velhos:>4}, mantém {novos:>4}")

            # Trava de segurança: se o import não rodou, TUDO parece velho.
            # Apagar nesse estado deixaria o ranking vazio em vez de errado.
            if novos == 0 and velhos > 0:
                sys.exit(
                    f"\n⚠️  ABORTADO: nenhuma linha recente em {tabela}.\n"
                    "   Rode o import do save primeiro — sem ele, este corte\n"
                    "   apagaria o mundo atual junto com o antigo."
                )

            if args.aplicar:
                with con.cursor() as cur:
                    cur.execute(
                        f"delete from {tabela} "
                        "where server_slug=%s and updated_at < %s",
                        (args.servidor, corte),
                    )
                    print(f"  {tabela:<10} apagadas {cur.rowcount} linhas")

        if args.aplicar:
            con.commit()
            print("\nPronto. O ranking já reflete só o mundo atual.")
        else:
            print("\n[simulação] nada foi apagado.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
