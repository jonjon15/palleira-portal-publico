#!/usr/bin/env python3
"""
Processa a fila de restauração de base (`base_restore_requests`, status
`fila`) — o motor por trás do autoatendimento (§ restauração paga).

Existe para não parar o servidor uma vez por pedido: todos os pedidos em
fila de um mesmo servidor são aplicados no MESMO save em memória, e só há
UM download + UM upload por servidor nesta rodada — o mesmo espírito do
`restaurar_do_arquivo.py`, só que em lote.

Pensado para rodar perto de um dos restarts que o painel já faz sozinho
(01/06/11/16/21 UTC): o tempo fora do ar é o que já ia acontecer, não um
adicional.

Cada pedido, nesta ordem:
  1. snapshot da pessoa (o explícito, ou o de mais peças) — igual a
     `restaurar_do_arquivo.pacote_do_banco`.
  2. recusa se a base ainda existe no save, se o formato é antigo (sem
     fecho) ou se o destino encosta em base alheia.
  3. destino: o escolhido no pedido (a posição da pessoa no jogo, no
     momento em que pediu), ou o lugar original se vazio.
  4. `injetar()` — a mesma função do restaurar_do_arquivo.py, sem cópia.

Ao final: reserializa uma vez, confere que toda base aplicada sobreviveu ao
ciclo de escrita (a que não sobreviver vira recusada agora, não é gravada
pela metade), grava por backup conferido + upload temporário + rename — e só
então marca as linhas como `feito`.

Um servidor sem nenhum pedido em `fila` não é tocado: não para, não baixa,
não tenta nada.

Uso:
    python tools/processar_fila.py --simular
    python tools/processar_fila.py --aplicar
    python tools/processar_fila.py --aplicar --servidor pve-free
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
from energia_painel import PANEL_IDS, energia, estado as estado_do_painel  # noqa: E402
from restaurar_do_arquivo import (  # noqa: E402
    bases_por_perto, injetar, mover, mundo_do_pacote,
)
from restaurar_base import (  # noqa: E402
    NEEDED_SECTIONS, apagar, baixar, base_camp_por_id, enviar, indices,
    info_arquivo, norm_uid, renomear, servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"


def esperar_estado(pid: str, alvo: str, limite: int = 300) -> None:
    print(f"  aguardando '{alvo}'...", flush=True)
    t0 = time.time()
    while time.time() - t0 < limite:
        time.sleep(6)
        atual = estado_do_painel(pid)
        if atual == alvo:
            print(f"  chegou em '{alvo}' em {int(time.time()-t0)}s")
            return
        if alvo == "running" and atual == "starting" and time.time() - t0 > 90:
            print("  segue em 'starting' — é o egg da ENX, aceito como pronto")
            return
    sys.exit(f"não chegou em '{alvo}' em {limite}s")


def pendentes(conn, servidor_filtro: str | None):
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, discord_id, server_slug, palworld_uid, snapshot_id,
                   dest_x, dest_y, dest_z, created_at
            from base_restore_requests
            where status = 'fila'
              and (%s::text is null or server_slug = %s)
            order by server_slug, created_at
            """,
            (servidor_filtro, servidor_filtro),
        )
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def marcar(conn, req_id: int, status: str, detail: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update base_restore_requests
            set status = %s, detail = %s,
                done_at = case when %s in ('feito', 'recusado') then now()
                               else done_at end
            where id = %s
            """,
            (status, detail[:2000], status, req_id),
        )
    conn.commit()


def pacote_da_linha(conn, slug: str, uid: str, snapshot_id: int | None):
    with conn.cursor() as cur:
        if snapshot_id:
            cur.execute(
                """
                select id, base_id, guild_name, world_x, world_y, world_z,
                       area_range, piece_count, blob, formato, taken_at
                from base_snapshots where id = %s and server_slug = %s
                """,
                (snapshot_id, slug),
            )
        else:
            cur.execute(
                """
                select id, base_id, guild_name, world_x, world_y, world_z,
                       area_range, piece_count, blob, formato, taken_at
                from base_snapshots
                where server_slug = %s and %s = any(member_uids)
                order by piece_count desc, taken_at desc
                limit 1
                """,
                (slug, uid),
            )
        return cur.fetchone()


def processar_servidor(conn, cfg, rows: list[dict], aplicar: bool) -> None:
    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED_SECTIONS}

    def _marcar(req_id: int, status: str, detail: str) -> None:
        # --simular não grava nada — nem status de pedido, nem log de
        # auditoria. O print é o único jeito de ver o que aconteceria.
        simbolo = {"feito": "✓", "recusado": "✗", "fila": "↩"}.get(status, "•")
        print(f"  {simbolo} pedido #{req_id}: {status} — {detail}", flush=True)
        if aplicar:
            marcar(conn, req_id, status, detail)

    print(f"\n=== {cfg.slug}: {len(rows)} pedido(s) em fila ===", flush=True)

    pid = PANEL_IDS.get(cfg.slug)
    if aplicar and not pid:
        for r in rows:
            _marcar(r["id"], "recusado", f"sem panelId para {cfg.slug}")
        return

    if aplicar:
        print("  parando o servidor...", flush=True)
        energia(pid, "stop")
        esperar_estado(pid, "offline")
    elif pid and estado_do_painel(pid) != "offline":
        print("  ⚠️ simulação com o servidor ainda no ar — os números batem, "
              "mas 'aplicar' vai parar o servidor antes de gravar")

    caminho = SAVE_PATH.format(guid=cfg.guid)
    t0 = time.time()
    original = baixar(cfg, caminho)
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    atual = gvas.properties["worldSaveData"]["value"]
    print(f"  save vivo: {len(original):,} bytes, lido em {time.time()-t0:.0f}s", flush=True)

    aplicados: list[tuple[dict, str, str]] = []  # (linha, base_id, detail de sucesso)

    for r in rows:
        uid = norm_uid(r["palworld_uid"])
        linha = pacote_da_linha(conn, cfg.slug, uid, r["snapshot_id"])
        if not linha:
            _marcar(r["id"], "recusado", "não há base arquivada para esse jogador")
            continue

        (sid, base_id, guild_nome, ox, oy, oz, raio, pecas, blob, formato, quando) = linha

        if formato < 2:
            _marcar(r["id"], "recusado",
                    "snapshot em formato antigo, sem o fecho de referências")
            continue

        if base_id in base_camp_por_id(atual):
            _marcar(r["id"], "recusado", "essa base já existe no save atual")
            continue

        pacote = pickle.loads(gzip.decompress(blob))
        pacote_mundo = mundo_do_pacote(pacote)

        dx, dy, dz = (r["dest_x"], r["dest_y"], r["dest_z"])
        moveu = dx is not None and dy is not None and dz is not None
        destino = (dx, dy, dz) if moveu else (ox, oy, oz)

        vizinhas = bases_por_perto(atual, destino, raio, ignorar=base_id)
        if vizinhas:
            _marcar(r["id"], "recusado",
                    f"destino encosta em {len(vizinhas)} base(s) — escolha outro lugar")
            continue

        if moveu:
            delta = (dx - ox, dy - oy, dz - oz)
            alvos = [pacote["base"], *pacote["pecas"]]
            movidas, _ignoradas = mover(alvos, (ox, oy, oz), delta, raio)
            if movidas < len(alvos):
                _marcar(r["id"], "recusado",
                        "menos de uma posição movida por peça — abortado antes de gravar")
                continue

        rel = injetar(atual, pacote_mundo, base_id, uid)
        if rel["erro"]:
            _marcar(r["id"], "recusado", rel["erro"])
            continue

        detail = (f"base de {guild_nome or '(sem guild)'} devolvida, "
                  f"{pecas} peça(s), snapshot #{sid} de {quando:%d/%m %H:%M}"
                  + (" — deslocada" if moveu else " — no lugar original"))
        print(f"  … pedido #{r['id']}: aplicado em memória, {detail}", flush=True)
        aplicados.append((r, base_id, detail))

    if not aplicados:
        print("  nenhum pedido aplicável nesta rodada.")
        if aplicar and pid:
            print("  religando o servidor (nada para gravar)...", flush=True)
            energia(pid, "start")
            esperar_estado(pid, "running")
        return

    print(f"\n  {len(aplicados)} pedido(s) aplicado(s) em memória, reserializando...", flush=True)
    t0 = time.time()
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    volta, _ = decompress_sav_to_gvas(novo)
    recheck = GvasFile.read(volta, PALWORLD_TYPE_HINTS,
                            custom).properties["worldSaveData"]["value"]
    print(f"  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s")

    presentes_apos = base_camp_por_id(recheck)
    perdidos = [(r, bid, detail) for (r, bid, detail) in aplicados if bid not in presentes_apos]

    if perdidos:
        # Uma base que some no ciclo de escrita é sintoma de que este lote
        # inteiro não é confiável — não é só dela. Nada é gravado: o pedido
        # perdido vira recusado (não adianta tentar de novo sozinho, o
        # problema é no snapshot dele), e os outros voltam para `fila` para
        # a próxima rodada tentar de novo, em vez de serem descartados.
        ids_perdidos = {r["id"] for r, _bid, _detail in perdidos}
        for r, bid, _detail in perdidos:
            _marcar(r["id"], "recusado",
                    f"a base {bid[:8]}… não sobreviveu à reserialização — nada foi gravado neste lote")
        for r, _bid, _detail in aplicados:
            if r["id"] not in ids_perdidos:
                _marcar(r["id"], "fila", "devolvido à fila: outro pedido do lote falhou na reserialização")
        print(f"  ❌ {len(perdidos)} base(s) não sobreviveram à reserialização. "
              f"Nada gravado; os demais voltam para a fila.")
        if aplicar and pid:
            energia(pid, "start")
            esperar_estado(pid, "running")
        return

    sobreviventes = [(r, detail) for (r, _bid, detail) in aplicados]

    if not aplicar:
        print(f"\n  (simulação — nada foi gravado; {len(aplicados)} pedido(s) passariam)")
        return

    seguranca = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, seguranca, original)
    conf = info_arquivo(cfg, seguranca)
    if not conf or conf[0] != len(original):
        # Falha de infra (SFTP, rede), não do pedido — devolve para a fila
        # em vez de recusar quem só teve azar com a conexão.
        for r, _detail in sobreviventes:
            _marcar(r["id"], "fila", "backup de segurança incompleto nesta rodada — devolvido à fila")
        if pid:
            energia(pid, "start")
            esperar_estado(pid, "running")
        return

    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(novo):
        apagar(cfg, temporario)
        for r, _detail in sobreviventes:
            _marcar(r["id"], "fila", "upload incompleto nesta rodada — devolvido à fila")
        if pid:
            energia(pid, "start")
            esperar_estado(pid, "running")
        return

    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes, por rename)")

    for r, detail in sobreviventes:
        _marcar(r["id"], "feito", detail)

    print("  religando o servidor...", flush=True)
    energia(pid, "start")
    esperar_estado(pid, "running")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--servidor", default=None, help="processa só este slug; vazio = todos")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    todos = servidores()
    if args.servidor and args.servidor not in todos:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    conn = psycopg.connect(os.environ["DATABASE_URL"])
    try:
        # "" (vazio) e None significam a mesma coisa: sem filtro. O workflow
        # sempre manda a flag, vazia quando o campo não foi preenchido.
        linhas = pendentes(conn, args.servidor or None)
        if not linhas:
            print("fila vazia — nada a fazer.")
            return 0

        por_servidor: dict[str, list] = {}
        for r in linhas:
            por_servidor.setdefault(r["server_slug"], []).append(r)

        if args.aplicar:
            for r in linhas:
                marcar(conn, r["id"], "rodando", "")

        saida = 0
        for slug, rows in por_servidor.items():
            cfg = todos.get(slug)
            if not cfg:
                print(f"\n=== {slug}: {len(rows)} pedido(s), mas o servidor não está "
                      "em PALLEIRA_SERVERS ===")
                for r in rows:
                    print(f"  ✗ pedido #{r['id']}: recusado — '{slug}' não está em PALLEIRA_SERVERS")
                    if args.aplicar:
                        marcar(conn, r["id"], "recusado", f"'{slug}' não está em PALLEIRA_SERVERS")
                continue
            try:
                processar_servidor(conn, cfg, rows, args.aplicar)
            except Exception as err:  # noqa: BLE001
                print(f"\n  ✗ {slug}: {type(err).__name__}: {err}", flush=True)
                saida = 1
                if args.aplicar:
                    for r in rows:
                        marcar(conn, r["id"], "recusado", f"erro inesperado: {err}")
        return saida
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
