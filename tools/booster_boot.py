#!/usr/bin/env python3
"""
Aplica o booster da comunidade no boot do servidor. Ver `lib/booster.ts`.

Roda de dentro do container, no startup command, **depois** do
`./PalworldServerConfigParser` e **antes** do `proton run PalServer…`:

    ./PalworldServerConfigParser; (cd /home/container/vigia && . ./env.sh && \
      timeout 20 python3 booster_boot.py --servidor pvp-free >> booster.log 2>&1); …

O Palworld só lê as taxas quando liga, então é aqui — e só aqui — que dá
para mudá-las sem derrubar ninguém: o booster entra no RR normal do painel.

O que faz:
  1. Lê do .ini as taxas que o painel escreveu (a base, sem booster).
  2. Pergunta ao site o que vale neste ciclo (POST /api/booster/boot).
  3. Grava por cima só as chaves que o site devolveu.

⚠️ **Base que não se multiplica duas vezes.** O Palworld reescreve o .ini ao
desligar. Se o ConfigParser não regravar a taxa no boot seguinte, o .ini
chegaria aqui com o valor JÁ turbinado, e o booster de hoje viraria 4x.
Por isso o `booster_estado.json` guarda a base e o que foi escrito: se o
.ini ainda tem exatamente o que escrevemos, a base é a guardada; se mudou
(o painel regravou, ou o dono mexeu na taxa), a base passa a ser a nova.

Qualquer falha (site fora, timeout, .ini estranho) deixa o .ini como está e
o servidor sobe com a taxa normal: booster nunca pode impedir o boot. Por
isso o `timeout 20` no startup command e o `exit 0` em todo caminho.

Teste fora do container, sem gravar:
    python3 tools/booster_boot.py --servidor pvp-free --ini ./PalWorldSettings.ini --simular
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

INI_PADRAO = "/home/container/Pal/Saved/Config/WindowsServer/PalWorldSettings.ini"
SITE = "https://palleira.com.br/api/booster/boot"
CHAVES = ["ExpRate", "PalCaptureRate", "EnemyDropItemRate", "CollectionDropRate"]
ESTADO = Path(__file__).with_name("booster_estado.json")


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def ler_taxas(texto: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for chave in CHAVES:
        m = re.search(rf"[(,]{chave}=([0-9.]+)", texto)
        if m:
            try:
                out[chave] = float(m.group(1))
            except ValueError:
                pass
    return out


def gravar_taxas(texto: str, valores: dict[str, float]) -> str:
    for chave, valor in valores.items():
        texto = re.sub(
            rf"([(,]{chave}=)[0-9.]+",
            lambda m: f"{m.group(1)}{valor:.6f}",
            texto,
            count=1,
        )
    return texto


def mesmo(a: dict[str, float], b: dict[str, float]) -> bool:
    return bool(a) and all(abs(a.get(k, -1) - v) < 1e-4 for k, v in b.items()) and a.keys() >= b.keys()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--servidor", required=True)
    p.add_argument("--ini", default=INI_PADRAO)
    p.add_argument("--simular", action="store_true")
    a = p.parse_args()

    try:
        ini = Path(a.ini)
        texto = ini.read_text(encoding="utf-8-sig")
    except OSError as e:
        log(f"não li o .ini ({e}) — sobe sem booster")
        return 0

    lido = ler_taxas(texto)
    if not lido:
        log("nenhuma taxa no .ini — sobe sem booster")
        return 0

    estado: dict = {}
    try:
        estado = json.loads(ESTADO.read_text())
    except (OSError, ValueError):
        pass

    # O .ini ainda tem o que escrevemos no boot passado? Então ele não foi
    # regravado pelo painel, e a base de verdade é a guardada.
    escrito = estado.get("escrito") or {}
    base = estado.get("base") if escrito and mesmo(lido, escrito) else lido
    base = {k: float(v) for k, v in (base or lido).items() if k in CHAVES}

    segredo = os.environ.get("CRON_SECRET", "")
    valores: dict[str, float] = {}
    try:
        req = urllib.request.Request(
            SITE,
            data=json.dumps({"servidor": a.servidor, "base": base}).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {segredo}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as r:
            resposta = json.loads(r.read())
        valores = {k: float(v) for k, v in (resposta.get("valores") or {}).items() if k in CHAVES}
    except Exception as e:  # noqa: BLE001 — qualquer falha = taxa normal
        log(f"site não respondeu ({e}) — volta para a base")

    # Sempre grava a base primeiro: se o boot passado deixou booster no .ini,
    # é aqui que ele sai. Por cima, o que o site mandou.
    alvo = {**base, **valores}
    novo = gravar_taxas(texto, alvo)
    log(
        f"{a.servidor}: base {base} · booster {valores or 'nenhum'}"
        + (" (simulado)" if a.simular else "")
    )
    if a.simular:
        return 0

    try:
        if novo != texto:
            ini.write_text(novo, encoding="utf-8")
        tmp = ESTADO.with_suffix(".tmp")
        tmp.write_text(json.dumps({"base": base, "escrito": ler_taxas(novo)}, indent=2))
        tmp.replace(ESTADO)
    except OSError as e:
        log(f"não gravei ({e}) — sobe como estiver")
    return 0


if __name__ == "__main__":
    sys.exit(main())
