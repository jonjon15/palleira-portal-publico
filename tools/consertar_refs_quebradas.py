#!/usr/bin/env python3
"""
Conserta as referências quebradas achadas por `sondar_refs_quebradas.py`:
cria um `ItemContainerSaveData` **vazio** para cada `target_container_id` que
aponta para o nada.

Por que criar em vez de apagar o objeto: o baú/esteira continua no mundo,
ninguém perde construção, e a referência passa a apontar para um container
válido e vazio em vez de para o nada. Apagar o objeto seria mexer no que o
jogador construiu; isto não mexe.

Achado no crash-loop do pve-free (16/09/2026): 5 objetos (2 PalBooth, 3
DismantlingConveyor) entre 37.202 apontavam para containers inexistentes. O
jogo carrega a região quando alguém chega perto, segue a referência e morre
com `EXCEPTION_ACCESS_VIOLATION reading address 0x88` — ler campo de ponteiro
nulo. Ver o comentário do Save Pal citado em `sondar_base_refs.py`:
"a captured structure that references a container must ship with that
container, or the game crashes dereferencing it".

🔴 O container novo é clonado de um container REAL do próprio save e depois
esvaziado. Nada de estrutura inventada à mão: o formato do GVAS muda entre
versões do jogo, e um molde tirado do próprio arquivo sempre está certo.

    --simular   mostra o que faria e prova que reserializa. Não escreve.
    --aplicar   grava de verdade. Exige o servidor PARADO.

Uso:
    python tools/consertar_refs_quebradas.py --servidor pve-free --simular
"""

from __future__ import annotations

import argparse
import copy
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from restaurar_base import (  # noqa: E402
    ZERO_UID, baixar, coletar_guids, dig, enviar, entries_of, info_arquivo,
    lista_mutavel, norm_uid, renomear, scalar, secao_por_id, servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

SECOES = (
    ".worldSaveData.MapObjectSaveData",
    ".worldSaveData.ItemContainerSaveData",
    ".worldSaveData.ItemContainerSaveData.Value.RawData",
    ".worldSaveData.ItemContainerSaveData.Value.Slots.Slots.RawData",
    ".worldSaveData.CharacterContainerSaveData",
)


def com_tracos(guid32: str) -> str:
    """32 hex -> formato 8-4-4-4-12 que o GVAS guarda em Guid."""
    g = guid32.lower()
    return f"{g[0:8]}-{g[8:12]}-{g[12:16]}-{g[16:20]}-{g[20:32]}"


def escrever_guid(node, guid32: str) -> None:
    """Troca o valor de um nó Guid, seja ele string crua ou {'value': ...}."""
    alvo = com_tracos(guid32)
    if isinstance(node, dict):
        if "value" in node and not isinstance(node["value"], dict):
            node["value"] = alvo
            return
        if isinstance(node.get("value"), dict):
            escrever_guid(node["value"], guid32)


def esvaziar_slots(entrada: dict) -> int:
    """Zera todos os slots do container clonado. Devolve quantos foram limpos.

    Um slot ocupado carrega `ItemId`/`StackCount`; zerar o `StackCount` e o
    nome do item é o que o jogo entende como vazio.
    """
    limpos = 0
    slots = dig(entrada, "value", "Slots", "value", "values", default=None)
    if not isinstance(slots, list):
        slots = dig(entrada, "value", "Slots", "value", default=None)
    if not isinstance(slots, list):
        return 0

    for slot in slots:
        raw = dig(slot, "RawData", "value", default=None)
        if not isinstance(raw, dict):
            continue
        item = raw.get("item")
        if isinstance(item, dict):
            if "static_id" in item:
                item["static_id"] = "None"
            if "count" in item:
                item["count"] = 0
            limpos += 1
        if "permission" in raw and isinstance(raw["permission"], dict):
            pass  # permissão fica como está — é do slot, não do conteúdo
    return limpos


def _abortar(motivo: str) -> int:
    print(f"\n  ❌ ABORTADO: {motivo}")
    print("     Nada foi sobrescrito. O mundo continua como estava.")
    return 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Cria containers vazios para refs quebradas")
    ap.add_argument("--servidor", required=True)
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true", help="não escreve nada")
    modo.add_argument("--aplicar", action="store_true", help="grava. Servidor PARADO.")
    args = ap.parse_args()

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    caminho = SAVE_PATH.format(guid=cfg.guid)
    print(f"=== {cfg.slug} ===", flush=True)

    if args.aplicar:
        pid = PANEL_IDS.get(cfg.slug)
        if not pid:
            sys.exit(f"sem panelId para {cfg.slug}")
        try:
            atual = estado_do_painel(pid)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
        if atual != "offline":
            print(f"  ❌ O servidor está '{atual}', não 'offline'.")
            print("     Gravar com o jogo rodando corrompe o mundo de todos.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    t0 = time.time()
    original = baixar(cfg, caminho)
    print(f"  baixado:       {len(original):,} bytes em {time.time()-t0:.0f}s", flush=True)

    t0 = time.time()
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    print(f"  descomprimido: {len(gvas_bytes):,} bytes em {time.time()-t0:.0f}s", flush=True)

    t0 = time.time()
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    world = gvas.properties["worldSaveData"]["value"]
    print(f"  parse:         {time.time()-t0:.0f}s\n", flush=True)

    itens = secao_por_id(world, "ItemContainerSaveData")
    chars = secao_por_id(world, "CharacterContainerSaveData")
    objetos = entries_of(dig(world, "MapObjectSaveData", default=None)) or []
    print(f"  {len(itens):,} item containers, {len(chars):,} char containers, "
          f"{len(objetos):,} objetos de mapa")

    # --- achar as referências quebradas ------------------------------------
    quebradas: list[tuple[str, str]] = []  # (nome do objeto, guid)
    for obj in objetos:
        nome = scalar(dig(obj, "MapObjectId"), "") or "?"
        for guid in coletar_guids(obj, "target_container_id"):
            if guid not in itens and guid not in chars:
                quebradas.append((nome, guid))

    if not quebradas:
        print("\n  ✅ Nenhuma referência quebrada. Nada a fazer.")
        return 0

    print(f"\n  ⚠️  {len(quebradas)} referência(s) quebrada(s):")
    for nome, guid in quebradas:
        print(f"     {nome:<30} -> {guid}")

    # --- molde: um container real do próprio save --------------------------
    #
    # Preferir um container com slots, para o clone ter a estrutura completa
    # de Slots que o jogo espera ao abrir o baú.
    molde = None
    for entrada in itens.values():
        slots = dig(entrada, "value", "Slots", "value", "values", default=None)
        if isinstance(slots, list) and slots:
            molde = entrada
            break
    if molde is None:
        return _abortar("não achei um container com slots para usar de molde.")

    n_slots = len(dig(molde, "value", "Slots", "value", "values", default=[]) or [])
    print(f"\n  molde: container real com {n_slots} slots", flush=True)

    # --- criar os containers vazios ----------------------------------------
    lista_item = lista_mutavel(world, "ItemContainerSaveData")
    criados = 0
    for nome, guid in quebradas:
        if guid in itens:
            continue  # já criado nesta rodada (dois objetos, mesmo container)
        nova = copy.deepcopy(molde)
        escrever_guid(dig(nova, "key", "ID", default=nova.get("key")), guid)
        # conferir que o GUID entrou mesmo
        gravado = norm_uid(scalar(dig(nova, "key", "ID"), ""))
        if gravado != guid:
            return _abortar(
                f"não consegui gravar o GUID no clone ({gravado!r} != {guid!r}); "
                "formato inesperado, abortando para não inventar estrutura."
            )
        limpos = esvaziar_slots(nova)
        lista_item.append(nova)
        itens[guid] = nova
        criados += 1
        print(f"     criado container vazio {guid}  ({limpos} slots zerados)  [{nome}]")

    print(f"\n  {criados} container(s) criado(s).")

    # --- reserializar -------------------------------------------------------
    t0 = time.time()
    try:
        novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    except Exception as err:  # noqa: BLE001
        return _abortar(f"reserializar quebrou: {err!r}")
    print(f"  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s "
          f"({len(novo)-len(original):+,} vs original)", flush=True)

    if args.simular:
        print("\n  ✅ Simulação OK — o write não quebra. Nada foi gravado.")
        print("     Rode com --aplicar (servidor parado) para valer.")
        return 0

    backup = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, backup, original)
    conf = info_arquivo(cfg, backup)
    if not conf or conf[0] != len(original):
        return _abortar(f"backup incompleto ({conf[0] if conf else 0} de {len(original)}).")
    print(f"\n  ✅ backup conferido: {backup.split('/')[-1]} ({conf[0]:,} bytes)", flush=True)

    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(novo):
        return _abortar(f"upload incompleto ({conf_novo[0] if conf_novo else 0} de {len(novo)}).")

    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes)")
    print("\n  ✅ Feito. Suba o servidor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
