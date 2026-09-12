#!/usr/bin/env python3
"""
Kicka quem o PalDefender flagra por dano/stamina em rajada.

O anticheat detecta mas **não pune** essas duas heurísticas: ele escreve
`*may be* a cheater! … Not taking any actions, since this requires human
judgement.` e segue o jogo. O motivo é bom — lag e dessincronia geram falso
positivo, e o próprio log mostra isso: em 11/09/2026 o `Santos`, que não
usa nada, acumulou 12 avisos em 5 minutos num pico de lag.

O que separa lag de cheat é o **volume em rajada**, não o aviso isolado.
Medido no mesmo dia, nos logs de três dias do Dominantes:

    Kaninos   283 avisos no total   pico de  46 em 5 min   ← cheat (dano 57x)
    Santos     14 avisos no total   pico de  12 em 5 min   ← lag
    xNEGANx    15 avisos no total   pico de   4 em 5 min   ← lag
    Marcelo     7 avisos no total   pico de   5 em 5 min   ← lag

Daí o limiar padrão: **30 avisos em 5 minutos**, o dobro do pior caso
inocente já visto e bem abaixo do cheater real. Escolhido pelo dono.

⚠️ **Estátua de poder e outros buffs.** Quando o servidor amadurecer,
jogador honesto vai bater acima do valor base da arma. O PalDefender já
conta com isso — compara contra `BasePower*ShotAttackWithBuff`, que é o
poder **com** buff, e a heurística só acusa acima de
`damageCheatDetectionWeaponBasePowerMultiplier` (1.5 no Config.json, ou
seja 50% de folga). Se mesmo assim aparecer gente honesta no relatório,
o caminho é subir esse multiplicador no Config.json do PalDefender —
não afrouxar o limiar daqui, que é o que separa rajada de aviso solto.

Como funciona: lê o log de cheats mais recente por SFTP (o PalDefender abre
um arquivo novo a cada boot, em `PalDefender/Logs/Cheats/`), conta os avisos
por jogador numa janela deslizante e, para quem passar, manda `Broadcast` com
o motivo e `KickPlayer` por RCON.

Uso:
    python tools/vigia_cheats.py --servidor pvp-free            # só relata
    python tools/vigia_cheats.py --servidor pvp-free --aplicar  # kicka
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import struct
import sys
import time

import paramiko

LOGS_CHEATS = "Pal/Binaries/Win64/PalDefender/Logs/Cheats"

# Ver o cabeçalho: 30 em 5 min separa lag de cheat com folga dos dois lados.
LIMIAR_PADRAO = 30
JANELA_SEGUNDOS = 300

# Quem já foi kickado nesta rodada não leva kick de novo pelos mesmos avisos:
# o log não some quando a pessoa sai, então sem isto o script kickaria um
# ausente a cada execução. O arquivo guarda o último kick por jogador.
ESTADO = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".vigia_cheats.json")
REKICK_APOS_SEGUNDOS = 3600


# ----------------------------------------------------------------- servidores

def servidores() -> dict:
    bruto = os.environ.get("PALLEIRA_SERVERS", "").strip()
    if not bruto:
        sys.exit("PALLEIRA_SERVERS ausente (JSON com a lista de servidores)")
    return {s["slug"]: s for s in json.loads(bruto)}


def rcon_senha(slug: str) -> str:
    indice = {"pve-free": "1", "pve-vip": "2", "pvp-free": "3"}[slug]
    senha = os.environ.get(f"SRV{indice}_ADMIN_PASSWORD", "")
    if not senha:
        sys.exit(f"SRV{indice}_ADMIN_PASSWORD ausente")
    return senha


# Mesmas portas de lib/servers.ts — não são segredo.
RCON_PORTAS = {"pve-free": 10055, "pve-vip": 10055, "pvp-free": 10056}


# ------------------------------------------------------------------ leitura

def log_mais_recente(sftp) -> tuple[str, str]:
    """O arquivo de cheats aberto no boot atual, com o conteúdo."""
    try:
        arquivos = sftp.listdir(LOGS_CHEATS)
    except FileNotFoundError:
        return "", ""
    if not arquivos:
        return "", ""

    alvo = max(arquivos, key=lambda n: sftp.stat(f"{LOGS_CHEATS}/{n}").st_mtime)
    with sftp.open(f"{LOGS_CHEATS}/{alvo}") as f:
        return alvo, f.read().decode(errors="replace")


LINHA = re.compile(r"\[(\d\d):(\d\d):(\d\d)\].*?'([^']+)' \(UserId=([^,]+),")

# As duas formas que o aviso de dano assume no log:
#   heurística  → "BasePower=1000 above 1.50x equipped weapon AttackValue=20"
#   nativa      → "reported NativeDamageValue=360 but expected ...=1200"
ACIMA = re.compile(r"BasePower=(\d+) above [\d.]+x equipped weapon AttackValue=(\d+)")
NATIVO = re.compile(r"reported NativeDamageValue=(\d+) but expected \S+=(\d+)")


def bateu_mais_forte(linha: str) -> bool:
    """
    Se o aviso é de dano ACIMA do que a arma permite.

    Medido em 11/09/2026: metade dos avisos é de dano **abaixo** do esperado
    (`NativeDamageValue=360 but expected 1200`, desarmado) — isso é
    dessincronia de rede, e bater mais fraco não beneficia ninguém. Contar
    esses avisos kickaria jogador honesto: foi o caso de xNEGANx, DankiBase
    e HordaS Mari, que só apareceram por baterem menos do que deviam.
    """
    m = ACIMA.search(linha)
    if m:
        return int(m.group(1)) > int(m.group(2))
    m = NATIVO.search(linha)
    if m:
        return int(m.group(1)) > int(m.group(2))
    # Stamina e outras heurísticas não trazem número para comparar; entram
    # na contagem, porque ali não existe o equivalente a "bateu mais fraco".
    return True


def rajadas(texto: str, limiar: int) -> dict[str, tuple[str, int]]:
    """
    Quem passou do limiar dentro da janela. Devolve nome → (userId, pico).

    A janela é deslizante e não fixa de propósito: um cheater que distribui
    os golpes entre dois blocos de cinco minutos escaparia de um balde fixo.
    """
    eventos: dict[str, list[tuple[int, str]]] = {}
    for linha in texto.splitlines():
        m = LINHA.search(linha)
        if not m or not bateu_mais_forte(linha):
            continue
        h, mi, s, nome, uid = m.groups()
        segundos = int(h) * 3600 + int(mi) * 60 + int(s)
        eventos.setdefault(nome, []).append((segundos, uid))

    achados = {}
    for nome, lista in eventos.items():
        lista.sort()
        pico, uid_pico = 0, ""
        for i, (inicio, uid) in enumerate(lista):
            j = i
            while j < len(lista) and lista[j][0] - inicio <= JANELA_SEGUNDOS:
                j += 1
            if j - i > pico:
                pico, uid_pico = j - i, uid
        if pico >= limiar:
            achados[nome] = (uid_pico, pico)
    return achados


# --------------------------------------------------------------------- rcon

def rcon(host: str, porta: int, senha: str, comandos: list[str]) -> list[str]:
    """Autentica e roda os comandos em sequência, na mesma conexão."""

    def pacote(ident: int, tipo: int, corpo: str) -> bytes:
        dados = corpo.encode("utf8")
        return (
            struct.pack("<iii", len(dados) + 10, ident, tipo)
            + dados
            + b"\x00\x00"
        )

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

    respostas = []
    with socket.create_connection((host, porta), timeout=15) as sock:
        sock.sendall(pacote(1, 3, senha))  # SERVERDATA_AUTH
        receber(sock)
        for i, cmd in enumerate(comandos):
            sock.sendall(pacote(10 + i, 2, cmd))  # SERVERDATA_EXECCOMMAND
            respostas.append(receber(sock).strip())
            time.sleep(0.7)
    return respostas


def kickar(cfg: dict, slug: str, nome: str, uid: str, pico: int) -> list[str]:
    """
    Anuncia o motivo e expulsa.

    ⚠️ O `Broadcast` do Palworld corta a mensagem no primeiro espaço — por
    isso o underscore. Sem ele só a primeira palavra chega ao chat.
    """
    seguro = re.sub(r"[^A-Za-z0-9]", "_", nome)[:24]
    comandos = [
        f"Broadcast {seguro}_FOI_KICKADO",
        "Broadcast MOTIVO:_ANTICHEAT_DE_DANO",
        f"Broadcast {pico}_DETECCOES_EM_5_MINUTOS",
        f"KickPlayer {uid}",
    ]
    return rcon(cfg["host"], RCON_PORTAS[slug], rcon_senha(slug), comandos)


# ------------------------------------------------------------------- estado

def carregar_estado() -> dict:
    try:
        with open(ESTADO, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def salvar_estado(estado: dict) -> None:
    with open(ESTADO, "w", encoding="utf-8") as f:
        json.dump(estado, f, indent=2)


# -------------------------------------------------------------------- rodada

def uma_rodada(sftp, cfg: dict, slug: str, limiar: int, aplicar: bool,
               estado: dict, silencioso: bool = False) -> bool:
    """Lê o log, kicka quem passou e diz se houve kick."""
    arquivo, texto = log_mais_recente(sftp)
    if not texto:
        if not silencioso:
            print("sem log de cheats — nada a fazer")
        return False

    achados = rajadas(texto, limiar)
    if not achados:
        if not silencioso:
            print(f"lendo {arquivo}: ninguém passou de {limiar} detecções em 5 min")
        return False

    agora = time.time()
    houve = False
    for nome, (uid, pico) in sorted(achados.items(), key=lambda x: -x[1][1]):
        chave = f"{slug}:{uid}"
        if agora - estado.get(chave, 0) < REKICK_APOS_SEGUNDOS:
            continue  # já kickado por estes mesmos avisos

        print(f"  [CHEAT] {nome} ({uid}): pico de {pico} em 5 min", flush=True)
        if not aplicar:
            houve = True
            continue

        try:
            for r in kickar(cfg, slug, nome, uid, pico):
                print(f"     {r}", flush=True)
            estado[chave] = agora
            houve = True
        except OSError as e:
            print(f"     [ERRO] RCON falhou: {e}", flush=True)

    return houve


# --------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--servidor", required=True, choices=sorted(RCON_PORTAS))
    ap.add_argument("--limiar", type=int, default=LIMIAR_PADRAO)
    ap.add_argument("--aplicar", action="store_true", help="kicka de verdade")
    ap.add_argument("--vigiar", type=int, metavar="MINUTOS",
                    help="fica vigiando por este tempo, checando a cada --intervalo")
    ap.add_argument("--intervalo", type=int, default=30, metavar="SEGUNDOS",
                    help="de quanto em quanto tempo checar no modo --vigiar")
    args = ap.parse_args()

    cfg = servidores()[args.servidor]
    estado = carregar_estado()

    def abrir_sftp():
        tr = paramiko.Transport((cfg["host"], 2022))
        tr.connect(username=cfg["user"], password=cfg["password"])
        return tr, paramiko.SFTPClient.from_transport(tr)

    # Rodada única: o comportamento de sempre.
    if not args.vigiar:
        transporte, sftp = abrir_sftp()
        try:
            uma_rodada(sftp, cfg, args.servidor, args.limiar, args.aplicar, estado)
        finally:
            transporte.close()
        if args.aplicar:
            salvar_estado(estado)
        else:
            print("\n(rode com --aplicar para kickar)")
        return 0

    # Modo vigia: uma execução longa em vez de muitas curtas.
    #
    # O GitHub cobra o minuto cheio de runner mesmo quando o script leva 1,2s,
    # então rodar de 30 em 30 minutos custa o mesmo que ficar vigiando 30
    # minutos seguidos — e vigiando o kick sai em segundos em vez de meia
    # hora. A conexão SFTP é reaproveitada entre as checagens; se cair (o
    # servidor reinicia 5x por dia), reconecta na próxima volta.
    fim = time.time() + args.vigiar * 60
    print(f"vigiando {args.servidor} por {args.vigiar} min, "
          f"checando a cada {args.intervalo}s (limiar {args.limiar})", flush=True)

    transporte = sftp = None
    checagens = 0
    try:
        while time.time() < fim:
            try:
                if sftp is None:
                    transporte, sftp = abrir_sftp()
                uma_rodada(sftp, cfg, args.servidor, args.limiar, args.aplicar,
                           estado, silencioso=True)
                checagens += 1
            except (OSError, paramiko.SSHException) as e:
                print(f"  [ERRO] falha na checagem ({e}); reconectando", flush=True)
                if transporte:
                    transporte.close()
                transporte = sftp = None
            time.sleep(args.intervalo)
    finally:
        if transporte:
            transporte.close()
        if args.aplicar:
            salvar_estado(estado)

    print(f"fim da vigia — {checagens} checagens", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
