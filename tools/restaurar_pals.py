#!/usr/bin/env python3
"""
Devolve os Pals de um jogador a partir de um backup — o Pal Box e a party.

Existe porque restaurar a base de uma guild inativa "acorda" a rotina de
limpeza do Palworld (`bAutoResetGuildNoOnlinePlayers=true`,
`AutoResetGuildTimeNoOnlinePlayers=72.0`): o servidor apagou a base de novo e
levou junto os Pals dos donos. Medido: Tenshi 260 -> 0, Givaldo 107 -> 0.

Um Pal de jogador mora em dois lugares que precisam viajar juntos:
  1. A entrada dele em `CharacterSaveParameterMap` (o Pal em si).
  2. O slot que o aponta em `CharacterContainerSaveData` (a caixa).

Qual é a caixa de cada jogador: **não dá para descobrir pelo `Level.sav`**.
`PalStorageContainerId` (Pal Box) e `OtomoCharacterContainerId` (party) moram
no `Players/<uid>.sav`, não no SaveParameter do mundo — medido por
`tools/sondar_containers.py`, que listou os 17 campos do SaveParameter do
Tenshi sem nenhum com "Container" no nome, e confirmado pelo Save Pal
(`player::container_id_from` recebe o SaveData do save individual).

O caminho que funciona é o inverso, e é o mesmo que o Save Pal usa em
`base_container_membership`: cada Pal carrega `SlotId.ContainerId.ID` (a
grafia `SlotID` aparece em outras versões), ou seja, **o próprio Pal diz em
que caixa está**. Juntando os Pals do dono, saem os containers dele — sem
depender de arquivo nenhum. Medido no backup: Tenshi 255 Pals na caixa
`6E9ABA51…` + 5 na party `37916D58…`; Givaldo 102 + 5.

Sem o container, o Pal existe no mundo mas não aparece na caixa de ninguém.

Mesmo padrão de segurança do `reset_player.py`: `--verificar`/`--simular`/
`--aplicar`, servidor tem que estar offline, backup conferido por tamanho,
upload com nome temporário e troca por rename atômico.

Uso:
    python tools/restaurar_pals.py --servidor pve-free \
        --uids 21F2BD36...,502FCA99... \
        --arquivo-backup Level.sav.bak-20260905-172655 --simular
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time

import paramiko

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from restaurar_base import (  # noqa: E402
    ZERO_UID, Servidor, _abortar, apagar, baixar, dig, enviar, escolher_backup,
    info_arquivo, norm_uid, renomear, scalar, servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
BACKUP_PATH = "Pal/Saved/SaveGames/0/{guid}/{arquivo}"
PLAYER_PATH = "Pal/Saved/SaveGames/0/{guid}/Players/{uid}.sav"

NEEDED_SECTIONS = (
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
    ".worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData",
    ".worldSaveData.GroupSaveDataMap",
)


# ------------------------------------------------------------------ navegação

def entrada_do_jogador(world, uid: str):
    """A entrada de CharacterSaveParameterMap do personagem do jogador."""
    for entrada in dig(world, "CharacterSaveParameterMap", "value", default=[]) or []:
        param = dig(entrada, "value", "RawData", "value", "object", "SaveParameter", "value")
        if not isinstance(param, dict) or not scalar(param.get("IsPlayer"), False):
            continue
        if norm_uid(scalar(dig(entrada, "key", "PlayerUId"), "")) == uid:
            return entrada, param
    return None, None


def container_do_pal(param: dict) -> str:
    """A caixa em que este Pal está, por `SlotId.ContainerId.ID`.

    O jogo escreve o campo com duas grafias conforme a versão (`SlotId` no
    pve-free, `SlotID` em outras), e o GUID vem embrulhado em dois níveis de
    struct — daí a lista de caminhos em vez de um só.
    """
    slot = param.get("SlotId", param.get("SlotID"))
    if slot is None:
        return ""
    for caminho in (("value", "ContainerId", "value", "ID"),
                    ("value", "ContainerId", "ID"),
                    ("ContainerId", "value", "ID")):
        valor = scalar(dig(slot, *caminho, default=None), None)
        if valor:
            return norm_uid(valor)
    return ""


def containers_dos_pals(pals: list) -> dict[str, int]:
    """GUID da caixa -> quantos Pals do dono estão nela."""
    out: dict[str, int] = {}
    for entrada in pals:
        param = dig(entrada, "value", "RawData", "value", "object", "SaveParameter", "value")
        cid = container_do_pal(param) if isinstance(param, dict) else ""
        if cid and cid != ZERO_UID:
            out[cid] = out.get(cid, 0) + 1
    return out


def pals_do_jogador(world, uid: str) -> list:
    """Toda entrada de CharacterSaveParameterMap que é um Pal desse dono."""
    out = []
    for entrada in dig(world, "CharacterSaveParameterMap", "value", default=[]) or []:
        param = dig(entrada, "value", "RawData", "value", "object", "SaveParameter", "value")
        if not isinstance(param, dict) or scalar(param.get("IsPlayer"), False):
            continue
        if norm_uid(scalar(param.get("OwnerPlayerUId"), "")) == uid:
            out.append(entrada)
    return out


def instance_id_da_entrada(entrada) -> str:
    return norm_uid(scalar(dig(entrada, "key", "InstanceId"), ""))


def containers_por_id(world) -> dict[str, dict]:
    out = {}
    for entrada in dig(world, "CharacterContainerSaveData", "value", default=[]) or []:
        cid = norm_uid(scalar(dig(entrada, "key", "ID"), ""))
        if cid:
            out[cid] = entrada
    return out


def slots_ocupados(entrada) -> int:
    """Quantos slots da caixa têm um Pal de verdade dentro."""
    if entrada is None:
        return 0
    slots = dig(entrada, "value", "Slots", "value", "values", default=None)
    if not isinstance(slots, list):
        return 0
    n = 0
    for s in slots:
        iid = norm_uid(scalar(dig(s, "RawData", "value", "instance_id"), "")
                       or scalar(dig(s, "IndividualId", "value", "InstanceId"), ""))
        if iid and iid != ZERO_UID:
            n += 1
    return n


def lista_mutavel(world, secao: str) -> list:
    """Referência mutável de verdade da lista de uma seção — sem isso o
    .append() cai numa lista solta e não aparece no save reserializado."""
    prop = world.get(secao)
    if not isinstance(prop, dict):
        prop = {"value": []}
        world[secao] = prop
    if not isinstance(prop.get("value"), list):
        prop["value"] = []
    return prop["value"]


# -------------------------------------------------------------------- edição

def restaurar_pals_do_jogador(atual: dict, backup: dict, uid: str) -> dict:
    rel = {"uid": uid, "nome": "", "erro": None,
           "pals_antes": 0, "pals_no_backup": 0, "pals_copiados": 0,
           "containers": []}

    entrada_atual, param_atual = entrada_do_jogador(atual, uid)
    if not param_atual:
        rel["erro"] = "jogador não existe no save atual"
        return rel
    rel["nome"] = str(scalar(param_atual.get("NickName"), "") or "")

    entrada_bkp, param_bkp = entrada_do_jogador(backup, uid)
    if not param_bkp:
        rel["erro"] = "jogador não existe no backup"
        return rel

    rel["pals_antes"] = len(pals_do_jogador(atual, uid))
    pals_backup = pals_do_jogador(backup, uid)
    rel["pals_no_backup"] = len(pals_backup)

    if not pals_backup:
        rel["erro"] = "o backup não tem nenhum Pal desse jogador"
        return rel

    # ---- 1. os Pals em si ------------------------------------------------
    chars_atual = lista_mutavel(atual, "CharacterSaveParameterMap")
    ja_presentes = {instance_id_da_entrada(e) for e in chars_atual}
    for pal in pals_backup:
        iid = instance_id_da_entrada(pal)
        if iid and iid in ja_presentes:
            continue
        chars_atual.append(pal)
        if iid:
            ja_presentes.add(iid)
        rel["pals_copiados"] += 1

    # ---- 2. as caixas que apontam pra eles -------------------------------
    # Quais caixas: as que os próprios Pals do backup declaram em
    # `SlotId.ContainerId.ID`. O GUID é o mesmo dos dois lados, então a
    # entrada do backup substitui a de hoje (que a limpeza esvaziou) no
    # mesmo lugar da lista — trocar in-place preserva a posição.
    containers_bkp = containers_por_id(backup)
    containers_atuais = containers_por_id(atual)
    lista_containers = lista_mutavel(atual, "CharacterContainerSaveData")

    for cid, quantos in sorted(containers_dos_pals(pals_backup).items(),
                               key=lambda kv: -kv[1]):
        info = {"id": cid, "pals": quantos, "acao": ""}

        alvo = containers_bkp.get(cid)
        if not alvo:
            info["acao"] = "caixa não existe no backup — pulada (Pals ficam órfãos)"
            rel["containers"].append(info)
            continue

        antigo = containers_atuais.get(cid)
        if antigo is not None:
            try:
                lista_containers[lista_containers.index(antigo)] = alvo
                info["acao"] = "substituída pela do backup"
            except ValueError:
                lista_containers.append(alvo)
                info["acao"] = "adicionada (a de hoje não estava na lista)"
        else:
            lista_containers.append(alvo)
            info["acao"] = "adicionada (não existia hoje)"

        rel["containers"].append(info)

    return rel


# ---------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Devolve os Pals de um jogador a partir de um backup")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", help="UIDs (32 hex), separados por vírgula")
    ap.add_argument("--arquivo-backup", default="auto",
                    help="nome do backup, ou 'auto' para achar sozinho o mais recente que ainda tem os Pals")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--verificar", action="store_true")
    modo.add_argument("--simular", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    if not args.verificar and not args.uids:
        sys.exit("--uids é obrigatório em --simular e --aplicar")

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED_SECTIONS}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    uids = [norm_uid(u) for u in (args.uids or "").split(",") if u.strip()]
    caminho = SAVE_PATH.format(guid=cfg.guid)

    print(f"=== {cfg.slug} ===", flush=True)

    if args.arquivo_backup == "auto" and uids:
        # Serve o backup mais recente em que algum dos jogadores ainda tenha
        # Pals. Aqui o teste é caro (CharacterSaveParameterMap é a seção
        # grande), mas é a única que responde a pergunta.
        def tem_pals(world) -> str:
            achados = [(uid, len(pals_do_jogador(world, uid))) for uid in uids]
            if not any(n for _, n in achados):
                return ""
            return ", ".join(f"{uid[:8]}…: {n} Pals" for uid, n in achados if n)

        escolhido = escolher_backup(
            cfg, (".worldSaveData.CharacterSaveParameterMap.Value.RawData",), tem_pals, limite=8)
        if not escolhido:
            print("\n  ❌ Nenhum backup disponível ainda tem Pals desses jogadores.")
            return 1
        args.arquivo_backup = escolhido
        print(f"  → usando {escolhido}\n", flush=True)

    caminho_backup = BACKUP_PATH.format(guid=cfg.guid, arquivo=args.arquivo_backup)

    if args.aplicar:
        pid = PANEL_IDS.get(cfg.slug)
        if not pid:
            sys.exit(f"sem panelId para {cfg.slug}")
        try:
            estado = estado_do_painel(pid)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
        if estado != "offline":
            print(f"  ❌ O servidor está '{estado}', não 'offline'. Gravar com o jogo rodando corrompe o mundo.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    t0 = time.time()
    original = baixar(cfg, caminho)
    print(f"  save atual baixado: {len(original):,} bytes em {time.time()-t0:.0f}s", flush=True)
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    t0 = time.time()
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    print(f"  parse: {time.time()-t0:.0f}s ({len(custom)} de {len(PALWORLD_CUSTOM_PROPERTIES)} seções)", flush=True)
    world = gvas.properties["worldSaveData"]["value"]

    if args.verificar:
        t0 = time.time()
        refeito = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
        print(f"  reserializado: {len(refeito):,} bytes em {time.time()-t0:.0f}s")
        volta, _ = decompress_sav_to_gvas(refeito)
        if volta == gvas_bytes:
            print("  ✅ O GVAS descomprimido é IDÊNTICO — o ciclo não corrompe.")
            return 0
        print("  ❌ O GVAS mudou. NÃO usar --aplicar até entender o porquê.")
        return 1

    t0 = time.time()
    backup_bytes = baixar(cfg, caminho_backup)
    backup_gvas_bytes, _ = decompress_sav_to_gvas(backup_bytes)
    backup_gvas = GvasFile.read(backup_gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    backup_world = backup_gvas.properties["worldSaveData"]["value"]
    print(f"  backup lido e decodificado em {time.time()-t0:.0f}s ({args.arquivo_backup})", flush=True)

    print()
    algo_mudou = False
    for uid in uids:
        rel = restaurar_pals_do_jogador(world, backup_world, uid)
        print(f"  uid {uid} ({rel['nome'] or '?'}):")
        if rel["erro"]:
            print(f"    ✗ {rel['erro']}")
            continue
        print(f"    Pals hoje: {rel['pals_antes']} | no backup: {rel['pals_no_backup']}"
              f" | copiados: {rel['pals_copiados']}")
        if not rel["containers"]:
            print("    ⚠ NENHUMA caixa identificada — os Pals ficariam órfãos. Não aplicar.")
        for c in rel["containers"]:
            print(f"    caixa {c['id']} ({c['pals']} Pals) — {c['acao']}")
        algo_mudou = algo_mudou or rel["pals_copiados"] > 0

    if not algo_mudou:
        print("\n  Nada a restaurar.")
        return 1

    t0 = time.time()
    checagem = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    recheck_bytes, _ = decompress_sav_to_gvas(checagem)
    recheck_gvas = GvasFile.read(recheck_bytes, PALWORLD_TYPE_HINTS, custom)
    recheck_world = recheck_gvas.properties["worldSaveData"]["value"]
    print(f"\n  reserializado (checagem): {len(checagem):,} bytes em {time.time()-t0:.0f}s")
    tudo_ok = True
    for uid in uids:
        pals = pals_do_jogador(recheck_world, uid)
        conts = containers_por_id(recheck_world)
        print(f"    pós-reserialização, uid {uid}: {len(pals)} Pals")
        # O teste que faltava da primeira vez: o Pal só aparece no Pal Box se a
        # caixa que ele declara existir de verdade no save reserializado.
        for cid, quantos in sorted(containers_dos_pals(pals).items(), key=lambda kv: -kv[1]):
            ocupados = slots_ocupados(conts.get(cid))
            marca = "✓" if ocupados >= quantos else "❌"
            print(f"      {marca} caixa {cid}: {quantos} Pals apontam, "
                  f"{ocupados if cid in conts else 'CAIXA AUSENTE'} slots ocupados")
            if ocupados < quantos:
                tudo_ok = False
    if not tudo_ok:
        print("\n  ❌ Alguma caixa não sobreviveu ao ciclo — os Pals ficariam órfãos.")
        print("     Nada foi gravado.")
        return 1

    if args.simular:
        print("\n  (simulação — nada foi gravado)")
        return 0

    novo = checagem
    backup_seguranca = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, backup_seguranca, original)
    conf = info_arquivo(cfg, backup_seguranca)
    if not conf or conf[0] != len(original):
        return _abortar(f"backup incompleto ({conf[0] if conf else 0} de {len(original)} bytes).")
    print(f"  ✅ backup conferido: {backup_seguranca} ({conf[0]:,} bytes)", flush=True)

    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(novo):
        apagar(cfg, temporario)
        return _abortar(f"upload incompleto ({conf_novo[0] if conf_novo else 0} de {len(novo)} bytes).")

    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes, por rename)", flush=True)

    # NÃO apagar `Players/<uid>.sav` aqui. Esse arquivo guarda os ponteiros
    # `PalStorageContainerId`/`OtomoCharacterContainerId`; sem ele o servidor
    # trata as caixas do jogador como órfãs e apaga os Pals na subida
    # seguinte. Foi exatamente o que aconteceu em 05/09/2026 17:27 UTC
    # (Tenshi 260 -> 0, Givaldo 107 -> 0) — ver `restaurar_player_sav.py`.
    for uid in uids:
        individual = PLAYER_PATH.format(guid=cfg.guid, uid=uid)
        existe = info_arquivo(cfg, individual)
        estado = f"presente ({existe[0]:,} bytes)" if existe else "❌ AUSENTE — restaure antes de subir o servidor"
        print(f"  Players/{uid}.sav: {estado}")

    print("\n  ✅ Feito.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
