#!/usr/bin/env python3
"""
Liga, para ou reinicia servidor pelo painel da ENX (§3.8 do PROMPT.md).

Só existe porque a REST do Palworld não liga servidor — ela é servida pelo
próprio processo, então morre junto. E o `shutdown` dela também não *para*:
a ENX religa sozinha em segundos. Parada de verdade é só pelo painel.

⚠️ User-Agent de navegador é OBRIGATÓRIO. O painel está atrás do Cloudflare
com bloqueio por assinatura (erro 1010): com `Python-urllib` dá 403, com
UA de navegador dá 200. Medido no próprio runner.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

PAINEL = "https://painel.enxadahost.com"

# Ver o aviso no topo: sem isto, 403.
NAVEGADOR = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

# Não é segredo (a chave é que é). Mesmos IDs de lib/servers.ts.
PANEL_IDS = {
    "pve-free": "0c079595",
    "pve-vip": "6eb8d521",
    "pvp-free": "59ec87fa",
}


def _req(url: str, dados: bytes | None = None) -> urllib.request.Request:
    chave = os.environ.get("ENX_API_KEY", "")
    if not chave:
        sys.exit("ENX_API_KEY ausente")
    return urllib.request.Request(
        url,
        data=dados,
        headers={
            "Authorization": f"Bearer {chave}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": NAVEGADOR,
        },
    )


def estado(pid: str) -> str:
    with urllib.request.urlopen(
        _req(f"{PAINEL}/api/client/servers/{pid}/resources"), timeout=30
    ) as r:
        return json.load(r)["attributes"]["current_state"]


def energia(pid: str, sinal: str) -> None:
    corpo = json.dumps({"signal": sinal}).encode()
    try:
        with urllib.request.urlopen(_req(f"{PAINEL}/api/client/servers/{pid}/power", corpo), timeout=30) as r:
            print(f"  sinal '{sinal}' aceito (HTTP {r.status})")
    except urllib.error.HTTPError as e:
        if e.code == 204:  # o Pterodactyl responde 204 no sucesso
            print(f"  sinal '{sinal}' aceito (HTTP 204)")
            return
        sys.exit(f"painel recusou '{sinal}': HTTP {e.code} {e.read()[:200]!r}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--servidor", required=True, choices=sorted(PANEL_IDS))
    ap.add_argument("--sinal", required=True, choices=["start", "stop", "restart", "kill"])
    ap.add_argument("--esperar", choices=["offline", "running"],
                    help="bloqueia até o painel relatar este estado")
    ap.add_argument("--limite", type=int, default=300, help="segundos de espera")
    args = ap.parse_args()

    pid = PANEL_IDS[args.servidor]
    print(f"{args.servidor} ({pid}): estado atual = {estado(pid)}")
    energia(pid, args.sinal)

    if not args.esperar:
        return 0

    t0 = time.time()
    while time.time() - t0 < args.limite:
        time.sleep(6)
        atual = estado(pid)
        print(f"  {int(time.time()-t0)}s: {atual}", flush=True)
        if atual == args.esperar:
            print(f"  chegou em '{args.esperar}'")
            return 0
        # ⚠️ O egg da ENX nunca sai de "starting" (procura no log uma frase
        # que o servidor não escreve mais). Para 'running', aceitar isso.
        if args.esperar == "running" and atual == "starting" and time.time() - t0 > 90:
            print("  segue em 'starting' — é o egg da ENX, que nunca vira")
            print("  'running'. O jogo em si já deve estar no ar.")
            return 0

    sys.exit(f"não chegou em '{args.esperar}' em {args.limite}s")


if __name__ == "__main__":
    raise SystemExit(main())
