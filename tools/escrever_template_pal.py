#!/usr/bin/env python3
"""
Escreve o arquivo de um Pal no servidor do jogo, por SFTP (§7.3 do PROMPT.md).

Roda no GitHub Actions, não na Vercel: `givepal_j` e `POST /give/paltemplate`
só aceitam **nome de arquivo**, não o JSON do Pal — o arquivo precisa existir
antes, em `Pal/Binaries/Win64/PalDefender/Pals/Templates/`. Escrever lá é
SFTP, e a Vercel não fala SFTP (mesma razão do editor de `Level.sav`, §3.8).

O que este script NÃO faz: não chama `givepal_j`. Essa parte continua rodando
da Vercel, por RCON, depois que este script confirma o arquivo escrito — é o
mesmo canal que já entrega item (`lib/palworld/rcon.ts`). Separar assim
mantém o Actions fazendo só a parte que só ele sabe fazer.

Uso:
    python tools/escrever_template_pal.py --transfer-id 42 --verificar
    python tools/escrever_template_pal.py --transfer-id 42 --aplicar

--verificar: conecta no banco e no SFTP, confere a pasta de destino, NÃO
             escreve nada. Serve para validar credencial e caminho sem
             arriscar um Pal de verdade.
--aplicar:   escreve o arquivo e atualiza `pal_transfers`.

Idempotente: só escreve se o status ainda for `aguardando_arquivo`. Rodar
duas vezes para a mesma transferência não escreve duas vezes.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from dataclasses import dataclass

import paramiko
import psycopg

TEMPLATES_DIR = "Pal/Binaries/Win64/PalDefender/Pals/Templates"


@dataclass
class ServerCfg:
    slug: str
    host: str
    user: str
    password: str
    guid: str = ""  # não usado aqui; presente porque vem do mesmo segredo


def servers_from_env() -> dict[str, ServerCfg]:
    raw = os.environ.get("PALLEIRA_SERVERS", "").strip()
    if not raw:
        sys.exit("PALLEIRA_SERVERS ausente (JSON com a lista de servidores)")
    itens = [ServerCfg(**i) for i in json.loads(raw)]
    return {c.slug: c for c in itens}


def buscar_transferencia(conn, transfer_id: int) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select server_slug, template, arquivo, status
              from pal_transfers
             where id = %s
            """,
            (transfer_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    slug, template, arquivo, status = row
    return {"server_slug": slug, "template": template, "arquivo": arquivo, "status": status}


def marcar(conn, transfer_id: int, status: str, detail: str = "") -> None:
    """
    `where status = 'aguardando_arquivo'` de propósito: se outra execução já
    resolveu esta transferência (retry manual em cima de um sucesso), esta
    chamada não reabre nem sobrescreve o que já aconteceu.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            update pal_transfers
               set status = %s, detail = %s, finished_at = now()
             where id = %s and status = 'aguardando_arquivo'
            """,
            (status, detail[:500], transfer_id),
        )
    conn.commit()


def conectar_sftp(cfg: ServerCfg) -> tuple[paramiko.Transport, paramiko.SFTPClient]:
    transport = paramiko.Transport((cfg.host, 2022))
    transport.connect(username=cfg.user, password=cfg.password)
    return transport, paramiko.SFTPClient.from_transport(transport)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--transfer-id", type=int, required=True)
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--verificar", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    conn = psycopg.connect(os.environ["DATABASE_URL"])
    transferencia = buscar_transferencia(conn, args.transfer_id)

    if not transferencia:
        sys.exit(f"pal_transfers #{args.transfer_id} não existe")

    if transferencia["status"] != "aguardando_arquivo":
        # Não é erro: outra execução (ou um retry manual) já tratou esta
        # transferência. Sair limpo em vez de reescrever por cima.
        print(f"#{args.transfer_id} já está em '{transferencia['status']}' — nada a fazer")
        return 0

    servidores = servers_from_env()
    cfg = servidores.get(transferencia["server_slug"])
    if not cfg:
        sys.exit(f"servidor '{transferencia['server_slug']}' não está em PALLEIRA_SERVERS")

    transport, sftp = conectar_sftp(cfg)
    try:
        try:
            sftp.stat(TEMPLATES_DIR)
        except FileNotFoundError:
            marcar(
                conn,
                args.transfer_id,
                "falhou",
                f"pasta não existe no servidor: {TEMPLATES_DIR}",
            )
            sys.exit(f"🔴 {TEMPLATES_DIR} não existe em {cfg.host} — nada foi escrito")

        destino = f"{TEMPLATES_DIR}/{transferencia['arquivo']}.json"

        if args.verificar:
            print(f"✅ conectado em {cfg.host}, pasta OK. Escreveria em: {destino}")
            print(f"   conteúdo: {json.dumps(transferencia['template'])[:200]}…")
            return 0

        conteudo = json.dumps(transferencia["template"], ensure_ascii=False).encode("utf-8")
        sftp.putfo(io.BytesIO(conteudo), destino)

        # Confere que o que está lá é do tamanho que mandamos — sinal barato
        # de que a escrita não parou pela metade.
        tamanho = sftp.stat(destino).st_size
        if tamanho != len(conteudo):
            marcar(
                conn,
                args.transfer_id,
                "falhou",
                f"escreveu {tamanho} bytes, esperava {len(conteudo)}",
            )
            sys.exit(f"🔴 escrita incompleta em {destino}")

        marcar(conn, args.transfer_id, "arquivo_pronto", f"escrito em {destino}")
        print(f"✅ #{args.transfer_id}: {destino} ({tamanho} bytes)")
        return 0

    except Exception as e:  # noqa: BLE001 — precisa registrar QUALQUER falha, não só a esperada
        marcar(conn, args.transfer_id, "falhou", str(e))
        raise
    finally:
        transport.close()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
