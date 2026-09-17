#!/usr/bin/env python3
"""
Substituto local do workflow `deliver-pal-template.yml`, enquanto o GitHub
Actions da conta está bloqueado por pendência de cobrança (17/09/2026).

Faz as DUAS fases do resgate de Pal na mesma máquina, em loop:
  1. escreve o template em Pal/Binaries/.../PalDefender/Pals/Templates/, por
     SFTP — o que o Actions fazia (ver tools/escrever_template_pal.py).
  2. chama `givepal_j` por RCON — o que hoje só `continuarResgate` (Vercel)
     fazia.

Assim nenhuma etapa fica esperando o Actions: rodando este script em loop
numa máquina que já fica ligada o dia todo, os resgates completam sozinhos.

Uso:
    python tools/entregar_pals_local.py                 # loop contínuo
    python tools/entregar_pals_local.py --uma-vez        # processa o que
                                                          # houver e sai

Variáveis de ambiente (mesmas dos outros scripts em tools/):
    DATABASE_URL
    SRV1_ADMIN_PASSWORD, SRV2_ADMIN_PASSWORD, SRV3_ADMIN_PASSWORD  (RCON)
    PALLEIRA_SFTP_USER_<SLUG>, PALLEIRA_SFTP_PASSWORD  (SFTP)

Reaproveita a mesma trava de idempotência do script original: só mexe em
transferências com status 'aguardando_arquivo', e o UPDATE final exige
`status = 'arquivo_pronto'` antes de aplicar o RCON — rodar duas cópias
deste script ao mesmo tempo não entrega o mesmo Pal duas vezes.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import socket
import struct
import sys
import time
from dataclasses import dataclass

import paramiko
import psycopg

TEMPLATES_DIR = "Pal/Binaries/Win64/PalDefender/Pals/Templates"
INTERVALO_SEGUNDOS = 30

# Host e porta não são segredo — vêm de lib/servers.ts.
SERVIDORES = {
    "pve-free": {"host": "enx-soc-20.enx.host", "rcon_port": 10055, "panel_id": "0c079595", "srv_idx": "1"},
    "pve-vip": {"host": "enx-cirion-30.enx.host", "rcon_port": 10055, "panel_id": "6eb8d521", "srv_idx": "2"},
    "pvp-free": {"host": "enx-cirion-16.enx.host", "rcon_port": 10056, "panel_id": "59ec87fa", "srv_idx": "3"},
}


@dataclass
class Alvo:
    slug: str
    host: str
    sftp_user: str
    sftp_password: str
    rcon_port: int
    rcon_password: str


def carregar_alvos() -> dict[str, Alvo]:
    sftp_senha = os.environ.get("PALLEIRA_SFTP_PASSWORD", "")
    if not sftp_senha:
        sys.exit("PALLEIRA_SFTP_PASSWORD ausente")

    alvos = {}
    for slug, cfg in SERVIDORES.items():
        rcon_senha = os.environ.get(f"SRV{cfg['srv_idx']}_ADMIN_PASSWORD", "")
        if not rcon_senha:
            print(f"aviso: SRV{cfg['srv_idx']}_ADMIN_PASSWORD ausente — {slug} fica de fora")
            continue
        alvos[slug] = Alvo(
            slug=slug,
            host=cfg["host"],
            sftp_user=f"qv6mfi1u.{cfg['panel_id']}",
            sftp_password=sftp_senha,
            rcon_port=cfg["rcon_port"],
            rcon_password=rcon_senha,
        )
    return alvos


# --------------------------------------------------------------------- rcon

def uid_para_comando(uid: str) -> str:
    limpo = uid.replace("-", "").upper()
    if len(limpo) != 32:
        return limpo
    return "-".join([limpo[0:8], limpo[8:16], limpo[16:24], limpo[24:]])


def rcon_comando(host: str, porta: int, senha: str, comando: str) -> str:
    def pacote(ident: int, tipo: int, corpo: str) -> bytes:
        dados = corpo.encode("utf8")
        return struct.pack("<iii", len(dados) + 10, ident, tipo) + dados + b"\x00\x00"

    def receber(sock: socket.socket) -> str:
        cabeca = sock.recv(4)
        if len(cabeca) < 4:
            return ""
        tamanho = struct.unpack("<i", cabeca)[0]
        corpo = b""
        while len(corpo) < tamanho:
            pedaco = sock.recv(tamanho - len(corpo))
            if not pedaco:
                break
            corpo += pedaco
        return corpo[8:-2].decode("utf8", errors="replace")

    with socket.create_connection((host, porta), timeout=15) as sock:
        sock.sendall(pacote(1, 3, senha))
        receber(sock)  # resposta de auth, descartada
        sock.sendall(pacote(10, 2, comando))
        time.sleep(0.7)
        return receber(sock).strip()


def rcon_ok(resposta: str) -> bool:
    return not resposta.lower().startswith(("failed", "unknown command"))


# --------------------------------------------------------------------- sftp

def escrever_arquivo(alvo: Alvo, arquivo: str, template: dict) -> tuple[bool, str]:
    transport = paramiko.Transport((alvo.host, 2022))
    try:
        transport.connect(username=alvo.sftp_user, password=alvo.sftp_password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        destino = f"{TEMPLATES_DIR}/{arquivo}.json"
        conteudo = json.dumps(template, ensure_ascii=False).encode("utf-8")
        sftp.putfo(io.BytesIO(conteudo), destino)
        tamanho = sftp.stat(destino).st_size
        if tamanho != len(conteudo):
            return False, f"escreveu {tamanho} bytes, esperava {len(conteudo)}"
        return True, f"escrito em {destino} ({tamanho} bytes)"
    except Exception as e:  # noqa: BLE001
        return False, str(e)
    finally:
        transport.close()


# --------------------------------------------------------------- pipeline

def processar_pendentes(conn, alvos: dict[str, Alvo]) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, server_slug, palworld_uid, arquivo, template
              from pal_transfers
             where direction = 'resgatar' and status = 'aguardando_arquivo'
             order by created_at
            """
        )
        pendentes = cur.fetchall()

    for transfer_id, slug, uid, arquivo, template in pendentes:
        alvo = alvos.get(slug)
        pal_id = template.get("PalID", "?") if isinstance(template, dict) else "?"
        if not alvo:
            print(f"#{transfer_id} ({pal_id}): servidor '{slug}' sem credencial configurada — pulando")
            continue
        if not arquivo:
            print(f"#{transfer_id} ({pal_id}): sem nome de arquivo — pulando")
            continue

        print(f"#{transfer_id} ({pal_id}) em {slug}: escrevendo arquivo…")
        ok, detalhe = escrever_arquivo(alvo, arquivo, template)
        if not ok:
            marcar(conn, transfer_id, "falhou", detalhe, exige_status="aguardando_arquivo")
            print(f"  falhou ao escrever: {detalhe}")
            continue
        print(f"  {detalhe}")

        marcar(conn, transfer_id, "arquivo_pronto", detalhe, exige_status="aguardando_arquivo")

        print(f"#{transfer_id}: chamando givepal_j por RCON…")
        try:
            comando = f"givepal_j {uid_para_comando(uid)} {arquivo}"
            resposta = rcon_comando(alvo.host, alvo.rcon_port, alvo.rcon_password, comando)
        except Exception as e:  # noqa: BLE001
            # Sem resposta: não sabe se entregou. Fica em arquivo_pronto de
            # propósito — igual continuarResgate — para não arriscar duplicar.
            print(f"  RCON sem resposta: {e}")
            marcar_detalhe(conn, transfer_id, f"RCON sem resposta: {e}")
            continue

        if not rcon_ok(resposta):
            marcar(conn, transfer_id, "falhou", resposta, exige_status="arquivo_pronto")
            print(f"  RCON recusou: {resposta}")
            continue

        marcar(conn, transfer_id, "concluido", resposta, exige_status="arquivo_pronto")
        print(f"  entregue: {resposta}")

    return len(pendentes)


def marcar(conn, transfer_id: int, status: str, detail: str, exige_status: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update pal_transfers
               set status = %s, detail = %s,
                   finished_at = case when %s in ('concluido', 'falhou') then now() else finished_at end
             where id = %s and status = %s
            """,
            (status, detail[:500], status, transfer_id, exige_status),
        )
    conn.commit()


def marcar_detalhe(conn, transfer_id: int, detail: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update pal_transfers set detail = %s where id = %s",
            (detail[:500], transfer_id),
        )
    conn.commit()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uma-vez", action="store_true", help="processa o que houver agora e sai")
    ap.add_argument("--intervalo", type=int, default=INTERVALO_SEGUNDOS)
    args = ap.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit("DATABASE_URL ausente")

    alvos = carregar_alvos()
    if not alvos:
        sys.exit("nenhum servidor com credencial completa — confira as env vars")

    print(f"vigiando pal_transfers em {', '.join(alvos)} — ctrl+c para parar")
    while True:
        conn = psycopg.connect(database_url)
        try:
            n = processar_pendentes(conn, alvos)
            if n == 0:
                print(".", end="", flush=True)
        finally:
            conn.close()
        if args.uma_vez:
            return 0
        time.sleep(args.intervalo)


if __name__ == "__main__":
    raise SystemExit(main())
