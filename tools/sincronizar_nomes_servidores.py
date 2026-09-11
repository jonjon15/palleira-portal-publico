#!/usr/bin/env python3
"""
Sincroniza `name` em lib/servers.ts com o nome atual de cada servidor no
painel da ENX (§3.4/§3.8 do PROMPT.md).

Existe porque o painel pode renomear ou migrar um servidor de node (ex.:
"[BR] Palleira PVP FREE NEW" virou "[BR] Palleira PVE|PVP DOMINATIONS" em
10/09/2026, quando o `pvp-free` migrou de `enx-soc-20` para `enx-cirion-16")
sem nenhum aviso — o site só descobre se alguém notar a diferença. Este
script fecha esse gap: lê o nome de verdade via
`GET /api/client/servers/<panelId>` (mesma API de tools/energia_painel.py) e
reescreve o campo `name` em lib/servers.ts quando ele estiver desatualizado.

`shortName` não é tocado — é uma abreviação escolhida à mão para caber na UI
(ticker, cards), não dá para derivar automaticamente do nome completo do
painel sem arriscar algo estranho tipo "PVE|PVP DOMINATIONS" inteiro num chip.

Uso:
    python tools/sincronizar_nomes_servidores.py --aplicar
    python tools/sincronizar_nomes_servidores.py   # só mostra o diff
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

PAINEL = "https://painel.enxadahost.com"

# Ver o aviso em tools/energia_painel.py: sem UA de navegador, 403 (Cloudflare).
NAVEGADOR = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

# Mesmos IDs de lib/servers.ts e tools/energia_painel.py.
PANEL_IDS = {
    "pve-free": "0c079595",
    "pve-vip": "6eb8d521",
    "pvp-free": "59ec87fa",
}

SERVERS_TS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "lib", "servers.ts"
)


def _req(url: str) -> urllib.request.Request:
    chave = os.environ.get("ENX_API_KEY", "")
    if not chave:
        sys.exit("ENX_API_KEY ausente")
    return urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {chave}",
            "Accept": "application/json",
            "User-Agent": NAVEGADOR,
        },
    )


def nome_no_painel(pid: str) -> str:
    with urllib.request.urlopen(_req(f"{PAINEL}/api/client/servers/{pid}"), timeout=30) as r:
        corpo = json.load(r)
    return corpo["attributes"]["name"]


def atualizar_name(texto: str, slug: str, nome_novo: str) -> tuple[str, str | None]:
    """Troca o `name:` do bloco do slug indicado. Devolve (texto, nome_antigo)."""
    padrao = re.compile(
        r'(slug:\s*"' + re.escape(slug) + r'",\s*\n\s*name:\s*")([^"]*)(")'
    )
    m = padrao.search(texto)
    if not m:
        sys.exit(f"não achei o bloco de '{slug}' em {SERVERS_TS}")
    nome_atual = m.group(2)
    if nome_atual == nome_novo:
        return texto, None
    novo_texto = texto[: m.start(2)] + nome_novo + texto[m.end(2) :]
    return novo_texto, nome_atual


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true", help="grava lib/servers.ts")
    args = ap.parse_args()

    with open(SERVERS_TS, encoding="utf-8") as f:
        texto = f.read()

    mudou = False
    for slug, pid in PANEL_IDS.items():
        try:
            atual_no_painel = nome_no_painel(pid)
        except urllib.error.HTTPError as e:
            print(f"  ⚠️ {slug} ({pid}): HTTP {e.code} ao consultar o painel — pulando")
            continue

        texto, nome_antigo = atualizar_name(texto, slug, atual_no_painel)
        if nome_antigo is not None:
            mudou = True
            print(f"  {slug}: \"{nome_antigo}\" → \"{atual_no_painel}\"")
        else:
            print(f"  {slug}: sem mudança (\"{atual_no_painel}\")")

    if not mudou:
        print("nenhum nome mudou, nada para gravar")
        return 0

    if not args.aplicar:
        print("\n(rode com --aplicar para gravar em lib/servers.ts)")
        return 0

    with open(SERVERS_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)
    print(f"\ngravado em {SERVERS_TS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
