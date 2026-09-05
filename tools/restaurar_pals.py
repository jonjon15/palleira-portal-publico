#!/usr/bin/env python3
"""
Devolve os Pals de um jogador a partir de um backup — o Pal Box e a party.

Existe porque restaurar a base de uma guild inativa "acorda" a rotina de
limpeza do Palworld (`bAutoResetGuildNoOnlinePlayers=true`,
`AutoResetGuildTimeNoOnlinePlayers=72.0`): o servidor apagou a base de novo e
levou junto os Pals dos donos. Medido: Tenshi 260 -> 0, Givaldo 107 -> 0.

Um Pal de jogador mora em dois lugares que precisam viajar juntos:
  1. A entrada dele em `CharacterSaveParameterMap` (o Pal em si).
  2. O slot que o aponta em `CharacterContainerSaveData` — o container é
     nomeado pelo `PalStorageContainerId` (Pal Box) e pelo
     `OtomoCharacterContainerId` (party) no SaveParameter do jogador.
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
    Servidor, _abortar, apagar, baixar, dig, enviar, info_arquivo, norm_uid,
    renomear, scalar, servidores,
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


def container_id(param: dict, campo: str) -> str:
    """O GUID do container nomeado por `campo` no SaveParameter do jogador.

    A forma exata varia entre versões (`{'value': {'ID': ...}}` ou direto),
    então desce por `scalar` em vez de assumir um caminho só.
    """
    node = param.get(campo)
    for caminho in (("value", "ID"), ("value", "value", "ID"), ("ID",)):
        achado = dig(node, *caminho, default=None)
        valor = scalar(achado, None)
        if valor:
            return norm_uid(valor)
    valor = scalar(node, None)
    return norm_uid(valor) if valor else ""


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

    # ---- 2. os containers que apontam pra eles ---------------------------
    # O container atual está vazio (a limpeza esvaziou os slots), então a
    # entrada inteira do backup substitui a de hoje. Trocar no lugar mantém a
    # posição na lista, que é o que os índices de slot enxergam.
    containers_bkp = containers_por_id(backup)
    containers_atuais = containers_por_id(atual)
    lista_containers = lista_mutavel(atual, "CharacterContainerSaveData")

    for campo in ("PalStorageContainerId", "OtomoCharacterContainerId"):
        cid_atual = container_id(param_atual, campo)
        cid_bkp = container_id(param_bkp, campo)
        info = {"campo": campo, "id_atual": cid_atual or "(vazio)",
                "id_backup": cid_bkp or "(vazio)", "acao": ""}

        alvo = containers_bkp.get(cid_bkp) if cid_bkp else None
        if not alvo:
            info["acao"] = "container não achado no backup — pulado"
            rel["containers"].append(info)
            continue

        if cid_atual and cid_atual in containers_atuais:
            antigo = containers_atuais[cid_atual]
            try:
                posicao = lista_containers.index(antigo)
                lista_containers[posicao] = alvo
                info["acao"] = "substituído pelo do backup"
            except ValueError:
                lista_containers.append(alvo)
                info["acao"] = "adicionado (o atual não estava na lista)"
        else:
            lista_containers.append(alvo)
            info["acao"] = "adicionado (não existia hoje)"

        # O jogador precisa apontar pro container que acabou de entrar.
        if cid_bkp and cid_atual != cid_bkp:
            param_atual[campo] = param_bkp[campo]
            info["acao"] += " + ponteiro do jogador atualizado"

        rel["containers"].append(info)

    return rel


# ---------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Devolve os Pals de um jogador a partir de um backup")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", help="UIDs (32 hex), separados por vírgula")
    ap.add_argument("--arquivo-backup", default="Level.sav.bak-20260905-172655")
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
    caminho_backup = BACKUP_PATH.format(guid=cfg.guid, arquivo=args.arquivo_backup)

    print(f"=== {cfg.slug} ===", flush=True)

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
        for c in rel["containers"]:
            print(f"    container {c['campo']}: atual={c['id_atual']} backup={c['id_backup']} — {c['acao']}")
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
    for uid in uids:
        print(f"    pós-reserialização, uid {uid}: {len(pals_do_jogador(recheck_world, uid))} Pals")

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

    for uid in uids:
        individual = PLAYER_PATH.format(guid=cfg.guid, uid=uid)
        print(f"  Players/{uid}.sav: " + ("apagado" if apagar(cfg, individual) else "não existia"))

    print("\n  ✅ Feito.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
