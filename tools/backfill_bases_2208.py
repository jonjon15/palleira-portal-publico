#!/usr/bin/env python3
"""
Backfill único: insere em `base_snapshots` as bases do pve-free que só
existem no backup avulso `Level.sav.bak-20260822-154657` — de antes do
decay, achado fora da rotação de `backup/world/` (ver
tools/sondar_backup_2208.py).

Candidata ao backfill: base cujo **nenhum membro** aparece em nenhum
snapshot já arquivado hoje. É por UID, não por nome de guild — "Unnamed
Guild" se repete para guilds diferentes e nome trai.

Isto é um preenchimento único do passado, não um mecanismo novo. Depois de
gravado, o `restaurar_do_arquivo.py` já escolhe sozinho "o snapshot de mais
peças entre os que essa pessoa é membro" — e como os dois conjuntos (arquivo
diário × este backfill) não se cruzam, o motor não precisa saber que uma
linha veio de 22/08 em vez de hoje.

Não toca no servidor nem no Level.sav vivo. Só lê o backup e grava no banco.

Uso:
    python tools/backfill_bases_2208.py --simular
    python tools/backfill_bases_2208.py --aplicar
"""

from __future__ import annotations

import argparse
import gzip
import os
import pickle
import sys
import time

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arquivar_bases import SECOES, FORMATO, fecho_da_base, guildas  # noqa: E402
from restaurar_base import (  # noqa: E402
    baixar, base_camp_entries, coletar_guids, dig, entries_of, indices,
    norm_uid, scalar, servidores, works_da_base,
)
from sondar_inventario import ler_gvas  # noqa: E402
from sondar_posicoes import achar_posicao  # noqa: E402

SLUG = "pve-free"
ARQUIVO = "Level.sav.bak-20260822-154657"
SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/" + ARQUIVO

# Guild do C H R I S — o dono decidiu em 06/09/2026 não recuperar essa
# guild depois do reset (ela some quando a base esvazia; sem base nem
# jogador, não há razão para reviver o arquivo dela agora). Ver o handoff.
EXCLUIR_BASE_IDS = {
    "804DA06C4BF15D16C716DDB4A59BF6CA",  # XanaLord, 1451 peça(s)
    "39FF01D94B8BD45CC07E8DBEDB7431FB",  # XanaLord, 2 peça(s)
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}

    cfg = servidores().get(SLUG)
    if not cfg:
        sys.exit(f"'{SLUG}' não está em PALLEIRA_SERVERS")

    print(f"=== baixando {ARQUIVO} de {SLUG} ===", flush=True)
    t0 = time.time()
    bruto = baixar(cfg, SAVE_PATH.format(guid=cfg.guid))
    print(f"  {len(bruto):,} bytes, {time.time()-t0:.0f}s")

    # A data real do recorte, não a data de hoje — quem olhar taken_at no
    # banco precisa saber que essa base é de 22/08, não de agora.
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("select now()")  # só para confirmar conexão cedo

    world = ler_gvas(bruto, custom).properties["worldSaveData"]["value"]
    camps = base_camp_entries(world)
    objetos = entries_of(dig(world, "MapObjectSaveData", default=None)) or []
    print(f"  {len(camps)} base(s), {len(objetos):,} peça(s) no backup", flush=True)

    por_base: dict[str, list] = {}
    for obj in objetos:
        for bid in coletar_guids(obj, "base_camp_id_belong_to"):
            por_base.setdefault(bid, []).append(obj)
            break

    donos = guildas(world)
    idx = indices(world)

    conn = psycopg.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                "select member_uids from base_snapshots where server_slug = %s",
                (SLUG,),
            )
            cobertos: set[str] = set()
            for (membros,) in cur.fetchall():
                cobertos.update(membros or [])

            # Este backfill já rodou antes? Sem constraint única em base_id,
            # rodar --aplicar duas vezes duplicaria as linhas. A marca é a
            # própria taken_at fixa deste backup: se já existe alguma linha
            # com ela, a base já entrou.
            cur.execute(
                """
                select distinct base_id from base_snapshots
                where server_slug = %s and taken_at = to_timestamp(1787413622)
                """,
                (SLUG,),
            )
            ja_feitas = {r[0] for r in cur.fetchall()}
        print(f"  {len(cobertos)} UID(s) já cobertos por algum snapshot vivo hoje")
        if ja_feitas:
            print(f"  {len(ja_feitas)} base(s) já backfilladas numa rodada anterior — puladas de novo")

        inseridas = 0
        puladas_cobertas = 0
        puladas_excluidas = 0
        puladas_repetidas = 0
        total_bytes = 0

        for entrada in camps:
            bid = norm_uid(dig(entrada, "key", default=""))
            if not bid:
                continue
            if bid in EXCLUIR_BASE_IDS:
                puladas_excluidas += 1
                continue
            if bid in ja_feitas:
                puladas_repetidas += 1
                continue

            info = donos.get(bid, {"guild_id": "", "guild_name": "", "membros": []})
            if any(m in cobertos for m in info["membros"]):
                puladas_cobertas += 1
                continue

            pecas = por_base.get(bid, [])
            raw = dig(entrada, "value", "RawData", "value", default={}) or {}
            pos = achar_posicao(raw) or (0.0, 0.0, 0.0)
            raio = float(scalar(raw.get("area_range"), 3500) or 3500)

            works = works_da_base(world, bid)
            fecho = fecho_da_base(idx, [entrada, *pecas, *works])
            fecho.setdefault("WorkSaveData", [])
            ja = {id(w) for w in fecho["WorkSaveData"]}
            fecho["WorkSaveData"] += [w for w in works if id(w) not in ja]

            blob = gzip.compress(pickle.dumps(
                {"base": entrada, "pecas": pecas, "fecho": fecho}, protocol=5), 6)
            total_bytes += len(blob)

            extras = " ".join(f"{s.replace('SaveData','')}:{len(v)}"
                              for s, v in sorted(fecho.items()) if v)
            print(f"  + {bid[:8]}… {info['guild_name'] or '(sem guild)':<24} "
                  f"{len(pecas):>5} peça(s)  {len(blob)/1024:>7,.0f} KB  {extras}",
                  flush=True)
            inseridas += 1

            if args.simular:
                continue

            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into base_snapshots
                      (server_slug, base_id, guild_id, guild_name, member_uids,
                       world_x, world_y, world_z, area_range,
                       piece_count, blob, blob_bytes, formato, taken_at)
                    values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                            to_timestamp(1787413622))
                    """,
                    (SLUG, bid, info["guild_id"], info["guild_name"],
                     info["membros"], pos[0], pos[1], pos[2], raio,
                     len(pecas), blob, len(blob), FORMATO),
                )
            conn.commit()

        print(f"\n=== {inseridas} base(s) {'a inserir' if args.simular else 'inserida(s)'}, "
              f"{puladas_cobertas} pulada(s) por já ter membro coberto, "
              f"{puladas_excluidas} pulada(s) por exclusão explícita, "
              f"{puladas_repetidas} pulada(s) por já backfillada ===")
        print(f"total: {total_bytes/1_048_576:.2f} MB")
        if args.simular:
            print("simulação — nada foi gravado no banco")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
