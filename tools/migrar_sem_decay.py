#!/usr/bin/env python3
"""
Leva para o mundo NOVO apenas os jogadores cujas guildas ainda têm base viva
(sem decay), usando o `palworld_aio.managers.backup_manager` — que recorta o
jogador com Pals, itens e containers e remapeia os GUIDs no destino.

Existe porque subir o backup inteiro já foi tentado e o servidor não sobe: os
arquivos `Level.sav.naosobe-*` no diretório do mundo são dessas tentativas. A
aposta agora é levar só quem tem base viva — 21 jogadores em 12 guildas,
medidos em 17/09/2026 — para o mundo criado na reinstalação das 15:31.

🔴 Recortar o JSON à mão deixaria ponteiro solto, que é exatamente o
`EXCEPTION_ACCESS_VIOLATION 0x88` que derruba o servidor. O
`export_player_backup` leva as dependências junto; por isso ele, e não um
recorte caseiro.

Sem `--aplicar`, só exporta e lista — não grava nada no servidor.

Uso:
    python tools/migrar_sem_decay.py --origem-guid E99C… --destino-guid D110…
    python tools/migrar_sem_decay.py --origem-guid E99C… --destino-guid D110… --aplicar
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restaurar_base import (  # noqa: E402
    TICKS_POR_DIA, agora_na_escala_do_save, baixar, dig, enviar,
    info_arquivo, norm_uid, servidores,
)

SAVE = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
LIMITE_H = 72.0


def uid_com_hifens(valor) -> str:
    """O GUID no formato que a CharacterSaveParameterMap usa.

    Aceita as duas formas que aparecem no save — `0edc41b1-0000-…` e o
    `0EDC41B10000…` sem hífens que o `norm_uid` devolve — e sempre retorna a
    primeira, que é a que o `palworld_aio` procura.
    """
    cru = norm_uid(str(valor or "")).lower()
    if not cru:
        return ""
    if "-" in cru:
        return cru
    return f"{cru[0:8]}-{cru[8:12]}-{cru[12:16]}-{cru[16:20]}-{cru[20:32]}"


def guildas_com_base(level_path: str) -> list[dict]:
    """As guildas que ainda têm base e cujo membro mais recente esteve online
    há menos de LIMITE_H — as que o decay ainda não comeu."""
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    raw = open(level_path, "rb").read()
    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items()
              if k in (".worldSaveData.GroupSaveDataMap",)}
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    world = gvas.properties["worldSaveData"]["value"]
    agora = agora_na_escala_do_save(world)

    out: list[dict] = []
    for entrada in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        g = dig(entrada, "value", "RawData", "value", default={}) or {}
        if g.get("group_type") != "EPalGroupType::Guild":
            continue
        if not (g.get("base_ids") or []):
            continue
        membros = g.get("players") or []
        if not membros:
            continue
        ult = max((dig(m, "player_info", "last_online_real_time", default=0) or 0)
                  for m in membros)
        horas = (agora - ult) / TICKS_POR_DIA * 24 if ult else 9e9
        if horas > LIMITE_H:
            continue
        out.append({
            "nome": g.get("guild_name") or "?",
            "horas": horas,
            "bases": len(g.get("base_ids") or []),
            # 🔴 o `palworld_aio` procura o jogador pelo `PlayerUId` como ele
            # está na CharacterSaveParameterMap: GUID com hífens, minúsculo
            # (`0edc41b1-0000-…`). O `norm_uid` do repo tira os hífens e a
            # busca não acha ninguém — foi o que fez os 21 exports falharem
            # com "Could not find player … in CharacterSaveParameterMap".
            "membros": [(uid_com_hifens(dig(m, "player_uid", default="")),
                         dig(m, "player_info", "player_name", default="?"))
                        for m in membros],
        })
    out.sort(key=lambda x: x["horas"])
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Migra quem tem base viva para o mundo novo")
    ap.add_argument("--servidor", default="pve-free")
    ap.add_argument("--origem-guid", required=True)
    ap.add_argument("--destino-guid", required=True)
    ap.add_argument("--origem-arquivo", default="Level.sav")
    ap.add_argument("--aplicar", action="store_true",
                    help="sem isso, só exporta e lista")
    args = ap.parse_args()

    from palworld_aio.managers.backup_manager import (
        export_player_backup, import_player_backup,
    )

    cfg = servidores()[args.servidor]

    print("baixando os dois mundos...", flush=True)
    caminho_origem = f"Pal/Saved/SaveGames/0/{args.origem_guid}/{args.origem_arquivo}"
    org = baixar(cfg, caminho_origem)
    open("origem.sav", "wb").write(org)
    dst = baixar(cfg, SAVE.format(guid=args.destino_guid))
    open("destino.sav", "wb").write(dst)
    print(f"  origem  ({args.origem_arquivo}): {len(org):,} bytes")
    print(f"  destino (Level.sav):             {len(dst):,} bytes\n", flush=True)

    guildas = guildas_com_base("origem.sav")
    alvos = [(uid, nome) for g in guildas for uid, nome in g["membros"]]

    print("=" * 70)
    print(f"{len(guildas)} guildas com base viva — {len(alvos)} jogadores")
    print("=" * 70)
    for g in guildas:
        print(f"\n  [{g['horas']:6.1f}h parada]  {g['nome']}  ({g['bases']} base(s))")
        for uid, nome in g["membros"]:
            print(f"      {uid}  {nome}")
    print(flush=True)

    os.makedirs("exports", exist_ok=True)
    exportados: list[tuple[str, str, str]] = []
    falhas: list[tuple[str, str]] = []
    print("\nexportando...", flush=True)
    for uid, nome in alvos:
        saida = os.path.join("exports", f"{uid}.player.pstz")
        try:
            export_player_backup("origem.sav", uid, saida)
            print(f"  ✅ {nome:<26} {os.path.getsize(saida):>10,} bytes", flush=True)
            exportados.append((uid, nome, saida))
        except Exception as exc:  # noqa: BLE001
            print(f"  ❌ {nome:<26} {exc}", flush=True)
            falhas.append((nome, str(exc)))

    print(f"\nexportados: {len(exportados)}   falharam: {len(falhas)}")

    if not args.aplicar:
        print("\n(sem --aplicar — nada foi importado nem gravado)")
        return 0

    if not exportados:
        print("nada exportado, não há o que importar.")
        return 1

    print("\nimportando no destino...", flush=True)
    importados: list[str] = []
    for uid, nome, caminho in exportados:
        try:
            import_player_backup(caminho, "destino.sav")
            print(f"  ✅ {nome}", flush=True)
            importados.append(nome)
        except Exception as exc:  # noqa: BLE001
            print(f"  ❌ {nome}: {exc}", flush=True)

    print(f"\nimportados: {len(importados)} de {len(exportados)}")
    if not importados:
        print("nada importado — não vou gravar.")
        return 1

    novo = open("destino.sav", "rb").read()
    destino = SAVE.format(guid=args.destino_guid)

    seguranca = destino + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, seguranca, dst)
    conf = info_arquivo(cfg, seguranca)
    if not conf or conf[0] != len(dst):
        print("❌ backup de segurança incompleto — abortando sem gravar.")
        return 1
    print(f"  ✅ backup: {seguranca} ({conf[0]:,} bytes)")

    enviar(cfg, destino, novo)
    conf2 = info_arquivo(cfg, destino)
    if not conf2 or conf2[0] != len(novo):
        print(f"❌ gravação incompleta ({conf2[0] if conf2 else 0} de {len(novo)}).")
        return 1
    print(f"  ✅ gravado: {destino} ({conf2[0]:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
