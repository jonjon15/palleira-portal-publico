#!/usr/bin/env python3
"""
Apaga um jogador de dentro do mundo (§3.8 do PROMPT.md).

Existe porque **não há outro jeito**: a REST do Palworld não tem reset, o
PalDefender também não (14 comandos sondados, todos `Unknown command`), e
apagar `Players/{UID}.sav` não adianta — o personagem mora no `Level.sav` e
o servidor regrava o arquivo individual a partir dele no primeiro autosave.

Roda no GitHub Actions, não na Vercel: o mundo tem 339 MB descomprimidos e
não cabe em função serverless.

⚠️ ISTO REESCREVE O MUNDO DE TODOS OS JOGADORES. Um erro aqui apaga o
progresso da comunidade inteira. Por isso existem três modos, e o padrão é
o mais seguro:

    --verificar   lê, reserializa e compara byte a byte. Não escreve nada.
                  É o teste que prova que o ciclo não corrompe o save.
    --simular     faz a remoção em memória e diz o que mudaria. Não escreve.
    --aplicar     grava de verdade. Exige backup feito e servidor parado.

Uso:
    python tools/reset_player.py --servidor pve-free --uid F721F85B0000... --verificar
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time

import paramiko

# Reaproveita o cliente do painel: é ele que sabe se o servidor está parado.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
PLAYER_PATH = "Pal/Saved/SaveGames/0/{guid}/Players/{uid}.sav"

# Só estas duas seções são decodificadas. Decodificar o save inteiro estoura
# 20 minutos no runner (medido). O resto do mundo continua como bytes crus e
# volta intacto na hora de escrever — o que é bom: o que não é tocado não
# pode ser corrompido.
NEEDED_SECTIONS = (
    ".worldSaveData.GroupSaveDataMap",
    # ⚠️ A chave é o RawData do valor. Apontar para `.CharacterSaveParameterMap`
    # não casa com nada e os dados voltam vazios.
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
)


# ------------------------------------------------------------------- helpers

def dig(obj, *caminho, default=None):
    """Navega dicionários aninhados sem explodir no meio."""
    cur = obj
    for chave in caminho:
        if not isinstance(cur, dict) or chave not in cur:
            return default
        cur = cur[chave]
    return cur


def scalar(node, default=None):
    """
    Desce pelos `{'value': ...}` até chegar num valor simples.

    O GVAS aninha em profundidade variável — `Level` às vezes é
    `{'value': 30}`, às vezes `{'value': {'value': 30}}`. Desembrulhar um
    nível só quebra com `TypeError: int() argument ... not 'dict'`, que foi
    exatamente o que aconteceu na primeira tentativa. Mesma solução do
    `import_save.py`.
    """
    for _ in range(6):
        if isinstance(node, dict) and "value" in node:
            node = node["value"]
        else:
            break
    if isinstance(node, dict):
        return default
    return default if node is None else node


def norm_uid(valor) -> str:
    """UID sem hífen, maiúsculo — o formato do nome do arquivo .sav."""
    return str(valor or "").replace("-", "").upper()


class Servidor:
    def __init__(self, slug, host, user, password, guid):
        self.slug, self.host = slug, host
        self.user, self.password, self.guid = user, password, guid


def servidores() -> dict[str, Servidor]:
    bruto = os.environ.get("PALLEIRA_SERVERS", "").strip()
    if not bruto:
        sys.exit("PALLEIRA_SERVERS ausente (JSON com a lista de servidores)")
    return {s["slug"]: Servidor(**s) for s in json.loads(bruto)}


def _sftp(cfg: Servidor):
    """SFTP na 2022. Não usar a API HTTP do painel: o Cloudflare barra
    User-Agent de biblioteca com 403 (erro 1010)."""
    t = paramiko.Transport((cfg.host, 2022))
    t.connect(username=cfg.user, password=cfg.password)
    return t, paramiko.SFTPClient.from_transport(t)


def baixar(cfg: Servidor, caminho: str) -> bytes:
    t, sftp = _sftp(cfg)
    try:
        buf = io.BytesIO()
        sftp.getfo(caminho, buf)
        return buf.getvalue()
    finally:
        t.close()


def enviar(cfg: Servidor, caminho: str, dados: bytes) -> None:
    t, sftp = _sftp(cfg)
    try:
        sftp.putfo(io.BytesIO(dados), caminho)
    finally:
        t.close()


def info_arquivo(cfg: Servidor, caminho: str):
    """Tamanho e data do arquivo, ou None se não existir."""
    t, sftp = _sftp(cfg)
    try:
        st = sftp.stat(caminho)
        return st.st_size, st.st_mtime
    except FileNotFoundError:
        return None
    finally:
        t.close()


def apagar(cfg: Servidor, caminho: str) -> bool:
    t, sftp = _sftp(cfg)
    try:
        sftp.remove(caminho)
        return True
    except FileNotFoundError:
        return False
    finally:
        t.close()


# -------------------------------------------------------------------- edição

def remover_jogador(world, uid: str) -> dict:
    """
    Tira o personagem e os Pals dele do mundo, e o desliga da guild.

    Devolve um relatório do que foi mexido — quem chama decide se grava.
    """
    rel = {"personagem": 0, "pals": 0, "guild": None, "guild_apagada": False,
           "nome": "", "level": 0}

    # ---- CharacterSaveParameterMap: o personagem e os Pals dele -----------
    entradas = dig(world, "CharacterSaveParameterMap", "value", default=[]) or []
    manter = []
    for entrada in entradas:
        param = dig(entrada, "value", "RawData", "value", "object",
                    "SaveParameter", "value")
        if not isinstance(param, dict):
            manter.append(entrada)
            continue

        eh_jogador = bool(scalar(param.get("IsPlayer"), False))
        dono = norm_uid(scalar(param.get("OwnerPlayerUId"), ""))
        chave = norm_uid(scalar(dig(entrada, "key", "PlayerUId"), ""))

        if eh_jogador and chave == uid:
            rel["personagem"] += 1
            rel["nome"] = str(scalar(param.get("NickName"), "") or "")
            rel["level"] = int(scalar(param.get("Level"), 1) or 1)
            continue  # some

        # Pal cujo dono é ele: sem o dono vira lixo no mundo.
        if not eh_jogador and dono and dono == uid:
            rel["pals"] += 1
            continue  # some

        manter.append(entrada)

    world["CharacterSaveParameterMap"]["value"] = manter

    # ---- GroupSaveDataMap: tirar da guild --------------------------------
    grupos = dig(world, "GroupSaveDataMap", "value", default=[]) or []
    guildas_restantes = []
    for grupo in grupos:
        raw = dig(grupo, "value", "RawData", "value", default={}) or {}
        if raw.get("group_type") != "EPalGroupType::Guild":
            guildas_restantes.append(grupo)
            continue

        membros = raw.get("players") or []
        sobraram = [m for m in membros
                    if norm_uid(m.get("player_uid", "")) != uid]

        if len(sobraram) != len(membros):
            rel["guild"] = norm_uid(raw.get("group_id", ""))
            # Guild que ficou sem ninguém não deve continuar existindo.
            if not sobraram:
                rel["guild_apagada"] = True
                continue
            raw["players"] = sobraram

        guildas_restantes.append(grupo)

    world["GroupSaveDataMap"]["value"] = guildas_restantes
    return rel


def _abortar(motivo: str) -> int:
    print(f"\n  ❌ ABORTADO: {motivo}")
    print("     Nada foi sobrescrito. O mundo continua como estava.")
    return 1


# ---------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Apaga um jogador do Level.sav")
    ap.add_argument("--servidor", required=True, help="slug: pve-free, pve-vip, pvp-free")
    ap.add_argument("--uid", help="UID do jogador (32 hex). Dispensável em --verificar")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--verificar", action="store_true",
                      help="só prova que ler+reserializar não corrompe. Não escreve.")
    modo.add_argument("--simular", action="store_true",
                      help="faz a remoção em memória e relata. Não escreve.")
    modo.add_argument("--aplicar", action="store_true",
                      help="grava de verdade. Servidor tem que estar PARADO.")
    args = ap.parse_args()

    if not args.verificar and not args.uid:
        sys.exit("--uid é obrigatório em --simular e --aplicar")

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items()
              if k in NEEDED_SECTIONS}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    uid = norm_uid(args.uid) if args.uid else ""
    caminho = SAVE_PATH.format(guid=cfg.guid)

    print(f"=== {cfg.slug} ===", flush=True)
    t0 = time.time()
    original = baixar(cfg, caminho)
    print(f"  baixado:       {len(original):,} bytes em {time.time()-t0:.0f}s", flush=True)

    t0 = time.time()
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    print(f"  descomprimido: {len(gvas_bytes):,} bytes em {time.time()-t0:.0f}s "
          f"(tipo 0x{tipo:02x})", flush=True)

    t0 = time.time()
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    print(f"  parse:         {time.time()-t0:.0f}s "
          f"({len(custom)} de {len(PALWORLD_CUSTOM_PROPERTIES)} seções)", flush=True)
    world = gvas.properties["worldSaveData"]["value"]

    # ---- modo verificar: o ciclo é fiel? ---------------------------------
    if args.verificar:
        t0 = time.time()
        refeito = compress_gvas_to_sav(
            gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
        print(f"  reserializado: {len(refeito):,} bytes em {time.time()-t0:.0f}s",
              flush=True)
        igual = refeito == original
        print()
        if igual:
            print("  ✅ IDÊNTICO byte a byte — o ciclo não corrompe o save.")
            return 0
        print(f"  ⚠️  DIFERENTE: {len(original):,} -> {len(refeito):,} bytes")
        print("     Diferença de bytes não significa save quebrado (a compressão")
        print("     não é determinística), mas exige conferir descomprimido.")
        volta, _ = decompress_sav_to_gvas(refeito)
        print(f"     descomprimido original: {len(gvas_bytes):,}")
        print(f"     descomprimido refeito:  {len(volta):,}")
        if volta == gvas_bytes:
            print("  ✅ O GVAS descomprimido é IDÊNTICO. Só a compressão variou.")
            return 0
        print("  ❌ O GVAS mudou. NÃO usar --aplicar até entender o porquê.")
        return 1

    # ---- remover ---------------------------------------------------------
    rel = remover_jogador(world, uid)
    print()
    print(f"  jogador:  {rel['nome'] or '(sem nome no mundo)'} | level {rel['level']}")
    print(f"  removido: {rel['personagem']} personagem, {rel['pals']} pals")
    print(f"  guild:    {rel['guild'] or 'nenhuma'}"
          + (" (ficou vazia e foi apagada)" if rel["guild_apagada"] else ""))

    if rel["personagem"] == 0:
        print()
        print("  ⚠️  Nenhum personagem com esse UID no mundo. Nada a fazer —")
        print("     confira o UID antes de seguir.")
        return 1

    if args.simular:
        print()
        print("  (simulação — nada foi gravado)")
        return 0

    # ---- travas antes de gravar -----------------------------------------
    #
    # Gravar o mundo com o jogo rodando corrompe o save: o servidor tem tudo
    # em memória e reescreve por cima no autosave seguinte. O workflow já
    # para o servidor antes, mas quem roda este script na mão pode esquecer —
    # e a consequência atinge a comunidade inteira. A trava fica aqui.
    pid = PANEL_IDS.get(cfg.slug)
    if not pid:
        sys.exit(f"sem panelId para {cfg.slug} — não dá para conferir se está parado")

    try:
        atual = estado_do_painel(pid)
    except Exception as err:  # noqa: BLE001
        sys.exit(f"não consegui perguntar ao painel se o servidor está parado: {err}")

    if atual != "offline":
        print()
        print(f"  ❌ O servidor está '{atual}', não 'offline'.")
        print("     Gravar agora corromperia o mundo de todos. Pare o servidor")
        print("     pelo painel (sinal 'stop') e rode de novo.")
        return 1
    print(f"\n  ✅ servidor confirmado 'offline'", flush=True)

    # O `stop` do painel manda o jogo desligar com calma, e desligar limpo
    # salva. Conferir a data do arquivo prova que isso aconteceu — se o save
    # for velho, alguma coisa deu errado e o jogador perderia progresso.
    info = info_arquivo(cfg, caminho)
    if info:
        idade = time.time() - info[1]
        if idade > 900:
            print(f"  ⚠️  o Level.sav tem {idade/60:.0f} minutos — o desligamento")
            print("     pode não ter salvado. Seguindo, mas confira depois.")
        else:
            print(f"  ✅ mundo salvo há {idade/60:.0f} min pelo desligamento", flush=True)

    # ---- aplicar ---------------------------------------------------------
    t0 = time.time()
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    print(f"\n  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s", flush=True)

    # Backup ao lado do original, no próprio servidor. Barato e é o que
    # salva a pele se o mundo voltar quebrado.
    backup = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, backup, original)

    # Backup que não foi conferido não é backup. Se o upload saiu pela
    # metade, sobrescrever o mundo agora seria trabalhar sem rede.
    conf = info_arquivo(cfg, backup)
    if not conf or conf[0] != len(original):
        return _abortar(
            f"backup incompleto ({conf[0] if conf else 0} de {len(original)} bytes)."
        )
    print(f"  ✅ backup conferido: {backup} ({conf[0]:,} bytes)", flush=True)

    enviar(cfg, caminho, novo)
    print("  Level.sav gravado", flush=True)

    individual = PLAYER_PATH.format(guid=cfg.guid, uid=uid)
    print(f"  Players/{uid}.sav: "
          + ("apagado" if apagar(cfg, individual) else "não existia"), flush=True)

    print("\n  ✅ Feito. Suba o servidor e peça para o jogador entrar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
