#!/usr/bin/env python3
"""
Zera no site o que um mundo wipado deixou para trás: cofre, anúncios e
entregas paradas.

Decisão do dono para o wipe do Dominantes (23/10/2026):

- **Cofre:** Pal e item que saíram daquele mundo se perdem no wipe, igual ao
  que estava no jogo. Não voltam para lugar nenhum.
- **Mercado:** anúncio de jogador com origem naquele mundo é cancelado, e o
  Pal/item do anúncio se perde junto — devolver ao cofre seria só adiar o
  mesmo apagamento. A loja do Lobo (`pals_monster`, kits) não é tocada: não
  tem servidor de origem e continua valendo.
- **Entrega parada:** `pal_transfers` e `vault_transfers` que não chegaram ao
  jogo viram `falhou`. O mundo de destino não existe mais.
- **Booster:** fica. O booster pago vale para o mundo novo.

⚠️ Tudo com `server_slug` do mundo wipado tem a mesma cara antes e depois do
wipe — um Pal guardado no mundo novo também é `pvp-free`. Por isso o corte
por data (`--ate`, padrão: agora): rode **logo depois do wipe**, antes de
alguém guardar coisa do mundo novo, ou passe o horário do wipe.

Uso:
    python tools/wipe_cofre_e_mercado.py --servidor pvp-free --simular
    python tools/wipe_cofre_e_mercado.py --servidor pvp-free --aplicar
    python tools/wipe_cofre_e_mercado.py --servidor pvp-free --ate 2026-10-24T03:00:00Z --aplicar
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import psycopg

DETALHE = "perdido no wipe"

# (rótulo, contagem, alteração) — os dois SQL recebem (servidor, corte).
PASSOS = [
    (
        "Pals no cofre",
        "select count(*) from vault_pals where server_slug=%s and imported_at < %s",
        "delete from vault_pals where server_slug=%s and imported_at < %s",
    ),
    (
        "Pilhas de item no cofre",
        "select count(*) from vault_items where server_slug=%s and updated_at < %s",
        "delete from vault_items where server_slug=%s and updated_at < %s",
    ),
    (
        "Anúncios ativos",
        "select count(*) from listings where status='ativo' "
        "and coalesce(item_server_slug, pal_server_slug)=%s and created_at < %s",
        "update listings set status='cancelado', closed_at=now() where status='ativo' "
        "and coalesce(item_server_slug, pal_server_slug)=%s and created_at < %s",
    ),
    (
        "Entregas de Pal paradas",
        "select count(*) from pal_transfers where server_slug=%s and created_at < %s "
        "and status in ('aguardando_arquivo','arquivo_pronto')",
        f"update pal_transfers set status='falhou', finished_at=now(), "
        f"detail=detail || ' | {DETALHE}' where server_slug=%s and created_at < %s "
        "and status in ('aguardando_arquivo','arquivo_pronto')",
    ),
    (
        "Movimentos de item parados",
        "select count(*) from vault_transfers where server_slug=%s and created_at < %s "
        "and status='andando'",
        f"update vault_transfers set status='falhou', finished_at=now(), "
        f"detail=detail || ' | {DETALHE}' where server_slug=%s and created_at < %s "
        "and status='andando'",
    ),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--ate", help="horário do wipe (ISO, UTC); padrão: agora")
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--simular", action="store_true")
    grupo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    url = os.environ.get("DATABASE_URL", "")
    if not url:
        sys.exit("DATABASE_URL ausente")

    corte = (
        datetime.fromisoformat(args.ate.replace("Z", "+00:00"))
        if args.ate
        else datetime.now(timezone.utc)
    )
    print(f"Servidor: {args.servidor}")
    print(f"Corte   : {corte:%Y-%m-%d %H:%M} UTC (antes disto = mundo wipado)\n")

    with psycopg.connect(url) as con:
        with con.cursor() as cur:
            for rotulo, contar, alterar in PASSOS:
                cur.execute(contar, (args.servidor, corte))
                n = cur.fetchone()[0]
                if args.aplicar and n:
                    cur.execute(alterar, (args.servidor, corte))
                    n = cur.rowcount
                print(f"  {rotulo:<28} {n}")
        if args.aplicar:
            con.commit()
            print("\nAplicado.")
        else:
            print("\nSimulação — nada foi gravado. Rode com --aplicar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
