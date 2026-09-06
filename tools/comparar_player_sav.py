#!/usr/bin/env python3
"""
Compara os containers que cada versão do `Players/<uid>.sav` aponta.

Existe porque o Tenshi ficou sem a bag depois da restauração, e o dono do
servidor apontou o que faltava na análise: **a bag não some por decay** — só a
base some. Se os itens não caem, eles têm de estar no mundo, e o que quebrou é
a ligação: o `Players/<uid>.sav` que restauramos pode apontar para containers
diferentes dos que o save de hoje usava.

Este script lê o save individual do jogador em cada backup do painel e na
pasta viva, e imprime os oito GUIDs de container de cada um, lado a lado. Se
mudarem de uma versão para outra, é aí que a bag se desligou.

Não grava nada.

Uso:
    python tools/comparar_player_sav.py --servidor pve-free --uid 21F2BD36...
"""

from __future__ import annotations

import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import _sftp, dig, norm_uid, servidores  # noqa: E402
from sondar_inventario import CAMPOS_DE_CONTAINER, guid_sob, ler_gvas  # noqa: E402

BASE_DIR = "Pal/Saved/SaveGames/0/{guid}"


def versoes(cfg, uid: str) -> list[tuple[str, bytes]]:
    """(rótulo, bytes) de cada versão do save individual, da mais velha para a
    mais nova — os backups do painel e, por último, a que está valendo."""
    base = BASE_DIR.format(guid=cfg.guid)
    t, sftp = _sftp(cfg)
    try:
        try:
            pastas = sorted(sftp.listdir(f"{base}/backup/world"))
        except FileNotFoundError:
            pastas = []
        saidas: list[tuple[str, bytes]] = []
        for pasta in pastas:
            caminho = f"{base}/backup/world/{pasta}/Players/{uid}.sav"
            buf = io.BytesIO()
            try:
                sftp.getfo(caminho, buf)
            except FileNotFoundError:
                continue
            saidas.append((pasta, buf.getvalue()))
        buf = io.BytesIO()
        try:
            sftp.getfo(f"{base}/Players/{uid}.sav", buf)
            saidas.append(("AGORA (valendo)", buf.getvalue()))
        except FileNotFoundError:
            saidas.append(("AGORA (valendo)", b""))
        return saidas
    finally:
        t.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Compara os containers de cada versão do save individual")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uid", required=True)
    args = ap.parse_args()

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    uid = norm_uid(args.uid)
    print(f"=== {cfg.slug} / Players/{uid}.sav ===", flush=True)

    anterior: dict[str, str] | None = None
    for rotulo, dados in versoes(cfg, uid):
        if not dados:
            print(f"\n--- {rotulo}: AUSENTE")
            continue
        try:
            props = ler_gvas(dados, {}).properties
        except Exception as err:  # noqa: BLE001
            print(f"\n--- {rotulo}: não deu para ler ({type(err).__name__})")
            continue
        save_data = dig(props, "SaveData", "value", default=props)
        atual = {c: guid_sob(save_data, c) for c in CAMPOS_DE_CONTAINER}

        mudou = anterior is not None and atual != anterior
        marca = "  ⚠ MUDOU em relação à versão anterior" if mudou else ""
        print(f"\n--- {rotulo} ({len(dados):,} bytes){marca}")
        for campo, gid in atual.items():
            antes = (anterior or {}).get(campo)
            seta = f"   (antes {antes[:8]}…)" if antes and antes != gid else ""
            print(f"    {campo:<28} {gid or '(vazio)'}{seta}")
        anterior = atual

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
