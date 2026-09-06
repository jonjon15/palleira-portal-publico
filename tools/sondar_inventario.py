#!/usr/bin/env python3
"""
Sonda os containers de INVENTÁRIO de um jogador: mochila, equipamento, arma,
comida — os que o `Players/<uid>.sav` nomeia em `InventoryInfo`.

Existe porque em 05/09/2026, depois da restauração, o Tenshi apareceu sem
nenhum item. A restauração cuidou das caixas de Pal (`CharacterContainer`) mas
não dos containers de item do próprio jogador: o `Players/<uid>.sav` voltou do
backup apontando para containers que o servidor já tinha apagado do
`Level.sav`. Ponteiro para container que não existe = mochila vazia.

Compara os três lugares para dizer de onde dá para trazer de volta:
o save individual (quem são os containers), o `Level.sav` vivo (o que existe
hoje) e cada backup (onde ainda há conteúdo).

Não grava nada.

Uso:
    python tools/sondar_inventario.py --servidor pve-free --uids 21F2BD36...
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    ZERO_UID, baixar, candidatos_a_backup, coletar_guids, dig, entries_of,
    norm_uid, scalar, secao_por_id, servidores,
)
from sondar_containers import esboco  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
PLAYER_PATH = "Pal/Saved/SaveGames/0/{guid}/Players/{uid}.sav"

# Os seis containers de inventário que o Save Pal lê em `player_container_ids`
# (transfer.rs), mais os dois de Pal — todos moram no save individual.
CAMPOS_DE_CONTAINER = (
    "CommonContainerId",          # mochila
    "DropSlotContainerId",        # o que cai ao morrer
    "EssentialContainerId",       # itens-chave
    "WeaponLoadOutContainerId",   # armas
    "PlayerEquipArmorContainerId",  # armadura
    "FoodEquipContainerId",       # comida equipada
    "PalStorageContainerId",      # Pal Box
    "OtomoCharacterContainerId",  # party
)

SECOES_MUNDO = (
    ".worldSaveData.ItemContainerSaveData.Value.RawData",
    ".worldSaveData.ItemContainerSaveData.Value.Slots.Slots.RawData",
    ".worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData",
    # Sem esta, `RawData` da guild fica byte cru e `--guildas` não acha membro
    # nenhum — foi o que aconteceu na primeira rodada sobre as duas guildas.
    ".worldSaveData.GroupSaveDataMap",
)


def ler_gvas(raw: bytes, custom):
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_TYPE_HINTS

    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    return GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)


def primeiro_guid(no, prof: int = 8) -> str:
    """O primeiro GUID de verdade abaixo deste nó.

    No save individual o container vem embrulhado em dois structs
    (`campo.value.ID.value`), e um `scalar()` para no dict do meio — foi por
    isso que a primeira sondagem não achou campo nenhum e disse que não
    existiam. Descer até encontrar resolve sem depender da profundidade exata.
    """
    if prof <= 0:
        return ""
    if isinstance(no, dict):
        for v in no.values():
            if not isinstance(v, (dict, list)):
                g = norm_uid(v)
                if len(g) == 32 and g != ZERO_UID and all(c in "0123456789ABCDEF" for c in g):
                    return g
        for v in no.values():
            achado = primeiro_guid(v, prof - 1)
            if achado:
                return achado
    elif isinstance(no, list):
        for item in no:
            achado = primeiro_guid(item, prof - 1)
            if achado:
                return achado
    return ""


def guid_sob(no, campo: str, prof: int = 12) -> str:
    """O GUID guardado sob a chave `campo`, em qualquer profundidade."""
    if prof <= 0:
        return ""
    if isinstance(no, dict):
        if campo in no:
            achado = primeiro_guid(no[campo])
            if achado:
                return achado
        for v in no.values():
            achado = guid_sob(v, campo, prof - 1)
            if achado:
                return achado
    elif isinstance(no, list):
        for item in no:
            achado = guid_sob(item, campo, prof - 1)
            if achado:
                return achado
    return ""


def containers_do_jogador(cfg, uid: str) -> dict[str, str]:
    """campo -> GUID, lido do `Players/<uid>.sav`."""
    raw = baixar(cfg, PLAYER_PATH.format(guid=cfg.guid, uid=uid))
    props = ler_gvas(raw, {}).properties
    save_data = dig(props, "SaveData", "value", default=None)
    achados: dict[str, str] = {}
    for campo in CAMPOS_DE_CONTAINER:
        gid = guid_sob(save_data if save_data is not None else props, campo)
        if gid:
            achados[campo] = gid
    if not achados:
        # Dump cru em vez de adivinhar de novo — foi assim que se achou o
        # `base_camp_id_belong_to` e o `SlotId.ContainerId`.
        print(f"  raiz do save individual: {sorted(props)}")
        if isinstance(save_data, dict):
            print(f"  SaveData tem {len(save_data)} campos: {sorted(save_data)}")
            for chave in sorted(save_data):
                if "ontainer" in chave or "nventor" in chave:
                    print(f"  {chave} = " + esboco(save_data[chave], prof=6))
        else:
            print("  SaveData não é struct: " + esboco(props, prof=4))
    return achados


def slots_com_coisa(entrada) -> tuple[int, int]:
    """(ocupados, total) de um container — serve para item e para personagem."""
    slots = dig(entrada, "value", "Slots", "value", "values", default=None)
    if not isinstance(slots, list):
        slots = dig(entrada, "value", "Slots", "value", default=None)
    if not isinstance(slots, list):
        return 0, 0
    ocupados = 0
    for s in slots:
        raw = dig(s, "RawData", "value", default={})
        if not isinstance(raw, dict):
            continue
        if raw.get("count") and int(scalar(raw.get("count"), 0) or 0) > 0:
            ocupados += 1
            continue
        iid = norm_uid(scalar(raw.get("instance_id"), ""))
        if iid and iid != ZERO_UID:
            ocupados += 1
    return ocupados, len(slots)


def conteudo(entrada) -> list[tuple[str, int]]:
    """(item, quantidade) de cada slot ocupado — o que identifica uma bag.

    Container vazio todo mundo tem igual; é a lista de itens que diz se um
    container órfão é mesmo de quem se procura.
    """
    slots = dig(entrada, "value", "Slots", "value", "values", default=None)
    if not isinstance(slots, list):
        slots = dig(entrada, "value", "Slots", "value", default=None)
    if not isinstance(slots, list):
        return []
    out = []
    for s in slots:
        raw = dig(s, "RawData", "value", default={})
        if not isinstance(raw, dict):
            continue
        qtd = int(scalar(raw.get("count"), 0) or 0)
        if qtd <= 0:
            continue
        out.append((str(scalar(dig(raw, "item", "static_id"), "") or "?"), qtd))
    return out


def olhar(rotulo: str, world, alvos: dict[str, str], detalhar: bool = False) -> int:
    itens = secao_por_id(world, "ItemContainerSaveData")
    chars = secao_por_id(world, "CharacterContainerSaveData")
    print(f"\n--- {rotulo} ---")
    print(f"  ItemContainerSaveData: {len(itens)} | CharacterContainerSaveData: {len(chars)}")
    total_com_coisa = 0
    for campo, gid in alvos.items():
        entrada = itens.get(gid) or chars.get(gid)
        if entrada is None:
            print(f"    {campo} ({gid[:8]}…): ❌ NÃO EXISTE aqui")
            continue
        ocupados, total = slots_com_coisa(entrada)
        total_com_coisa += ocupados
        marca = "✓" if ocupados else "vazio"
        print(f"    {campo} ({gid[:8]}…): {marca} — {ocupados}/{total} slots com coisa")
        if detalhar and ocupados:
            for item, qtd in conteudo(entrada):
                print(f"        {item} x{qtd}")
    print(f"  → total de slots com conteúdo: {total_com_coisa}")
    return total_com_coisa


def membros_das_guildas(world, nomes: list[str]) -> list[tuple[str, str, str]]:
    """(uid, nome do jogador, nome da guild) de cada membro das guildas pedidas.

    Existe porque a verificação de bag não é de um jogador só: toda guild que
    teve base restaurada precisa ser conferida membro a membro. Procurar UID a
    UID à mão é o tipo de passo que a pressa pula.
    """
    procurados = [n.strip().lower() for n in nomes if n.strip()]
    out: list[tuple[str, str, str]] = []
    for entrada in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        raw = dig(entrada, "value", "RawData", "value", default={}) or {}
        if raw.get("group_type") != "EPalGroupType::Guild":
            continue
        nome_guild = (raw.get("guild_name") or "").strip()
        if not any(p in nome_guild.lower() for p in procurados):
            continue
        for membro in raw.get("players") or []:
            uid = norm_uid(membro.get("player_uid", ""))
            info = membro.get("player_info") or {}
            if uid:
                out.append((uid, info.get("player_name") or "?", nome_guild))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Sonda os containers de inventário de um jogador")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", default="")
    ap.add_argument("--guildas", default="",
                    help="nomes de guild — sonda TODOS os membros de cada uma")
    ap.add_argument("--containers", default="",
                    help="GUIDs de container crus (32 hex, separados por vírgula) — "
                         "sonda direto, sem passar pelo Players/<uid>.sav")
    ap.add_argument("--detalhar", action="store_true",
                    help="lista item por item o que há dentro de cada container")
    ap.add_argument("--limite", type=int, default=6, help="quantos backups olhar")
    ap.add_argument("--arquivos", default="",
                    help="caminhos específicos a olhar (relativos à pasta do mundo), "
                         "separados por vírgula — ignora --limite")
    args = ap.parse_args()

    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES_MUNDO}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    # O Level.sav é lido UMA vez e reaproveitado para todos os jogadores —
    # são ~30s de parse cada, e a rotina roda sobre a guild inteira.
    world = ler_gvas(baixar(cfg, SAVE_PATH.format(guid=cfg.guid)), custom
                     ).properties["worldSaveData"]["value"]

    alvos_uid: list[tuple[str, str, str]] = [
        (norm_uid(u), "?", "") for u in args.uids.split(",") if u.strip()
    ]
    if args.guildas:
        achados = membros_das_guildas(world, args.guildas.split(","))
        print(f"  guildas pedidas: {len(achados)} membro(s) encontrados", flush=True)
        for uid, nome, guild in achados:
            print(f"    {nome} ({uid}) — {guild}")
        ja = {u for u, _, _ in alvos_uid}
        alvos_uid += [a for a in achados if a[0] not in ja]

    crus = {}
    for g in args.containers.split(","):
        gid = norm_uid(g.strip())
        if gid:
            crus[gid[:8] + "…"] = gid

    if not alvos_uid and not crus:
        sys.exit("informe --uids, --guildas ou --containers")

    resumo: list[str] = []

    # Container solto: serve para conferir se um GUID que um save ANTIGO
    # apontava ainda existe no mundo, e com o quê dentro. É assim que se
    # descobre para onde a bag foi quando o jogo trocou os GUIDs.
    if crus:
        print(f"\n======== {len(crus)} container(s) avulso(s) ========", flush=True)
        total = olhar("Level.sav (hoje)", world, crus, args.detalhar)
        resumo.append(f"containers avulsos: {total} slots com conteudo no save vivo")
        for arq in [a.strip() for a in args.arquivos.split(",") if a.strip()]:
            caminho = f"Pal/Saved/SaveGames/0/{cfg.guid}/{arq}"
            try:
                w = ler_gvas(baixar(cfg, caminho), custom).properties["worldSaveData"]["value"]
            except Exception as err:  # noqa: BLE001
                print(f"\n--- {arq} --- nao deu para ler ({type(err).__name__})")
                continue
            olhar(arq, w, crus, args.detalhar)

    for uid, nome, guild in alvos_uid:
        titulo = f"{nome} ({uid})" if nome != "?" else f"uid {uid}"
        print(f"\n================ {titulo} ================", flush=True)
        try:
            alvos = containers_do_jogador(cfg, uid)
        except FileNotFoundError:
            print("  ✗ Players/<uid>.sav não existe — sem ele nem dá para saber quais são os containers")
            resumo.append(f"{nome}: SEM save individual")
            continue
        if not alvos:
            print("  ✗ o save individual não tem nenhum campo *ContainerId legível")
            resumo.append(f"{nome}: save individual ilegível")
            continue
        print("  containers que o save individual aponta:")
        for campo, gid in alvos.items():
            print(f"    {campo} = {gid}")

        total = olhar("Level.sav (hoje)", world, alvos, args.detalhar)
        vazios = [c for c, g in alvos.items()
                  if "Container" in c and "Pal" not in c and "Otomo" not in c
                  and slots_com_coisa(secao_por_id(world, "ItemContainerSaveData").get(g))[1] == 0]
        resumo.append(f"{nome}: {total} slots com conteúdo"
                      + (f" | ⚠ {len(vazios)} containers de item com tamanho zero" if vazios else ""))

        escolhidos = [a.strip() for a in args.arquivos.split(",") if a.strip()]
        # `arq`, não `nome`: `nome` é o do jogador e o loop o sobrescrevia.
        for arq in escolhidos or candidatos_a_backup(cfg)[: args.limite]:
            caminho = f"Pal/Saved/SaveGames/0/{cfg.guid}/{arq}"
            try:
                w = ler_gvas(baixar(cfg, caminho), custom).properties["worldSaveData"]["value"]
            except Exception as err:  # noqa: BLE001
                print(f"\n--- {arq} --- não deu para ler ({type(err).__name__})")
                continue
            olhar(arq, w, alvos, args.detalhar)

    print("\n================ RESUMO ================")
    for linha in resumo:
        print(f"  {linha}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
