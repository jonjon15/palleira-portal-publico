#!/usr/bin/env python3
"""
Roda as tarefas periódicas de dentro do container do jogo, sem GitHub Actions.

Existe porque em 17/09/2026 o GitHub bloqueou o Actions da conta por
cobrança ("recent account payments have failed"), e **todo** cron parou de
uma vez: import do save, arquivamento de bases, eventos do Discord. O
sintoma que chegou foi outro — o ranking do PVE Free mostrando o mundo de
antes do wipe, porque a tabela `players` congelou no último import.

O molde é o do `vigia_relog.py` já rodando no Dominantes: o startup command
do Pterodactyl é um shell de verdade, então dá para instalar dependência com
`pip --break-system-packages` e deixar um loop Python em background ao lado
do servidor. Ver `docs/vigia-no-host.md`.

⚠️ O processo morre a cada restart do container (5x por dia) — é por isso
que o startup command o religa, e é por isso que cada tarefa guarda seu
próprio horário em disco (`estado.json`): ao subir de novo ele não repete o
que já fez nem espera um ciclo inteiro para a primeira execução.

Uso (no container, a partir de /home/container/vigia):
    . ./env.sh && python3 vigia_host.py --loop

Fora do container, para testar sem escrever nada:
    python3 tools/vigia_host.py --uma-vez --simular
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Cada tarefa roda no seu ritmo. São os mesmos intervalos dos crons que o
# GitHub executava, para não mudar o comportamento junto com o meio.
TAREFAS = {
    # cron "0 */2 * * *" — o mais importante: é ele que alimenta o ranking.
    "import": {"intervalo": 2 * 3600, "script": "import_save.py", "args": []},
    # cron "40 5 * * *" — diário.
    "arquivar_bases": {"intervalo": 24 * 3600, "script": "arquivar_bases.py", "args": []},
    "arquivar_players": {"intervalo": 24 * 3600, "script": "arquivar_players.py", "args": []},
    # cron "7 * * * *" — só chama o endpoint do site, não usa save.
    "eventos": {"intervalo": 3600, "url": "https://palleira.com.br/api/eventos-do-discord"},
}

ESTADO = Path(__file__).with_name("estado.json")


def agora() -> float:
    return time.time()


def carimbo() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def log(msg: str) -> None:
    """stdout sem buffer: o `tail -F vigia.log` precisa ver na hora."""
    print(f"[{carimbo()}] {msg}", flush=True)


def ler_estado() -> dict[str, float]:
    try:
        return json.loads(ESTADO.read_text())
    except (OSError, ValueError):
        return {}


def gravar_estado(estado: dict[str, float]) -> None:
    # Gravação atômica: um restart no meio do write deixaria um JSON cortado,
    # e aí toda tarefa voltaria a rodar como se nunca tivesse rodado.
    tmp = ESTADO.with_suffix(".tmp")
    tmp.write_text(json.dumps(estado, indent=2))
    tmp.replace(ESTADO)


def rodar_script(nome: str, script: str, args: list[str], simular: bool) -> bool:
    caminho = Path(__file__).with_name(script)
    if not caminho.exists():
        log(f"  {nome}: {script} não está aqui — pulei")
        return False

    cmd = [sys.executable, str(caminho), *args]
    if simular:
        log(f"  {nome}: [simulação] rodaria {' '.join(cmd)}")
        return True

    t0 = agora()
    # timeout generoso: o import dos três saves leva ~1 min, mas um servidor
    # lento no SFTP pode esticar isso. Sem timeout, um travamento mataria
    # todas as outras tarefas junto.
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=50 * 60)
    except subprocess.TimeoutExpired:
        log(f"  {nome}: estourou o tempo limite")
        return False

    dur = agora() - t0
    saida = (r.stdout or "").strip().splitlines()
    for linha in saida[-8:]:
        log(f"    | {linha}")
    if r.returncode != 0:
        erro = (r.stderr or "").strip().splitlines()
        for linha in erro[-8:]:
            log(f"    ! {linha}")
        log(f"  {nome}: FALHOU em {dur:.0f}s (código {r.returncode})")
        return False

    log(f"  {nome}: ok em {dur:.0f}s")
    return True


def chamar_url(nome: str, url: str, simular: bool) -> bool:
    segredo = os.environ.get("CRON_SECRET", "")
    if not segredo:
        log(f"  {nome}: CRON_SECRET ausente — pulei")
        return False
    if simular:
        log(f"  {nome}: [simulação] chamaria {url}")
        return True

    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {segredo}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            corpo = r.read(300).decode("utf-8", "replace").strip()
        log(f"  {nome}: ok — {corpo[:150]}")
        return True
    except urllib.error.HTTPError as e:
        log(f"  {nome}: HTTP {e.code}")
    except Exception as e:  # rede do container pode oscilar
        log(f"  {nome}: {type(e).__name__}: {e}")
    return False


def uma_rodada(estado: dict[str, float], simular: bool, forcar: bool) -> None:
    for nome, cfg in TAREFAS.items():
        ultimo = estado.get(nome, 0.0)
        falta = cfg["intervalo"] - (agora() - ultimo)
        if falta > 0 and not forcar:
            continue

        log(f"{nome}: rodando")
        if "url" in cfg:
            ok = chamar_url(nome, cfg["url"], simular)
        else:
            ok = rodar_script(nome, cfg["script"], cfg["args"], simular)

        if ok and not simular:
            # Só marca quando deu certo: uma falha reexecuta no ciclo
            # seguinte em vez de esperar o intervalo inteiro.
            estado[nome] = agora()
            gravar_estado(estado)


def main() -> int:
    ap = argparse.ArgumentParser()
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--loop", action="store_true", help="fica rodando (uso no host)")
    modo.add_argument("--uma-vez", action="store_true", help="uma passada e sai")
    ap.add_argument("--simular", action="store_true", help="não executa nada de verdade")
    ap.add_argument("--forcar", action="store_true", help="ignora o intervalo")
    ap.add_argument("--intervalo", type=int, default=300,
                    help="segundos entre as verificações no --loop")
    args = ap.parse_args()

    if not os.environ.get("DATABASE_URL"):
        log("aviso: DATABASE_URL ausente — import e arquivamento vão falhar")

    estado = ler_estado()
    log(f"vigia_host de pé (estado: {ESTADO})")
    for nome, cfg in TAREFAS.items():
        ultimo = estado.get(nome)
        quando = (datetime.fromtimestamp(ultimo, timezone.utc).strftime("%d/%m %H:%M")
                  if ultimo else "nunca")
        log(f"  {nome}: a cada {cfg['intervalo'] // 60} min, último {quando}")

    if args.uma_vez:
        uma_rodada(estado, args.simular, args.forcar)
        return 0

    while True:
        try:
            uma_rodada(estado, args.simular, args.forcar)
        except Exception as e:
            # Um erro inesperado não pode matar o vigia: ele é religado só
            # no próximo restart do container, e até lá nada rodaria.
            log(f"erro na rodada: {type(e).__name__}: {e}")
        time.sleep(args.intervalo)


if __name__ == "__main__":
    sys.exit(main())
