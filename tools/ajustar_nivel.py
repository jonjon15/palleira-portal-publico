#!/usr/bin/env python3
"""
Ajusta o nível de um jogador no `Level.sav` — inclusive para BAIXO.

Existe porque `give_exp` só soma: não há comando, em lugar nenhum do Palworld
nem do PalDefender, que tire XP. Quando um `give_exp` erra a mão (foi o caso
de 18/09/2026: 100.000.000 de XP levaram o dono do lv 45 direto ao teto 80), a
única forma de voltar é reescrever `Level`, `Exp` e `UnusedStatusPoint` no
save.

Os três campos andam juntos e por isso são gravados juntos:

  1. `Exp` é CUMULATIVO desde o nível 1 (o total do lv 80 é 45.859.908 — o
     mesmo número que o save do dono mostrava, o que confirma que a tabela
     usada aqui é a que o servidor usa).
  2. `Level` precisa casar com esse `Exp`, senão o jogo recalcula no login e
     desfaz metade do ajuste.
  3. `UnusedStatusPoint` carrega 1 ponto por nível ganho. Descer de nível sem
     devolver os pontos deixaria o jogador com pontos que ele não deveria ter
     — a conta é `pontos - (nível_atual - nível_alvo)`, e nunca abaixo de 0.

⚠️  Só mexe em quem tem `IsPlayer=True`. Pal nenhum é tocado.

Mesmo padrão de segurança do `tools/reset_player.py`: três modos
(`--verificar`/`--simular`/`--aplicar`), recusa gravar se o painel não disser
`offline`, backup conferido por tamanho antes de sobrescrever, e upload com
nome temporário + rename atômico.

Uso:
    python tools/ajustar_nivel.py --servidor pvp-free \
        --uid AA7C26DC000000000000000000000000 --nivel 45 --simular
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from reset_player import (  # noqa: E402
    apagar, baixar, dig, enviar, info_arquivo, norm_uid, renomear, scalar,
    servidores,
)

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

NEEDED_SECTIONS = (".worldSaveData.CharacterSaveParameterMap",)

# XP cumulativo por nível (tabela do jogo 1.0, palpedia.net/exp-table).
#
# Só os níveis já conferidos, um a um, na mesma fonte — a ferramenta recusa
# qualquer nível fora desta lista em vez de interpolar. Errar o `Exp` por
# pouco coloca o jogador no nível errado, e interpolação entre níveis não
# funciona: a curva não é linear.
#
# O valor do 80 foi confirmado contra um save real (o `Exp` lido do dono após
# um `give_exp` estourado batia exatamente com 45.859.908), o que prova que
# esta é a mesma tabela que o servidor usa.
EXP_CUMULATIVO = {
    44: 1_281_269,
    45: 1_421_830,
    46: 1_577_090,
    59: 5_887_550,
    60: 6_498_533,
    61: 7_169_350,
    62: 7_905_913,
    63: 8_714_987,
    80: 45_859_908,
}


def exp_do_nivel(nivel: int) -> int:
    if nivel in EXP_CUMULATIVO:
        return EXP_CUMULATIVO[nivel]
    raise SystemExit(
        f"não tenho o XP cumulativo do nível {nivel}. Níveis conhecidos: "
        + ", ".join(str(n) for n in sorted(EXP_CUMULATIVO))
    )


def _abortar(motivo: str) -> int:
    print(f"\n  ❌ {motivo}")
    print("     Nada foi trocado — o save original segue no lugar.")
    return 1


def achar_jogador(world, uid: str):
    """Devolve (entrada, param) do personagem-jogador com esse UID."""
    for e in dig(world, "CharacterSaveParameterMap", "value", default=[]) or []:
        if norm_uid(scalar(dig(e, "key", "PlayerUId"), "")) != uid:
            continue
        param = dig(e, "value", "RawData", "value", "object", "SaveParameter",
                    "value", default=None)
        if not param:
            continue
        if not scalar(param.get("IsPlayer"), False):
            continue
        return e, param
    return None, None


def escrever(param: dict, campo: str, valor: int) -> None:
    """Grava mantendo o envelope de tipo que o GVAS usa.

    Os três campos não têm a mesma forma, e trocar o envelope por um int cru
    quebra a serialização (`TypeError: 'int' object is not subscriptable` ao
    reescrever). `Exp` (Int64Property) e `UnusedStatusPoint` (UInt16Property)
    guardam o número em `value`; `Level` é um ByteProperty e guarda em
    `value.value`, com um `value.type` ao lado que precisa sobreviver.
    """
    no = param.get(campo)
    if not isinstance(no, dict) or "value" not in no:
        raise SystemExit(f"campo {campo} não tem a forma esperada: {type(no).__name__}")

    interno = no["value"]
    if isinstance(interno, dict) and "value" in interno:
        interno["value"] = valor
    else:
        no["value"] = valor


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Ajusta Level/Exp/UnusedStatusPoint de um jogador")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uid", help="UID do jogador (hex, com ou sem hífen)")
    ap.add_argument("--nivel", type=int, help="nível de destino")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--verificar", action="store_true",
                      help="só prova que ler+reserializar não corrompe. Não escreve.")
    modo.add_argument("--simular", action="store_true",
                      help="faz o ajuste em memória e relata. Não escreve.")
    modo.add_argument("--aplicar", action="store_true",
                      help="grava de verdade. Servidor tem que estar PARADO.")
    args = ap.parse_args()

    if not args.verificar and (not args.uid or not args.nivel):
        sys.exit("--uid e --nivel são obrigatórios em --simular e --aplicar")

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items()
              if k.startswith(NEEDED_SECTIONS)}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    uid = norm_uid(args.uid) if args.uid else ""
    caminho = SAVE_PATH.format(guid=cfg.guid)
    alvo_exp = exp_do_nivel(args.nivel) if args.nivel else 0

    print(f"=== {cfg.slug} ===", flush=True)

    if args.aplicar:
        pid = PANEL_IDS.get(cfg.slug)
        if not pid:
            sys.exit(f"sem panelId para {cfg.slug} — não dá para conferir se está parado")
        try:
            atual = estado_do_painel(pid)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
        if atual != "offline":
            print(f"  ❌ O servidor está '{atual}', não 'offline'.")
            print("     Com o jogo rodando o personagem está em memória e o")
            print("     autosave seguinte reescreve por cima — o ajuste sumiria.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    t0 = time.time()
    original = baixar(cfg, caminho)
    print(f"  baixado:       {len(original):,} bytes em {time.time()-t0:.0f}s", flush=True)

    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    t0 = time.time()
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    print(f"  parse:         {time.time()-t0:.0f}s", flush=True)
    world = gvas.properties["worldSaveData"]["value"]

    if args.verificar:
        t0 = time.time()
        refeito = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
        print(f"  reserializado: {len(refeito):,} bytes em {time.time()-t0:.0f}s")
        if refeito == original:
            print("\n  ✅ IDÊNTICO byte a byte — o ciclo não corrompe o save.")
            return 0
        volta, _ = decompress_sav_to_gvas(refeito)
        print(f"\n  descomprimido original: {len(gvas_bytes):,}")
        print(f"  descomprimido refeito:  {len(volta):,}")
        if volta == gvas_bytes:
            print("  ✅ O GVAS descomprimido é IDÊNTICO. Só a compressão variou.")
            return 0
        print("  ❌ O GVAS mudou. NÃO usar --aplicar até entender o porquê.")
        return 1

    _, param = achar_jogador(world, uid)
    if param is None:
        print(f"\n  ⚠️  Nenhum jogador (IsPlayer=True) com o UID {uid} no mundo.")
        return 1

    nome = scalar(param.get("NickName"), "?")
    lvl_antes = int(scalar(param.get("Level"), 1) or 1)
    exp_antes = int(scalar(param.get("Exp"), 0) or 0)
    pts_antes = int(scalar(param.get("UnusedStatusPoint"), 0) or 0)

    if args.nivel > lvl_antes:
        print(f"\n  ⚠️  {nome} está no {lvl_antes} e o alvo é {args.nivel} (subir).")
        print("     Esta ferramenta existe para DESCER — para subir, use give_exp.")
        return 1

    pts_depois = max(0, pts_antes - (lvl_antes - args.nivel))

    print()
    print(f"  jogador: {nome} ({uid})")
    print(f"    Level              {lvl_antes:>12,}  ->  {args.nivel:>12,}")
    print(f"    Exp                {exp_antes:>12,}  ->  {alvo_exp:>12,}")
    print(f"    UnusedStatusPoint  {pts_antes:>12,}  ->  {pts_depois:>12,}")

    escrever(param, "Level", args.nivel)
    escrever(param, "Exp", alvo_exp)
    escrever(param, "UnusedStatusPoint", pts_depois)

    if args.simular:
        print("\n  (simulação — nada foi gravado)")
        return 0

    info = info_arquivo(cfg, caminho)
    if info:
        idade = time.time() - info[1]
        if idade > 900:
            print(f"\n  ⚠️  o Level.sav tem {idade/60:.0f} minutos — o desligamento")
            print("     pode não ter salvado. Seguindo, mas confira depois.")
        else:
            print(f"\n  ✅ mundo salvo há {idade/60:.0f} min pelo desligamento", flush=True)

    t0 = time.time()
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    print(f"  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s", flush=True)

    backup = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, backup, original)
    conf = info_arquivo(cfg, backup)
    if not conf or conf[0] != len(original):
        return _abortar(
            f"backup incompleto ({conf[0] if conf else 0} de {len(original)} bytes).")
    print(f"  ✅ backup conferido: {backup} ({conf[0]:,} bytes)", flush=True)

    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(novo):
        apagar(cfg, temporario)
        return _abortar(
            f"upload incompleto ({conf_novo[0] if conf_novo else 0} de {len(novo)} bytes).")

    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes, por rename)", flush=True)
    print("\n  ✅ Feito. Suba o servidor e confira o nível no jogo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
