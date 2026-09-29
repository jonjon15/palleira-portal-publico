#!/usr/bin/env python3
"""
Devolve Pals roubados para a Palbox do dono de verdade.

Nasceu do raid de 29/09/2026 no Dominantes. Tentar devolver os Pals do Dante
para a caixa de trabalhadores da base não funcionou: o jogo, ao carregar,
apagou os 20 Pals junto com a caixa (ela não bate com o WorkerDirector da
base restaurada). ⚠️ Não repetir esse caminho — o script dele foi apagado. A Palbox do jogador é o destino que o jogo sempre aceita —
depois o dono põe os Pals para trabalhar de novo.

Cada Pal vem de uma fonte:
  - "vivo": o próprio save atual (o Pal existe, só está com o ladrão);
  - "snapshot:<id>": o fecho de um `base_snapshots` do banco;
  - "backup:<caminho>": um Level.sav antigo, relativo à pasta do mundo.

Para cada Pal: entrada nova com o dono e o slot da Palbox de destino, slot
em qualquer outra caixa esvaziado, slot novo na Palbox, handle movido para a
guild do dono. O dono e o formato do SlotId são copiados de um Pal que já
mora naquela Palbox — nada é montado à mão.

Plano em JSON: [{"iid": "<32 hex>", "para": "<uid 32 hex>", "fonte": "..."}]

⚠️ Servidor PARADO no --aplicar.

Uso:
    python tools/devolver_pals_para_palbox.py --servidor pvp-free --plano p.json --simular
"""

from __future__ import annotations

import argparse
import copy
import gzip
import json
import os
import pickle
import sys
import time
from collections import Counter

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from restaurar_base import (  # noqa: E402
    NEEDED_SECTIONS, _abortar, apagar, baixar, dig, enviar, esvaziar_slot_de_pal,
    guid_zero, guildas_por_id, guild_do_jogador, info_arquivo, norm_uid,
    personagens_por_instance_id, renomear, scalar, secao_por_id, servidores,
    slots_do_container,
)
SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"


def id_do_pal(entrada) -> str:
    return norm_uid(scalar(dig(entrada, "key", "InstanceId"), ""))


def param(entrada) -> dict:
    return dig(entrada, "value", "RawData", "value", "object", "SaveParameter",
               "value", default={}) or {}


def dono_de(entrada) -> str:
    return norm_uid(scalar(param(entrada).get("OwnerPlayerUId"), ""))


def caixa_de(entrada) -> str:
    p = param(entrada)
    slot = p.get("SlotId") or p.get("SlotID") or {}
    return norm_uid(scalar(dig(slot, "value", "ContainerId", "value", "ID"), ""))


def slot_aponta(slot) -> str:
    return norm_uid(dig(slot, "RawData", "value", "instance_id", default="") or "")


def slot_index(slot) -> int:
    return int(scalar(slot.get("SlotIndex"), -1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--plano", required=True)
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS
    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED_SECTIONS}
    cfg = servidores()[args.servidor]
    plano = json.load(open(args.plano, encoding="utf-8"))

    def ler_save(caminho: str):
        b = baixar(cfg, f"Pal/Saved/SaveGames/0/{cfg.guid}/{caminho}")
        g, tipo = decompress_sav_to_gvas(b)
        gv = GvasFile.read(g, PALWORLD_TYPE_HINTS, custom)
        return b, tipo, gv, gv.properties["worldSaveData"]["value"]

    if args.aplicar:
        if estado_do_painel(PANEL_IDS[cfg.slug]) != "offline":
            print("  ❌ o servidor precisa estar parado para gravar.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    original, tipo, gvas, atual = ler_save("Level.sav")
    vivos = personagens_por_instance_id(atual)
    zero = guid_zero(atual)

    # ---- fontes ----------------------------------------------------------
    fontes: dict[str, dict] = {}
    for f in {p["fonte"] for p in plano}:
        if f == "vivo":
            fontes[f] = vivos
        elif f.startswith("snapshot:"):
            with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
                blob, = conn.execute("select blob from base_snapshots where id = %s",
                                     (int(f.split(":", 1)[1]),)).fetchone()
            # Blob gravado pelo nosso arquivar_bases.py — fonte confiável.
            fecho = pickle.loads(gzip.decompress(blob)).get("fecho", {}) or {}
            fontes[f] = {id_do_pal(e): e for e in fecho.get("CharacterSaveParameterMap") or []}
        elif f.startswith("backup:"):
            fontes[f] = personagens_por_instance_id(ler_save(f.split(":", 1)[1])[3])

    caixas = secao_por_id(atual, "CharacterContainerSaveData")
    guildas = guildas_por_id(atual)
    lista_pals = dig(atual, "CharacterSaveParameterMap", "value")
    pos = {id_do_pal(e): i for i, e in enumerate(lista_pals)}
    todos = {norm_uid(p["iid"]) for p in plano}

    # Tira os Pals do plano de toda caixa e de toda guild antes de recolocar.
    esvaziados = 0
    for entrada in caixas.values():
        for slot in slots_do_container(entrada):
            if slot_aponta(slot) in todos and esvaziar_slot_de_pal(slot, zero):
                esvaziados += 1
    handles_velhos = {}
    for g in guildas.values():
        hs = g["raw"].get("individual_character_handle_ids") or []
        fica = [h for h in hs if norm_uid(h.get("instance_id", "")) not in todos]
        for h in hs:
            if norm_uid(h.get("instance_id", "")) in todos:
                handles_velhos[norm_uid(h["instance_id"])] = h
        if len(fica) != len(hs):
            g["raw"]["individual_character_handle_ids"] = fica
    print(f"  slots esvaziados: {esvaziados}, handles retirados: {len(handles_velhos)}")

    # ---- destino por jogador ---------------------------------------------
    destinos = {}
    for uid in {norm_uid(p["para"]) for p in plano}:
        meus = [e for e in vivos.values() if dono_de(e) == uid]
        palbox, _ = Counter(caixa_de(e) for e in meus).most_common(1)[0]
        modelo = next(e for e in meus if caixa_de(e) == palbox)
        chaves = set().union(*(param(e).keys() for e in meus))
        cx = caixas[palbox]
        ocupados = {slot_index(s) for s in slots_do_container(cx)
                    if slot_aponta(s) not in ("", norm_uid(str(zero)))}
        total = int(scalar(dig(cx, "value", "SlotNum"), 960))
        g = guild_do_jogador(atual, uid)
        destinos[uid] = {"palbox": palbox, "modelo": modelo, "chaves": chaves, "cx": cx,
                         "livres": [i for i in range(total) if i not in ocupados],
                         "guild": g}
        print(f"  destino {uid[:8]}: Palbox {palbox[:8]}, {len(ocupados)}/{total} ocupados")

    # ---- recolocar -------------------------------------------------------
    for item in plano:
        iid, uid = norm_uid(item["iid"]), norm_uid(item["para"])
        fonte = fontes[item["fonte"]].get(iid)
        if fonte is None:
            print(f"  ✗ {iid[:8]} não está na fonte {item['fonte']}")
            return 1
        d = destinos[uid]
        if not d["livres"]:
            print(f"  ✗ Palbox de {uid[:8]} cheia")
            return 1
        idx = d["livres"].pop(0)
        entrada = copy.deepcopy(fonte)
        p = param(entrada)
        m = param(d["modelo"])
        for k in [k for k in p if k not in d["chaves"]]:
            del p[k]  # campos de trabalho na base, que Pal de Palbox não tem
        p["OwnerPlayerUId"] = copy.deepcopy(m["OwnerPlayerUId"])
        chave_slot = "SlotId" if "SlotId" in m else "SlotID"
        p.pop("SlotID" if chave_slot == "SlotId" else "SlotId", None)
        p[chave_slot] = copy.deepcopy(m[chave_slot])
        p[chave_slot]["value"]["SlotIndex"]["value"] = idx
        if iid in pos:
            lista_pals[pos[iid]] = entrada
        else:
            lista_pals.append(entrada)
            pos[iid] = len(lista_pals) - 1

        slots = slots_do_container(d["cx"])
        alvo = next((s for s in slots if slot_index(s) == idx), None)
        if alvo is None:
            modelo_slot = next(s for s in slots if slot_aponta(s) not in ("", norm_uid(str(zero))))
            alvo = copy.deepcopy(modelo_slot)
            alvo["SlotIndex"]["value"] = idx
            slots.append(alvo)
        alvo["RawData"]["value"]["instance_id"] = entrada["key"]["InstanceId"]["value"]

        if d["guild"]:
            hs = d["guild"]["raw"].setdefault("individual_character_handle_ids", [])
            h = handles_velhos.get(iid)
            # Modelo tem de ser o handle de um Pal, não o de um jogador: o
            # `guid` dos dois é diferente.
            de_pal = [x for x in hs if norm_uid(x.get("instance_id", "")) in vivos]
            if h is None and de_pal:
                h = copy.deepcopy(de_pal[-1])
                h["instance_id"] = entrada["key"]["InstanceId"]["value"]
            if h is not None:
                hs.append(h)
        print(f"  {scalar(p.get('CharacterID')):25} → {uid[:8]} slot {idx} ({item['fonte']})")

    # ---- conferência -----------------------------------------------------
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    rc = GvasFile.read(decompress_sav_to_gvas(novo)[0], PALWORLD_TYPE_HINTS,
                       custom).properties["worldSaveData"]["value"]
    rp = personagens_por_instance_id(rc)
    rcx = secao_por_id(rc, "CharacterContainerSaveData")
    ok = 0
    for item in plano:
        iid, uid = norm_uid(item["iid"]), norm_uid(item["para"])
        e = rp.get(iid)
        caixa = destinos[uid]["palbox"]
        if e and dono_de(e) == uid and caixa_de(e) == caixa and any(
                slot_aponta(s) == iid for s in slots_do_container(rcx[caixa])):
            ok += 1
    print(f"\n  reserializado: {len(novo):,} bytes — {ok}/{len(plano)} Pals conferidos")
    if ok != len(plano):
        print("  ❌ conferência falhou. Nada gravado.")
        return 1
    if args.simular:
        print("  (simulação — nada foi gravado)")
        return 0

    caminho = SAVE_PATH.format(guid=cfg.guid)
    seguranca = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, seguranca, original)
    conf = info_arquivo(cfg, seguranca)
    if not conf or conf[0] != len(original):
        return _abortar("backup incompleto.")
    print(f"  ✅ backup conferido: {seguranca}", flush=True)
    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(novo):
        apagar(cfg, temporario)
        return _abortar("upload incompleto.")
    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
