#!/usr/bin/env python3
"""
Mede a POSIÇÃO das bases e das peças construídas, para responder uma pergunta
só: dá para devolver a base de alguém em outro lugar do mapa?

A pergunta apareceu em 06/09/2026: o dono quer que o próprio jogador compre a
restauração da base com Paletas, e o caso ruim é o terreno já estar ocupado
por outra base. Aí não adianta devolver no lugar original — teria que mover.

Mover significa somar um delta à posição da base e à de **cada peça
construída**. Antes de prometer isso, é preciso saber:

  1. onde mora a posição da base (`BaseCampSaveData[].value.RawData`);
  2. onde mora a posição de cada peça (`MapObjectSaveData[]`), e se todas têm;
  3. que tamanho a base ocupa (a caixa que envolve todas as peças);
  4. onde ficam TODAS as bases do mundo, para saber o que está livre.

Não grava nada. Lê, mede e imprime.

Uso:
    python tools/sondar_posicoes.py --servidor pve-free --uids 21F2BD36...
    python tools/sondar_posicoes.py --servidor pve-free --todas
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    baixar, base_camp_entries, dig, entries_of, norm_uid, scalar, servidores,
)
from sondar_containers import esboco  # noqa: E402
from sondar_inventario import ler_gvas  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

SECOES = (
    ".worldSaveData.GroupSaveDataMap",
    ".worldSaveData.BaseCampSaveData.Value.RawData",
    ".worldSaveData.MapObjectSaveData",
)

# A mesma conversão de `lib/palworld/coordenadas.ts`, validada em 22/08/2026
# contra o que o jogo mostra. x e y trocam de lugar de propósito.
TRANSLADO_X, TRANSLADO_Y, ESCALA = 123_888, 158_000, 459


def para_mapa(x: float, y: float) -> tuple[int, int]:
    return round((y - TRANSLADO_Y) / ESCALA), round((x - TRANSLADO_X) / ESCALA)


def achar_posicao(no, prof: int = 10) -> tuple[float, float, float] | None:
    """A primeira translação (x, y, z) abaixo deste nó.

    Varre em vez de assumir caminho: a posição da base e a das peças não moram
    no mesmo lugar da árvore, e adivinhar caminho já custou rodadas nesta
    investigação.
    """
    if prof <= 0:
        return None
    if isinstance(no, dict):
        alvo = no.get("translation") if isinstance(no.get("translation"), dict) else None
        if alvo is None and {"x", "y", "z"} <= set(no):
            alvo = no
        if isinstance(alvo, dict) and {"x", "y", "z"} <= set(alvo):
            try:
                return (float(scalar(alvo["x"], 0) or 0),
                        float(scalar(alvo["y"], 0) or 0),
                        float(scalar(alvo["z"], 0) or 0))
            except (TypeError, ValueError):
                pass
        for v in no.values():
            achado = achar_posicao(v, prof - 1)
            if achado:
                return achado
    elif isinstance(no, list):
        for item in no[:40]:
            achado = achar_posicao(item, prof - 1)
            if achado:
                return achado
    return None


def base_do_objeto(entrada) -> str:
    """`base_camp_id_belong_to` — a base a que a peça pertence."""
    from restaurar_base import coletar_guids  # noqa: PLC0415
    achados = coletar_guids(entrada, "base_camp_id_belong_to")
    return next(iter(achados), "")


def main() -> int:
    ap = argparse.ArgumentParser(description="Mede a posição das bases e das peças")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", default="", help="dono das bases a detalhar")
    ap.add_argument("--todas", action="store_true",
                    help="lista todas as bases do mundo com coordenada de mapa")
    ap.add_argument("--dump", action="store_true",
                    help="esboço cru da primeira base e da primeira peça")
    args = ap.parse_args()

    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    world = ler_gvas(baixar(cfg, SAVE_PATH.format(guid=cfg.guid)), custom
                     ).properties["worldSaveData"]["value"]

    camps = base_camp_entries(world)
    objetos = entries_of(dig(world, "MapObjectSaveData", default=None)) or []
    print(f"=== {cfg.slug}: {len(camps)} base(s), {len(objetos):,} peça(s) construída(s) ===")

    if args.dump and camps:
        print("\n--- esboço da primeira base ---")
        print(esboco(camps[0], prof=6))
        print("\n--- esboço da primeira peça ---")
        print(esboco(objetos[0], prof=6) if objetos else "(nenhuma)")

    # ---- 1. posição de cada base ------------------------------------------
    pos_base: dict[str, tuple[float, float, float]] = {}
    for entrada in camps:
        bid = norm_uid(dig(entrada, "key", default=""))
        p = achar_posicao(dig(entrada, "value", "RawData", "value", default=entrada))
        if bid and p:
            pos_base[bid] = p

    print(f"\n{len(pos_base)} de {len(camps)} base(s) têm posição legível")

    # ---- 2. posição das peças, agrupada por base --------------------------
    caixa: dict[str, list] = {}
    sem_posicao = 0
    for obj in objetos:
        bid = base_do_objeto(obj)
        p = achar_posicao(obj)
        if not p:
            sem_posicao += 1
            continue
        if bid:
            caixa.setdefault(bid, []).append(p)

    print(f"{sem_posicao:,} peça(s) sem posição legível "
          f"({len(caixa)} base(s) com peça localizada)")

    if args.todas:
        print("\n--- todas as bases ---")
        for bid, (x, y, z) in sorted(pos_base.items(), key=lambda kv: -len(caixa.get(kv[0], []))):
            mx, my = para_mapa(x, y)
            pecas = caixa.get(bid, [])
            raio = 0.0
            if pecas:
                raio = max(max(abs(px - x), abs(py - y)) for px, py, _ in pecas)
            print(f"  {bid[:8]}…  mapa {mx:>6},{my:>6}  z={z:>9,.0f}  "
                  f"{len(pecas):>5} peça(s)  raio≈{raio:,.0f}")

    for uid in [u for u in args.uids.split(",") if u.strip()]:
        uid = norm_uid(uid)
        print(f"\n--- bases com peça de {uid[:8]}… ---")
        # A ligação uid -> base é pela guild; aqui basta mostrar o que existe,
        # o dono do save já sabe qual é a dele.
        for bid, pecas in sorted(caixa.items(), key=lambda kv: -len(kv[1]))[:10]:
            if bid not in pos_base:
                continue
            x, y, z = pos_base[bid]
            mx, my = para_mapa(x, y)
            xs = [p[0] for p in pecas]
            ys = [p[1] for p in pecas]
            zs = [p[2] for p in pecas]
            print(f"  {bid[:8]}…  mapa {mx},{my}  {len(pecas)} peças  "
                  f"caixa x[{min(xs):,.0f}..{max(xs):,.0f}] "
                  f"y[{min(ys):,.0f}..{max(ys):,.0f}] "
                  f"z[{min(zs):,.0f}..{max(zs):,.0f}]")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
