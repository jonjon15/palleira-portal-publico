#!/usr/bin/env python3
"""
Troca o modo do `wilderness` no PalLaw — o que vale fora das regiões mapeadas.

O PalLaw (`ue4ss/Mods/PalLaw/PalLaw.json`) é quem decide PvP **por região**,
por cima da chave global `bEnablePlayerToPlayerDamage` do jogo. As duas
precisam concordar: a do jogo é o pré-requisito, e o PalLaw filtra depois.

O `wilderness` é o fallback — vale em todo pedaço do mapa que não está dentro
de nenhum polígono nomeado. Com ele em `pve`, lugares como Sakurajima ficam
protegidos mesmo com o PvP global ligado. Foi o que aconteceu em 18/09/2026:
liguei a chave do jogo e o dano continuou bloqueado, porque o PalLaw barrava
(`region=Wilderness status=BLOCKED` no `PalLaw.log`).

⚠️ **Mudar isto abre PvP em quase todo o mapa de uma vez.** As regiões
nomeadas continuam valendo — quem está em `pve` segue protegido —, mas todo o
resto passa a permitir dano entre jogadores.

Uso:
    python tools/pallaw_wilderness.py --modo pvp --simular
    python tools/pallaw_wilderness.py --modo pvp --aplicar
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

import paramiko

HOST, USER = "enx-cirion-16.enx.host", "qv6mfi1u.59ec87fa"
PALLAW = "Pal/Binaries/Win64/ue4ss/Mods/PalLaw/PalLaw.json"


def senha_sftp() -> str:
    """Nunca hardcoded: este repositório é público."""
    s = os.environ.get("PALLEIRA_SFTP_PASSWORD", "")
    if not s:
        raise SystemExit(
            "PALLEIRA_SFTP_PASSWORD ausente.\n"
            "  PowerShell: $env:PALLEIRA_SFTP_PASSWORD='...'"
        )
    return s


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--modo", required=True, help="id de um modo do PalLaw (pvp, pve, safe)")
    grupo = p.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--simular", action="store_true")
    grupo.add_argument("--aplicar", action="store_true")
    args = p.parse_args()

    t = paramiko.Transport((HOST, 2022))
    t.connect(username=USER, password=senha_sftp())
    sf = paramiko.SFTPClient.from_transport(t)
    try:
        bruto = sf.open(PALLAW).read().decode("utf-8", "replace")
        cfg = json.loads(bruto)

        modos = [m.get("id") for m in cfg.get("modes", [])]
        if args.modo not in modos:
            sys.exit(f"modo {args.modo!r} não existe. Disponíveis: {modos}")

        atual = cfg["wilderness"].get("mode")
        print(f"wilderness.mode: {atual} -> {args.modo}")
        print(f"\nregiões nomeadas (não mudam):")
        for r in cfg.get("regions", []):
            print(f"  {(r.get('name') or r.get('id'))!r}: {r.get('mode')}")

        if args.simular:
            print("\n[simulação] nada foi escrito.")
            return 0

        if atual == args.modo:
            print("\njá está nesse modo; nada a fazer.")
            return 0

        # Backup: são 44 KB de polígonos desenhados à mão, não dá para refazer.
        carimbo = datetime.now().strftime("%Y%m%d%H%M%S")
        bak = f"{PALLAW}.bak-{carimbo}"
        with sf.open(bak, "w") as f:
            f.write(bruto)
        print(f"\nbackup: {bak}")

        cfg["wilderness"]["mode"] = args.modo
        with sf.open(PALLAW, "w") as f:
            f.write(json.dumps(cfg, indent=2, ensure_ascii=False))

        # Confere lendo de volta, e garante que nada mais se perdeu.
        conferido = json.loads(sf.open(PALLAW).read().decode("utf-8", "replace"))
        ok = conferido["wilderness"]["mode"] == args.modo
        print(f"  conferido wilderness.mode={conferido['wilderness']['mode']} {'OK' if ok else 'FALHOU'}")
        print(f"  regiões preservadas: {len(conferido.get('regions', []))}"
              f" (antes: {len(cfg.get('regions', []))})")
        print(f"  modos preservados: {len(conferido.get('modes', []))}")
    finally:
        sf.close()
        t.close()

    print("\n⚠️ O PalLaw lê este arquivo no boot. Sem restart, nada muda no jogo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
