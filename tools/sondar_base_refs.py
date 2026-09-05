#!/usr/bin/env python3
"""
Lista as referências que os objetos de uma base fazem para fora dela — e quais
delas estão órfãs no save de hoje.

Por que: a restauração de 05/09/2026 devolveu as três bases (918/980/303
objetos), o contador de inatividade ficou renovado (medido: as duas guildas
constam com 0.08d de parada, ou seja **ativas**) e ainda assim as bases
sumiram na subida do servidor. Então não é o `bAutoResetGuildNoOnlinePlayers`
— é integridade referencial. O Save Pal diz isso em `blueprint/capture.rs`:

    "a captured structure that references a container must ship with that
     container, or the game crashes dereferencing it"

Cada baú, fábrica ou caixa de Pal da base aponta para um `ItemContainer` ou
`CharacterContainer` que mora em outra seção do save. Nós copiamos os objetos
mas não os containers deles, então cada baú restaurado aponta para o nada.

Este script mede o tamanho do buraco antes de escrever a correção: quantos
containers cada base referencia, quantos existem no backup, quantos ainda
existem hoje.

Não grava nada.

Uso:
    python tools/sondar_base_refs.py --servidor pve-free \
        --bases e71a3d75-...,75eb802a-...,3f05b9ee-...
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import baixar, dig, norm_uid, scalar, servidores  # noqa: E402
from sondar_containers import esboco  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
BACKUP_PATH = "Pal/Saved/SaveGames/0/{guid}/{arquivo}"

PREFIXOS = (
    ".worldSaveData.MapObjectSaveData",
    ".worldSaveData.BaseCampSaveData",
    ".worldSaveData.ItemContainerSaveData",
    ".worldSaveData.CharacterContainerSaveData",
    ".worldSaveData.DynamicItemSaveData",
)

ZERO = "0" * 32


def entries_of(prop):
    """Desembrulha ArrayProperty/MapProperty até a lista de entradas."""
    node = prop
    for _ in range(4):
        if isinstance(node, list):
            return node
        if isinstance(node, dict):
            if isinstance(node.get("values"), list):
                return node["values"]
            if "value" in node:
                node = node["value"]
                continue
        break
    return None


def guids_de_container(node, prof: int = 14) -> dict[str, set[str]]:
    """Todo GUID guardado sob uma chave com 'container' no nome, por chave.

    Percorre a estrutura em vez de assumir um caminho: os módulos de um objeto
    (`ItemContainer`, `CharacterContainer`) ficam em níveis que variam com o
    tipo do objeto, e adivinhar caminho já custou duas rodadas nesta
    investigação.
    """
    achados: dict[str, set[str]] = {}

    def anda(no, chave_pai: str, p: int):
        if p <= 0:
            return
        if isinstance(no, dict):
            for k, v in no.items():
                nome = k if isinstance(k, str) else chave_pai
                if isinstance(nome, str) and "container" in nome.lower():
                    valor = scalar(v, None)
                    if valor is not None and not isinstance(valor, (int, float, bool)):
                        g = norm_uid(valor)
                        if len(g) == 32 and g != ZERO:
                            achados.setdefault(nome, set()).add(g)
                anda(v, nome, p - 1)
        elif isinstance(no, list):
            for item in no[:2000]:
                anda(item, chave_pai, p - 1)

    anda(node, "", prof)
    return achados


def containers_existentes(world, secao: str) -> set[str]:
    out = set()
    for entrada in entries_of(dig(world, secao)) or []:
        cid = norm_uid(scalar(dig(entrada, "key", "ID"), ""))
        if cid:
            out.add(cid)
    return out


def objetos_da_base(world, base_ids: set[str]) -> dict[str, list]:
    por_base = {b: [] for b in base_ids}
    for entrada in entries_of(dig(world, "MapObjectSaveData")) or []:
        dono = dig(entrada, "Model", "value", "RawData", "value", "base_camp_id_belong_to", default=None)
        if not dono:
            continue
        chave = norm_uid(dono)
        if chave in por_base:
            por_base[chave].append(entrada)
    return por_base


def analisar(rotulo: str, world, base_ids: set[str], mostrar_forma: bool) -> dict[str, set[str]]:
    print(f"\n--- {rotulo} ---", flush=True)
    itens = containers_existentes(world, "ItemContainerSaveData")
    chars = containers_existentes(world, "CharacterContainerSaveData")
    print(f"  ItemContainerSaveData: {len(itens)} | CharacterContainerSaveData: {len(chars)}")

    por_base = objetos_da_base(world, base_ids)
    referidos_total: dict[str, set[str]] = {}

    for base, objetos in por_base.items():
        print(f"\n  base {base}: {len(objetos)} objetos")
        if not objetos:
            continue
        if mostrar_forma:
            mostrar_forma = False  # uma base basta
            tipos = {}
            for o in objetos:
                t = str(scalar(o.get("MapObjectId"), "?"))
                tipos[t] = tipos.get(t, 0) + 1
            print("    tipos de objeto mais comuns:")
            for t, n in sorted(tipos.items(), key=lambda kv: -kv[1])[:12]:
                print(f"      {t}: {n}")

            # Um baú é o caso mais claro de objeto que aponta para um
            # ItemContainer — se a referência não aparece nele, não aparece
            # em lugar nenhum.
            bau = next((o for o in objetos
                        if "chest" in str(scalar(o.get("MapObjectId"), "")).lower()), objetos[0])
            modulos = dig(bau, "ConcreteModel", "value", "ModuleMap", "value", default=[])
            print(f"    ModuleMap de {scalar(bau.get('MapObjectId'), '?')} ({len(modulos)} módulos):")
            print("      " + esboco(modulos, prof=9))

            with_ref = next((o for o in objetos if guids_de_container(o)), None)
            if with_ref is not None:
                print("    chaves com 'container' no primeiro objeto que tem alguma:")
                for chave, guids in sorted(guids_de_container(with_ref).items()):
                    print(f"      {chave}: {sorted(guids)}")
            else:
                print("    ⚠ nenhum objeto desta base tem chave com 'container' legível")

        por_chave: dict[str, set[str]] = {}
        for obj in objetos:
            for chave, guids in guids_de_container(obj).items():
                por_chave.setdefault(chave, set()).update(guids)

        for chave, guids in sorted(por_chave.items()):
            em_item = len(guids & itens)
            em_char = len(guids & chars)
            orfaos = len(guids - itens - chars)
            print(f"    {chave}: {len(guids)} GUIDs — {em_item} em Item, "
                  f"{em_char} em Character, {orfaos} ÓRFÃOS")
            referidos_total.setdefault(chave, set()).update(guids)

    return referidos_total


def main() -> int:
    ap = argparse.ArgumentParser(description="Mede as referências órfãs de uma base restaurada")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--bases", required=True, help="UUIDs de base, separados por vírgula")
    ap.add_argument("--arquivo-backup", default="Level.sav.bak-20260822-154657")
    args = ap.parse_args()

    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k.startswith(PREFIXOS)}
    print("seções decodificadas:")
    for k in sorted(custom):
        print(f"  {k}")

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    base_ids = {norm_uid(b) for b in args.bases.split(",") if b.strip()}

    def ler(caminho):
        raw = baixar(cfg, caminho)
        gvas_bytes, _ = decompress_sav_to_gvas(raw)
        gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
        return gvas.properties["worldSaveData"]["value"]

    backup = ler(BACKUP_PATH.format(guid=cfg.guid, arquivo=args.arquivo_backup))
    referidos = analisar(f"{args.arquivo_backup} (backup com as bases)", backup, base_ids, True)

    hoje = ler(SAVE_PATH.format(guid=cfg.guid))
    itens_hoje = containers_existentes(hoje, "ItemContainerSaveData")
    chars_hoje = containers_existentes(hoje, "CharacterContainerSaveData")
    print(f"\n--- Level.sav (hoje) ---")
    print(f"  ItemContainerSaveData: {len(itens_hoje)} | CharacterContainerSaveData: {len(chars_hoje)}")
    print("\n  Dos containers que as bases do backup referenciam, quantos ainda existem hoje:")
    for chave, guids in sorted(referidos.items()):
        presentes = len(guids & (itens_hoje | chars_hoje))
        print(f"    {chave}: {presentes} de {len(guids)} presentes "
              f"→ {len(guids) - presentes} precisam viajar junto")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
