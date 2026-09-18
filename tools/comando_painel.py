#!/usr/bin/env python3
"""
Manda um comando para o console do servidor, pela API do painel da ENX.

Existe porque o **RCON do PalDefender só executa vindo de dentro do
container** (ver a memória `gotcha-rcon-paldefender-so-de-dentro`): de fora a
conexão autentica, todo comando responde vazio e nada acontece. O console do
painel funciona porque escreve no stdin do processo, que é onde o `palcon`
da ENX fala com `127.0.0.1`.

É o caminho para rodar `reloadcfg`, `ban`, `kick` e afins a partir daqui,
sem depender de estar dentro do container.

⚠️ O comando entra na fila do console: a API devolve 204 sem corpo, então
**não há resposta para ler**. Para saber se funcionou, olhe o efeito — uma
linha nova em `PalDefender/Logs/`, ou o arquivo que deveria mudar.

Uso:
    python tools/comando_painel.py --servidor pvp-free --comando reloadcfg
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

PAINEL = "https://painel.enxadahost.com"

# O painel está atrás do Cloudflare com bloqueio por assinatura: com
# `Python-urllib` dá 403, com UA de navegador dá 200. Mesmo motivo de
# `tools/energia_painel.py` — ver o aviso no topo daquele arquivo.
NAVEGADOR = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

PANEL_IDS = {
    "pve-free": "0c079595",
    "pve-vip": "6eb8d521",
    "pvp-free": "59ec87fa",
}


def enviar(pid: str, comando: str) -> None:
    chave = os.environ.get("ENX_API_KEY", "")
    if not chave:
        sys.exit("ENX_API_KEY ausente")

    req = urllib.request.Request(
        f"{PAINEL}/api/client/servers/{pid}/command",
        data=json.dumps({"command": comando}).encode(),
        headers={
            "Authorization": f"Bearer {chave}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": NAVEGADOR,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"  aceito (HTTP {r.status})")
    except urllib.error.HTTPError as e:
        if e.code == 204:  # Pterodactyl responde 204 no sucesso
            print("  aceito (HTTP 204)")
            return
        # 502 aqui costuma ser servidor desligado: o painel não tem com quem falar.
        sys.exit(f"painel recusou: HTTP {e.code} {e.read()[:200]!r}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--servidor", required=True, choices=sorted(PANEL_IDS))
    p.add_argument("--comando", required=True)
    args = p.parse_args()

    print(f"{args.servidor}: {args.comando}")
    enviar(PANEL_IDS[args.servidor], args.comando)
    return 0


if __name__ == "__main__":
    sys.exit(main())
