#!/usr/bin/env python3
"""
Tira da whitelist quem fica saindo e entrando para resetar spawn.

O jogador descobriu que sair e voltar ao servidor **recria o spawn** da área:
quando o último jogador deixa a região, o Palworld descarrega aquele pedaço do
mundo, e na volta os Pals nascem de novo. Não existe opção no jogo nem no
PalDefender que desligue isso — é do motor. O que dá para fazer é tirar o
proveito: quem repete o ciclo perde o acesso por alguns minutos.

Medido em 14/09/2026, nos 14 logs mais recentes do Dominantes:

    ESCONDE      89 sessões    75 abaixo de 30s    pico de 18 logins/10min    1 IP
    Yan           8 sessões     5 abaixo de 30s    pico de  5 logins/10min    2 IPs
    Dante        11 sessões     4 abaixo de 30s    pico de  3 logins/10min    4 IPs
    VOID          8 sessões     2 abaixo de 30s                               1 IP

Daí o limiar escolhido pelo dono: **mais de 5 quedas em 10 minutos**. Não é
zona cinzenta como foi no anticheat de dano — a diferença entre o infrator e o
resto do servidor é de uma ordem de grandeza.

A punição é gradual, e sempre por mensagem privada:

    1ª vez   aviso  ("verifique sua conexão")
    2ª vez   aviso  ("este é o último aviso")
    3ª vez   suspensão de  5 min
    4ª vez   suspensão de 15 min
    5ª vez   suspensão de 30 min
    6ª+      suspensão de 60 min

Quem ficar `ESQUECER_APOS_MIN` sem reincidir volta à estaca zero — avisos e
escada. Quem tem internet ruim de verdade costuma parar no primeiro recado e
nunca chega à suspensão.

⚠️ **Queda de internet parece a mesma coisa, e a diferença está no IP.** Quem
cai de conexão reconecta de redes diferentes (o Dante aparece com 4 IPs, o Loki
com 4, a HordaS Mari com 4). Quem está abusando fica no mesmo IP o tempo todo —
o ESCONDE tem 1 só, em 89 sessões. Por isso o `--min-ips`: acima desse número
de IPs distintos o jogador não é punido, por mais curtas que sejam as sessões.

Como funciona: lê o log do PalDefender por SFTP (ele abre um arquivo novo a cada
boot, em `PalDefender/Logs/`), casa cada `has logged in` com o `has logged out`
seguinte do mesmo UserId, conta as sessões curtas numa janela deslizante e, para
quem passar, remove o UserId do `WhiteList.json` e manda `reloadcfg` por RCON.
A reposição é automática: quem cumpriu o tempo volta na execução seguinte.

Uso:
    python tools/vigia_relog.py --servidor pvp-free            # só relata
    python tools/vigia_relog.py --servidor pvp-free --aplicar  # pune de verdade
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

PALDEFENDER = "Pal/Binaries/Win64/PalDefender"
LOGS = f"{PALDEFENDER}/Logs"
WHITELIST = f"{PALDEFENDER}/WhiteList.json"

# Escolhido pelo dono em 14/09/2026: mais de 5 quedas em 10 minutos.
#
# Era 20 min até o incidente do Santos na mesma noite: a janela mais curta
# reduz ainda mais o risco do bug de contagem de histórico (ver o aviso em
# `Sessoes`) voltar a incomodar, mesmo já corrigido — quanto menor a janela,
# menos chance de um relog velho ainda estar "dentro" dela.
LIMIAR_PADRAO = 5
JANELA_SEGUNDOS = 600
# Sessão "curta" — o ciclo de resetar spawn leva segundos, não minutos.
SESSAO_CURTA_SEGUNDOS = 60
# Acima disto, são redes diferentes: é queda de conexão, não abuso.
MIN_IPS_PARA_INOCENTAR = 3

COOLDOWN_PADRAO_MIN = 5

# Quanto tempo a pessoa tem para parar depois de cada aviso.
#
# 🔴 **O aviso vem primeiro, e quem para não é punido.** Mesmo desenho do
# anticheat de dano (`PRAZO_AVISO_MS` em app/api/anticheat/route.ts), que o
# dono pediu em 12/09/2026 depois de conversar com um jogador e ele desligar o
# que estava usando. Aqui faz ainda mais sentido: a mensagem fala em
# *verifique sua conexão*, e suspender no mesmo segundo não daria chance
# nenhuma de fazer isso — seria incoerente com o próprio texto.
PRAZO_AVISO_MIN = 3

# Quantos avisos antes da primeira suspensão. Escolhido pelo dono em
# 14/09/2026: **a terceira vez já é a punição** — dois recados, e na terceira
# aparição o acesso é suspenso. Quem tem internet ruim de verdade costuma
# parar no primeiro ou no segundo e nunca chega lá.
AVISOS_ANTES_DE_PUNIR = 2

# Depois de tanto tempo sem reincidir, avisos e escada voltam à estaca zero.
# Sem isso uma queda de hoje somaria com outra da semana passada, e a escada
# subiria sozinha para quem só tem internet ruim de vez em quando.
ESQUECER_APOS_MIN = 6 * 60

# A suspensão cresce a cada reincidência — 5 min, 15, 30, 60, e daí para cima
# fica no último valor.
#
# Sem isto o castigo de 5 minutos não muda o cálculo de quem está farmando: no
# backtest de 13/09 o ESCONDE levaria ~14 suspensões seguidas de 5 min e
# continuaria, porque voltar e recomeçar saía barato. A escada resolve isso sem
# punir quem só tem conexão instável, que nunca passa do primeiro degrau.
ESCADA_MINUTOS = [5, 15, 30, 60]

# Quem está de castigo e até quando, e quem já foi avisado. Sem isto o script
# não saberia repor ninguém — e a reposição automática é metade do combinado.
ESTADO = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".vigia_relog.json")


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
#
# ⚠️ O RCON é servido pelo **PalDefender**, não pelo jogo: ele responde na
# 10056 do Dominantes mesmo com `RCONEnabled=False` no PalWorldSettings.ini,
# e o mod reescreve essa flag para False sempre que o servidor desliga.
# Verificado em 14/09/2026 — não perca tempo "consertando" o .ini.
RCON_PORTAS = {"pve-free": 10055, "pve-vip": 10055, "pvp-free": 10056}


# --------------------------------------------------------------------- rcon

def rcon(host: str, porta: int, senha: str, comandos: list[str]) -> list[str]:
    """Autentica e roda os comandos em sequência, na mesma conexão."""

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

    respostas = []
    with socket.create_connection((host, porta), timeout=15) as sock:
        sock.sendall(pacote(1, 3, senha))  # SERVERDATA_AUTH
        receber(sock)
        for i, cmd in enumerate(comandos):
            sock.sendall(pacote(10 + i, 2, cmd))  # SERVERDATA_EXECCOMMAND
            respostas.append(receber(sock).strip())
            time.sleep(0.7)
    return respostas


# ------------------------------------------------------------------ leitura

def log_mais_recente(sftp) -> tuple[str, str]:
    """O arquivo aberto no boot atual, com o conteúdo."""
    try:
        arquivos = [a for a in sftp.listdir_attr(LOGS) if a.filename.endswith(".log")]
    except FileNotFoundError:
        return "", ""
    if not arquivos:
        return "", ""

    alvo = max(arquivos, key=lambda a: a.st_mtime)
    with sftp.open(f"{LOGS}/{alvo.filename}") as f:
        return alvo.filename, f.read().decode(errors="replace")


ENTROU = re.compile(
    r"\[(\d\d):(\d\d):(\d\d)\].*?'([^']+)' \(UserId=([^,]+), IP=([^)]+)\) has logged in"
)
SAIU = re.compile(
    r"\[(\d\d):(\d\d):(\d\d)\].*?'([^']+)' \(UserId=([^,]+), IP=([^)]+)\) has logged out"
)


def _segundos(h: str, m: str, s: str) -> int:
    return int(h) * 3600 + int(m) * 60 + int(s)


class Sessoes:
    """
    Sessões fechadas por jogador, e de quantos IPs ele apareceu.

    🔴 **Só o que aconteceu nos últimos `JANELA_SEGUNDOS`, e nada mais.**

    Bug real de 14/09/2026: a versão anterior guardava TODO login do arquivo,
    desde o boot, e recalculava o "pico" varrendo o histórico inteiro a cada
    rodada — sem nunca esquecer nada. Isso tem duas consequências ruins, e as
    duas aconteceram com o Santos na mesma noite:
    (1) um jogador que fica horas conectado sem incidente ainda carrega os
    relogs de 40 minutos atrás, então uma reincidência isolada bem depois
    reabre a contagem antiga e passa do limiar sem ele ter feito nada de novo;
    (2) o próprio `KickPlayer` da suspensão gera um login+logout de 0-1s no
    log — e esse par ENTRAVA na contagem de "sessões curtas do jogador",
    fazendo a punição se realimentar: o kick de agora virava munição para o
    próximo degrau da escada, mesmo com o jogador jogando normal no meio.

    A correção: a cada leitura, descartar tudo que é mais velho que a janela
    — medido contra o instante mais recente **do próprio log**, não do
    relógio local (o servidor carimba em UTC+1, ver gotcha-horario-do-log).
    E parear duração zero como "efeito do kick", não como sessão do jogador.
    """

    def __init__(self) -> None:
        # uid → (nome, início em segundos)
        self.abertas: dict[str, tuple[str, int]] = {}
        # uid → lista de (nome, duração, instante do login)
        self.fechadas: dict[str, list[tuple[str, int, int]]] = {}
        self.ips: dict[str, set[str]] = {}
        self.agora = 0  # carimbo da última linha lida; vira o "agora" do log

    def ler(self, texto: str) -> None:
        for linha in texto.splitlines():
            m = ENTROU.search(linha)
            if m:
                h, mi, s, nome, uid, ip = m.groups()
                t = _segundos(h, mi, s)
                self.agora = max(self.agora, t)
                self.abertas[uid] = (nome, t)
                self.ips.setdefault(uid, set()).add(ip.strip())
                continue

            m = SAIU.search(linha)
            if m:
                h, mi, s, nome, uid, ip = m.groups()
                t = _segundos(h, mi, s)
                self.agora = max(self.agora, t)
                if uid not in self.abertas:
                    continue  # saiu sem login neste arquivo (veio do boot anterior)
                _, inicio = self.abertas.pop(uid)
                dur = t - inicio
                # Negativo = o log virou a meia-noite. Descartar é mais honesto
                # que somar 86400 e inventar uma sessão que ninguém viu.
                #
                # Duração 0 é o próprio KickPlayer (login e logout no mesmo
                # segundo, visto às 20:26:24 no incidente do Santos) — não é
                # o jogador saindo, é o efeito da punição anterior. Não conta.
                if dur > 0:
                    self.fechadas.setdefault(uid, []).append((nome, dur, inicio))

    def janela(self, segundos: int) -> "Sessoes":
        """Só as sessões cujo login caiu nos últimos `segundos`, a partir do
        instante mais recente visto no log — não do relógio local."""
        corte = self.agora - segundos
        recorte = Sessoes()
        recorte.agora = self.agora
        recorte.ips = self.ips
        recorte.fechadas = {
            uid: [s for s in lst if s[2] >= corte]
            for uid, lst in self.fechadas.items()
        }
        recorte.fechadas = {uid: lst for uid, lst in recorte.fechadas.items() if lst}
        return recorte


def abusadores(ses: Sessoes, limiar: int, min_ips: int) -> dict[str, tuple[str, int, int]]:
    """
    Quem passou do limiar **dentro da janela**. Devolve uid → (nome, pico, sessões curtas).

    Recebe `ses` já recortado por `Sessoes.janela()` — só o que aconteceu nos
    últimos `JANELA_SEGUNDOS`, nunca o arquivo inteiro. Ver o aviso em cima da
    classe `Sessoes`: essa é a diferença entre "pegou o abuso" e "puniu quem
    já tinha parado", que foi o bug real da noite de 14/09.
    """
    achados = {}
    for uid, lista in ses.fechadas.items():
        curtas = [d for _, d, _ in lista if d <= SESSAO_CURTA_SEGUNDOS]
        if len(curtas) < limiar:
            continue

        # Muitos IPs = internet ruim, não abuso. Ver o cabeçalho.
        if len(ses.ips.get(uid, ())) >= min_ips:
            continue

        # Dentro da janela recortada, o "pico" é simplesmente quantas sessões
        # curtas existem — não precisa de sub-janela deslizante por cima,
        # porque a janela já É o limite externo.
        pico = len(curtas)
        if pico >= limiar:
            achados[uid] = (lista[0][0], pico, len(curtas))
    return achados


# --------------------------------------------------------------- whitelist

def ler_whitelist(sftp) -> list[str]:
    with sftp.open(WHITELIST) as f:
        return json.loads(f.read().decode(errors="replace"))


def escrever_whitelist(sftp, lista: list[str]) -> None:
    """
    Grava a whitelist de volta.

    🔴 Sempre ler-modificar-gravar na hora, nunca reaproveitar uma leitura
    antiga: a staff edita a whitelist com o servidor no ar (visto no log de
    14/09, `Saved whitelist with 37` e depois `38` no mesmo boot). Gravar uma
    cópia velha apagaria quem o admin acabou de liberar.
    """
    corpo = json.dumps(lista, indent=4).encode()
    with sftp.open(WHITELIST, "w") as f:
        f.write(corpo)


def aplicar_whitelist(sftp, cfg: dict, slug: str, remover: set[str],
                      repor: set[str]) -> None:
    """Uma leitura, uma escrita, um reloadcfg — para remoções e reposições."""
    atual = ler_whitelist(sftp)
    nova = [u for u in atual if u not in remover]
    for uid in repor:
        if uid not in nova:
            nova.append(uid)

    if nova == atual:
        return

    escrever_whitelist(sftp, nova)
    # Sem isto a mudança só valeria no próximo boot. Resposta esperada:
    # "PalDefender WhiteList and Configuration reloaded!"
    resposta = rcon(cfg["host"], RCON_PORTAS[slug], rcon_senha(slug), ["reloadcfg"])
    print(f"     reloadcfg: {resposta[0] if resposta else '(sem resposta)'}", flush=True)


def avisar_e_expulsar(cfg: dict, slug: str, nome: str, uid: str, minutos: int) -> None:
    """
    Avisa a pessoa, em particular, e tira o acesso por alguns minutos.

    🔴 **A mensagem é privada e não acusa ninguém de nada.** Decisão do dono em
    14/09/2026: o recado fala em *instabilidade* — quantidade excessiva de
    quedas atrapalha o servidor — e não em trapaça. Duas razões boas para isso.
    A primeira é que às vezes é verdade: cliente ruim e internet instável
    produzem o mesmo padrão, e o `--min-ips` não pega todos os casos. A segunda
    é que acusar em público, no Broadcast, cria briga no Discord mesmo quando o
    diagnóstico está certo — e o objetivo aqui é o comportamento parar, não
    humilhar ninguém.

    Por isso **não há Broadcast**: o servidor inteiro não precisa saber. Quem
    tentar voltar antes da hora vê o `whitelistMessage` genérico do
    Config.json, que aponta para o Discord — e lá a staff conversa.

    ⚠️ O `send msg` do Palworld corta a mensagem no primeiro espaço, então o
    texto vai com underscore. Sem isso só a primeira palavra chega.
    """
    recado = (
        "AVISO:_detectamos_muitas_quedas_de_conexao_sua_em_pouco_tempo._"
        f"Isso_causa_instabilidade_no_servidor,_entao_seu_acesso_ficara_"
        f"suspenso_por_{minutos}_minutos._Verifique_sua_conexao_e_volte_em_seguida."
    )
    comandos = [
        f"send msg {uid} {recado}",
        f"KickPlayer {uid}",
    ]
    for r in rcon(cfg["host"], RCON_PORTAS[slug], rcon_senha(slug), comandos):
        if r:
            print(f"     {r}", flush=True)


def so_avisar(cfg: dict, slug: str, uid: str, prazo: int,
              numero: int, total: int) -> None:
    """
    Aviso — não pune.

    São `AVISOS_ANTES_DE_PUNIR` recados antes da primeira suspensão, e o texto
    diz em qual deles a pessoa está: sem isso o terceiro aviso é idêntico ao
    primeiro, e a suspensão chega sem a pessoa perceber que estava escalando.
    Quem parar nunca chega a ser suspenso — ver `PRAZO_AVISO_MIN`.

    A mensagem é privada e trata o caso como problema de conexão, porque às
    vezes é exatamente isso.
    """
    if numero >= total:
        fim = (
            "Este_e_o_ultimo_aviso:_se_continuar,_seu_acesso_sera_suspenso_temporariamente."
        )
    else:
        fim = (
            f"Verifique_sua_conexao._Aviso_{numero}_de_{total}_antes_de_uma_suspensao_temporaria."
        )

    recado = (
        "AVISO:_estamos_detectando_muitas_quedas_de_conexao_sua_em_pouco_tempo._"
        f"Isso_causa_instabilidade_no_servidor._{fim}"
    )
    for r in rcon(cfg["host"], RCON_PORTAS[slug], rcon_senha(slug),
                  [f"send msg {uid} {recado}"]):
        if r:
            print(f"     {r}", flush=True)


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

def uma_rodada(sftp, cfg: dict, slug: str, args, estado: dict,
               silencioso: bool = False) -> None:
    agora = time.time()

    # 1) Quem já cumpriu o castigo volta para a whitelist. Vem primeiro para
    #    que a reposição aconteça mesmo numa rodada sem nenhum infrator novo.
    repor = set()
    for chave, ate in list(estado.items()):
        if not chave.startswith(f"{slug}:"):
            continue
        if agora >= ate:
            uid = chave.split(":", 1)[1]
            repor.add(uid)
            del estado[chave]
            print(f"  [VOLTOU] {uid} cumpriu o tempo", flush=True)

    arquivo, texto = log_mais_recente(sftp)
    if not texto:
        if not silencioso:
            print("sem log — nada a fazer")
        if repor and args.aplicar:
            aplicar_whitelist(sftp, cfg, slug, set(), repor)
        return

    ses_completa = Sessoes()
    ses_completa.ler(texto)
    # Só os últimos JANELA_SEGUNDOS contam — nunca o arquivo inteiro. Ver o
    # aviso em Sessoes sobre o bug real de 14/09/2026.
    ses = ses_completa.janela(JANELA_SEGUNDOS)
    achados = abusadores(ses, args.limiar, args.min_ips)

    # 2) Quem está passando do limiar agora.
    #
    # Duas etapas, nunca uma só: na primeira vez a pessoa é **avisada** e tem
    # `--prazo` minutos para parar; só quem continua depois disso é suspenso.
    # Ver `PRAZO_AVISO_MIN`.
    remover = set()
    for uid, (nome, pico, curtas) in sorted(achados.items(), key=lambda x: -x[1][1]):
        chave = f"{slug}:{uid}"
        if chave in estado:
            continue  # já está de castigo

        ips = len(ses.ips.get(uid, ()))
        janela_min = JANELA_SEGUNDOS // 60
        print(
            f"  [RELOG] {nome} ({uid}): {curtas} sessões curtas, "
            f"pico de {pico} logins em {janela_min} min, {ips} IP(s)",
            flush=True,
        )

        # Quantos avisos esta pessoa já recebeu, e quando foi o último.
        chave_aviso = f"aviso:{slug}:{uid}"
        avisos, ultimo = estado.get(chave_aviso, [0, 0.0])

        # Aviso velho não conta: quem passou o dia inteiro sem reincidir volta
        # à estaca zero, senão uma queda hoje somaria com outra da semana
        # passada e a escada subiria sozinha.
        if ultimo and agora - ultimo > args.esquecer * 60:
            avisos = 0

        dentro_do_prazo = ultimo and agora - ultimo <= args.prazo * 60
        # Só vira punição quem já levou os avisos E continuou dentro do prazo.
        punir = avisos >= args.avisos and dentro_do_prazo

        # Quantas vezes já foi suspenso — é o degrau da escada.
        chave_degrau = f"degrau:{slug}:{uid}"
        degrau = estado.get(chave_degrau, 0)
        if degrau and agora - estado.get(f"degrau_em:{slug}:{uid}", 0) > args.esquecer * 60:
            degrau = 0  # comportou-se por um bom tempo: a escada reinicia
        minutos = ESCADA_MINUTOS[min(degrau, len(ESCADA_MINUTOS) - 1)]

        if not args.aplicar:
            if punir:
                print(f"     -> SUSPENDERIA por {minutos} min (degrau {degrau + 1})",
                      flush=True)
            else:
                print(f"     -> avisaria ({avisos + 1}º de {args.avisos})", flush=True)
            continue

        try:
            if not punir:
                so_avisar(cfg, slug, uid, args.prazo, avisos + 1, args.avisos)
                estado[chave_aviso] = [avisos + 1, agora]
                print(f"     avisado ({avisos + 1}º de {args.avisos})", flush=True)
            else:
                avisar_e_expulsar(cfg, slug, nome, uid, minutos)
                remover.add(uid)
                estado[chave] = agora + minutos * 60
                estado[chave_degrau] = degrau + 1
                estado[f"degrau_em:{slug}:{uid}"] = agora
                estado.pop(chave_aviso, None)
                print(f"     suspenso por {minutos} min (degrau {degrau + 1})",
                      flush=True)
        except OSError as e:
            print(f"     [ERRO] RCON falhou: {e}", flush=True)

    if not achados and not silencioso:
        print(f"lendo {arquivo}: ninguém passou de {args.limiar} relogs "
              f"em {JANELA_SEGUNDOS // 60} min")

    # 3) Uma escrita só na whitelist, com tudo que mudou nesta rodada.
    if args.aplicar and (remover or repor):
        aplicar_whitelist(sftp, cfg, slug, remover, repor)


# --------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--servidor", required=True, choices=sorted(RCON_PORTAS))
    ap.add_argument("--limiar", type=int, default=LIMIAR_PADRAO,
                    help="sessões curtas em 10 min que caracterizam abuso")
    ap.add_argument("--minutos", type=int, default=COOLDOWN_PADRAO_MIN,
                    help="primeiro degrau da suspensão (os seguintes sobem sozinhos)")
    ap.add_argument("--avisos", type=int, default=AVISOS_ANTES_DE_PUNIR,
                    help="quantos avisos antes da primeira suspensão")
    ap.add_argument("--prazo", type=int, default=PRAZO_AVISO_MIN,
                    help="minutos que a pessoa tem para parar depois de cada aviso")
    ap.add_argument("--esquecer", type=int, default=ESQUECER_APOS_MIN,
                    help="minutos de bom comportamento para zerar avisos e escada")
    ap.add_argument("--min-ips", type=int, default=MIN_IPS_PARA_INOCENTAR,
                    help="a partir de quantos IPs distintos considerar queda de conexão")
    ap.add_argument("--aplicar", action="store_true", help="pune de verdade")
    ap.add_argument("--repor-todos", action="store_true",
                    help="devolve à whitelist todo mundo que está suspenso e sai")
    ap.add_argument("--vigiar", type=int, metavar="MINUTOS",
                    help="fica vigiando por este tempo, checando a cada --intervalo")
    ap.add_argument("--intervalo", type=int, default=60, metavar="SEGUNDOS")
    args = ap.parse_args()

    cfg = servidores()[args.servidor]
    estado = carregar_estado()

    def abrir_sftp():
        tr = paramiko.Transport((cfg["host"], 2022))
        tr.connect(username=cfg["user"], password=cfg["password"])
        return tr, paramiko.SFTPClient.from_transport(tr)

    # Rede de segurança: devolve o acesso a quem ficou suspenso quando o vigia
    # morreu no meio do castigo. Sem isto a pessoa fica fora da whitelist até
    # um admin reparar na mão — quem sabia da dívida era o processo que caiu.
    if args.repor_todos:
        pendentes = {
            c.split(":", 1)[1] for c in estado
            if c.startswith(f"{args.servidor}:")
        }
        if not pendentes:
            print("ninguém suspenso — nada a repor")
            return 0

        print(f"repondo {len(pendentes)} suspenso(s): {', '.join(sorted(pendentes))}")
        if not args.aplicar:
            print("\n(rode com --aplicar para repor de verdade)")
            return 0

        transporte, sftp = abrir_sftp()
        try:
            aplicar_whitelist(sftp, cfg, args.servidor, set(), pendentes)
        finally:
            transporte.close()
        for uid in pendentes:
            estado.pop(f"{args.servidor}:{uid}", None)
        salvar_estado(estado)
        return 0

    if not args.vigiar:
        transporte, sftp = abrir_sftp()
        try:
            uma_rodada(sftp, cfg, args.servidor, args, estado)
        finally:
            transporte.close()
        if args.aplicar:
            salvar_estado(estado)
        else:
            print("\n(rode com --aplicar para punir)")
        return 0

    # Modo vigia: uma execução longa em vez de muitas curtas. O GitHub cobra o
    # minuto cheio de runner mesmo quando o script leva segundos, então vigiar
    # 30 minutos custa o mesmo que rodar de 30 em 30 — e aqui a reposição
    # automática precisa de alguém acordado para devolver o acesso na hora.
    fim = time.time() + args.vigiar * 60
    print(f"vigiando {args.servidor} por {args.vigiar} min, "
          f"checando a cada {args.intervalo}s (limiar {args.limiar}, "
          f"castigo {args.minutos} min)", flush=True)

    transporte = sftp = None
    try:
        while time.time() < fim:
            try:
                if sftp is None:
                    transporte, sftp = abrir_sftp()
                uma_rodada(sftp, cfg, args.servidor, args, estado, silencioso=True)
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

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
