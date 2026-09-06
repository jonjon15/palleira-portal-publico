#!/usr/bin/env python3
"""
Guarda no banco cada `Players/<uid>.sav` — o arquivo dos saves individuais.

Complemento do `arquivar_bases.py`. O save individual é pequeno (~25 KB) e é
onde moram os ponteiros dos containers: mochila, essenciais, armas, Pal Box,
party. Comparar versões dele foi o que revelou, em 06/09/2026, que o jogo
tinha trocado os GUIDs de container do Tenshi e do Givaldo — diagnóstico que
seria impossível sem histórico.

Espaço fica sob controle por deduplicação: o save da maioria dos jogadores
não muda de um dia para o outro, e versão idêntica (mesmo sha256) só avança o
`seen_at` em vez de virar linha nova.

Só lê o servidor. Grava apenas no banco.

Uso:
    python tools/arquivar_players.py                        # todos
    python tools/arquivar_players.py --servidores pve-free --simular
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import os
import sys
import time

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import _sftp, dig, norm_uid, servidores  # noqa: E402
from sondar_inventario import (  # noqa: E402
    CAMPOS_DE_CONTAINER, guid_sob, ler_gvas,
)

PLAYERS_DIR = "Pal/Saved/SaveGames/0/{guid}/Players"


def containers_do_save(bruto: bytes) -> dict[str, str]:
    """Os oito GUIDs de container, lidos do save individual.

    Se o arquivo não abrir, devolve vazio em vez de derrubar a rodada: um
    save corrompido é justamente o que mais se quer ter guardado.
    """
    try:
        props = ler_gvas(bruto, {}).properties
    except Exception:  # noqa: BLE001
        return {}
    save_data = dig(props, "SaveData", "value", default=props)
    return {c: guid_sob(save_data, c) for c in CAMPOS_DE_CONTAINER}


def arquivar(cfg, simular: bool) -> int:
    import json  # noqa: PLC0415

    t0 = time.time()
    pasta = PLAYERS_DIR.format(guid=cfg.guid)
    t, sftp = _sftp(cfg)
    try:
        nomes = [a.filename for a in sftp.listdir_attr(pasta)
                 if a.filename.endswith(".sav")]
        arquivos: list[tuple[str, bytes]] = []
        for nome in nomes:
            buf = io.BytesIO()
            try:
                sftp.getfo(f"{pasta}/{nome}", buf)
            except OSError:
                continue
            arquivos.append((norm_uid(nome[:-4]), buf.getvalue()))
    finally:
        t.close()

    print(f"=== {cfg.slug}: {len(arquivos)} save(s) individual(is), "
          f"baixados em {time.time()-t0:.0f}s ===", flush=True)

    conn = None if simular else psycopg.connect(os.environ["DATABASE_URL"])
    novos = repetidos = 0
    total = 0

    try:
        for uid, bruto in arquivos:
            sha = hashlib.sha256(bruto).hexdigest()
            blob = gzip.compress(bruto, 6)
            total += len(blob)

            if conn is None:
                continue

            with conn.cursor() as cur:
                # Conteúdo repetido não vira linha nova — só diz "continua
                # assim". É o "regravar em cima" onde ele não custa nada.
                cur.execute(
                    """
                    insert into player_snapshots
                      (server_slug, palworld_uid, sha256, blob, blob_bytes, containers)
                    values (%s,%s,%s,%s,%s,%s)
                    on conflict (server_slug, palworld_uid, sha256)
                      do update set seen_at = now()
                    returning (xmax = 0) as inserido
                    """,
                    (cfg.slug, uid, sha, blob, len(blob),
                     json.dumps(containers_do_save(bruto))),
                )
                linha = cur.fetchone()
                if linha and linha[0]:
                    novos += 1
                else:
                    repetidos += 1
            conn.commit()

        print(f"  {novos} versão(ões) nova(s), {repetidos} sem mudança "
              f"(dedup por sha256)")
        print(f"  {total/1_048_576:.2f} MB se tudo fosse novo")
        if simular:
            print("  simulação — nada foi gravado no banco")
    finally:
        if conn is not None:
            conn.close()

    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Arquiva os saves individuais no banco")
    ap.add_argument("--servidores", default="",
                    help="slugs separados por vírgula; vazio = todos")
    ap.add_argument("--simular", action="store_true")
    args = ap.parse_args()

    todos = servidores()
    pedidos = [s.strip() for s in args.servidores.split(",") if s.strip()] or list(todos)

    faltando = [s for s in pedidos if s not in todos]
    if faltando:
        sys.exit(f"servidor(es) fora de PALLEIRA_SERVERS: {', '.join(faltando)}")

    saida = 0
    for slug in pedidos:
        try:
            saida |= arquivar(todos[slug], args.simular)
        except Exception as err:  # noqa: BLE001
            print(f"\n  ✗ {slug}: {type(err).__name__}: {err}", flush=True)
            saida = 1
    return saida


if __name__ == "__main__":
    raise SystemExit(main())
