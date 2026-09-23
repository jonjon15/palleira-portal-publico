#!/usr/bin/env python3
"""
Tira do Level.sav a segunda referência de um Pal que aparece em dois slots.

Achado em 23/09/2026 com o SantØs, no pvp-free: depois da raid da Astralym
(entre 21/09 23:59 e 22/09 23:59), 18 Pals dele passaram a aparecer duas
vezes na palbox. Não são cópias: é o MESMO `InstanceId` apontado por dois
slots de `CharacterContainerSaveData` (os lugares 0–17 e 18–34 da palbox, e
um deles também na party). Soltar, vender ou mandar para o site uma das duas
"cópias" deixa a outra apontando para o nada — o tipo de referência quebrada
que já derrubou o pve-free em 16/09 (ver `consertar_refs_quebradas.py`).

A REST do PalDefender não mostra isso: devolve os Pals num dict por
instance id, então a segunda referência some na leitura. Só o save mostra.

Qual slot fica: o que o próprio Pal declara em `SlotId` (container + índice).
Esse é o lado que o jogo considera "a casa" do Pal. Se nenhum bater, fica o
primeiro encontrado e o caso é marcado no relatório. O Pal em si
(`CharacterSaveParameterMap`) não é tocado.

A lista de slots é esparsa (cada entrada carrega o próprio `SlotIndex`, e
`SlotNum` é a capacidade), então remover a entrada repetida só esvazia
aquele lugar — não desloca os outros.

Mesmo padrão de segurança do `restaurar_pals.py`: `--simular` não grava;
`--aplicar` exige o servidor `offline` no painel, sobe backup conferido por
tamanho e troca o arquivo por rename.

Uso:
    python tools/consertar_slots_duplicados.py --servidor pvp-free --simular
    python tools/consertar_slots_duplicados.py --servidor pvp-free --uids A0535B01... --aplicar
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from restaurar_base import (  # noqa: E402
    _abortar, apagar, baixar, dig, enviar, info_arquivo, norm_uid, renomear,
    scalar, servidores,
)
from restaurar_pals import container_do_pal  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

NEEDED_SECTIONS = (
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
    ".worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData",
)


def pals_por_instancia(world) -> dict[str, dict]:
    """instance id -> dono, espécie, nível, e a casa que o Pal declara."""
    out = {}
    for e in dig(world, "CharacterSaveParameterMap", "value", default=[]) or []:
        p = dig(e, "value", "RawData", "value", "object", "SaveParameter", "value")
        if not isinstance(p, dict) or scalar(p.get("IsPlayer"), False):
            continue
        iid = norm_uid(scalar(dig(e, "key", "InstanceId"), ""))
        slot = p.get("SlotId", p.get("SlotID"))
        indice = scalar(dig(slot, "value", "SlotIndex", default=None), None)
        out[iid] = {
            "dono": norm_uid(scalar(p.get("OwnerPlayerUId"), "")),
            "especie": scalar(p.get("CharacterID"), "?"),
            "nivel": scalar(p.get("Level"), "?"),
            "apelido": scalar(p.get("NickName"), "") or "",
            "casa": (container_do_pal(p), indice),
        }
    return out


def referencias(world, pals: dict) -> dict[str, list]:
    """instance id -> [(lista de slots, entrada do slot, container, índice)]."""
    refs: dict[str, list] = {}
    for c in dig(world, "CharacterContainerSaveData", "value", default=[]) or []:
        cid = norm_uid(scalar(dig(c, "key", "ID"), ""))
        slots = dig(c, "value", "Slots", "value", "values", default=None)
        if not isinstance(slots, list):
            continue
        for s in slots:
            iid = norm_uid(str(dig(s, "RawData", "value", "instance_id", default="") or ""))
            if iid in pals:
                indice = scalar(dig(s, "SlotIndex", default=None), None)
                refs.setdefault(iid, []).append((slots, s, cid, indice))
    return refs


def planejar(world, uids: set[str]) -> tuple[list, list]:
    """(o que remover, relatório legível)."""
    pals = pals_por_instancia(world)
    remover, relatorio = [], []
    for iid, refs in referencias(world, pals).items():
        if len(refs) < 2:
            continue
        pal = pals[iid]
        if uids and pal["dono"] not in uids:
            continue
        casa = pal["casa"]
        fica = next((r for r in refs if (r[2], r[3]) == casa), None)
        sem_casa = fica is None
        fica = fica or refs[0]
        for r in refs:
            if r is not fica:
                remover.append((r[0], r[1]))
        relatorio.append({
            "dono": pal["dono"], "especie": pal["especie"], "nivel": pal["nivel"],
            "apelido": pal["apelido"], "fica": (fica[2][:8], fica[3]),
            "sai": [(r[2][:8], r[3]) for r in refs if r is not fica], "sem_casa": sem_casa,
        })
    return remover, relatorio


def main() -> int:
    ap = argparse.ArgumentParser(description="Tira a segunda referência de Pal em dois slots")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", default="", help="só estes donos (32 hex, vírgula); vazio = todos")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in NEEDED_SECTIONS}
    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")
    uids = {norm_uid(u) for u in args.uids.split(",") if u.strip()}
    caminho = SAVE_PATH.format(guid=cfg.guid)
    print(f"=== {cfg.slug} ===", flush=True)

    if args.aplicar:
        pid = PANEL_IDS.get(cfg.slug)
        if not pid:
            sys.exit(f"sem panelId para {cfg.slug}")
        estado = estado_do_painel(pid)
        if estado != "offline":
            print(f"  ❌ O servidor está '{estado}', não 'offline'. Gravar com o jogo rodando corrompe o mundo.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    t0 = time.time()
    original = baixar(cfg, caminho)
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    world = gvas.properties["worldSaveData"]["value"]
    print(f"  save lido: {len(original):,} bytes em {time.time()-t0:.0f}s", flush=True)

    # Pal sem slot nenhum já antes de mexer não é culpa desta ferramenta —
    # guardado para a checagem do fim não confundir com estrago nosso.
    pals0 = pals_por_instancia(world)
    refs0 = referencias(world, pals0)
    orfaos_antes = {i for i, p in pals0.items() if (not uids or p["dono"] in uids) and not refs0.get(i)}

    remover, relatorio = planejar(world, uids)
    if not relatorio:
        print("  Nenhum Pal em dois slots. Nada a fazer.")
        return 0
    for r in sorted(relatorio, key=lambda x: (x["dono"], x["especie"])):
        aviso = "  ⚠ nenhum slot bate com a casa do Pal" if r["sem_casa"] else ""
        print(f"  {r['dono'][:8]} {r['especie']:<26} lv{r['nivel']:<3} {r['apelido']:<14} "
              f"fica {r['fica']} · sai {r['sai']}{aviso}")
    donos = sorted({r["dono"][:8] for r in relatorio})
    print(f"\n  {len(relatorio)} Pal(s) em 2+ slots, {len(remover)} referência(s) a remover, donos: {donos}")

    for slots, entrada in remover:
        slots.remove(entrada)

    # Checagem: reserializa, lê de volta e confirma que não sobrou nenhum
    # repetido e que nenhum Pal ficou sem slot.
    t0 = time.time()
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    volta = GvasFile.read(decompress_sav_to_gvas(novo)[0], PALWORLD_TYPE_HINTS, custom)
    mundo2 = volta.properties["worldSaveData"]["value"]
    pals2 = pals_por_instancia(mundo2)
    refs2 = referencias(mundo2, pals2)
    alvos = {iid for iid, p in pals2.items() if not uids or p["dono"] in uids}
    repetidos = [i for i in alvos if len(refs2.get(i, [])) > 1]
    orfaos = [i for i in alvos if not refs2.get(i) and i not in orfaos_antes]
    print(f"  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s · "
          f"ainda repetidos: {len(repetidos)} · Pals que perderam o slot: {len(orfaos)}")
    if repetidos or orfaos:
        print("  ❌ A checagem falhou. Nada foi gravado.")
        return 1

    if args.simular:
        print("\n  (simulação — nada foi gravado)")
        return 0

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
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes, por rename)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
