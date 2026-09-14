#!/usr/bin/env python3
"""
Reseta só o Level de um jogador dentro do Level.sav, sem tocar em nada mais
— Pals, itens, posição, guild ficam como estavam.

Mesma família do `reset_player.py` (que apaga o jogador inteiro): aqui é
cirúrgico, mexe só no campo `Level` da entrada dele em
`CharacterSaveParameterMap`. O `Exp` acumulado não é tocado — por pedido
explícito —, o que significa que o jogo pode recalcular o Level a partir do
Exp assim que a pessoa ganhar experiência de novo. Se isso acontecer na
prática, `Exp` também precisa zerar.

Roda no GitHub Actions, não na Vercel, pelo mesmo motivo do reset_player.py:
o mundo descomprimido não cabe numa função serverless.

    --verificar   lê, reserializa e compara byte a byte. Não escreve nada.
    --simular     faz a troca em memória e diz o que mudaria. Não escreve.
    --aplicar     grava de verdade. Exige backup feito e servidor parado.

Uso:
    python tools/reset_level.py --servidor pve-free --uid F721F85B0000... \
        --level 1 --simular
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time

import paramiko

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"

NEEDED_SECTIONS = (
    ".worldSaveData.GroupSaveDataMap",
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
)


# ------------------------------------------------------------------- helpers

def scalar(node, default=None):
    """Desce pelos `{'value': ...}` até chegar num valor simples. Ver a
    mesma função em reset_player.py — o GVAS aninha em profundidade
    variável e desembrulhar um nível só quebra em TypeError."""
    for _ in range(6):
        if isinstance(node, dict) and "value" in node:
            node = node["value"]
        else:
            break
    if isinstance(node, dict):
        return default
    return default if node is None else node


def norm_uid(valor) -> str:
    return str(valor or "").replace("-", "").upper()


from restaurar_base import Servidor, servidores  # noqa: E402,F401


def _sftp(cfg: Servidor):
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
    t, sftp = _sftp(cfg)
    try:
        st = sftp.stat(caminho)
        return st.st_size, st.st_mtime
    except FileNotFoundError:
        return None
    finally:
        t.close()


def renomear(cfg: Servidor, de: str, para: str) -> None:
    t, sftp = _sftp(cfg)
    try:
        try:
            sftp.posix_rename(de, para)
        except (AttributeError, OSError):
            try:
                sftp.remove(para)
            except FileNotFoundError:
                pass
            sftp.rename(de, para)
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

def resetar_levels(world, uids: list[str], novo_level: int) -> dict:
    """Troca o Level de várias entradas de jogador numa passada só pela
    CharacterSaveParameterMap. Devolve um relatório por UID — quem chama
    decide se grava."""
    faltam = set(uids)
    porUid = {u: {"achado": False, "nome": "", "level_antigo": 0, "level_novo": novo_level}
              for u in uids}

    entradas = world.get("CharacterSaveParameterMap", {}).get("value", []) or []
    for entrada in entradas:
        if not faltam:
            break
        param = (
            entrada.get("value", {})
            .get("RawData", {})
            .get("value", {})
            .get("object", {})
            .get("SaveParameter", {})
            .get("value")
        )
        if not isinstance(param, dict):
            continue

        eh_jogador = bool(scalar(param.get("IsPlayer"), False))
        chave = norm_uid(scalar(entrada.get("key", {}).get("PlayerUId"), ""))

        if eh_jogador and chave in faltam:
            rel = porUid[chave]
            rel["achado"] = True
            rel["nome"] = str(scalar(param.get("NickName"), "") or "")
            nivel_no = param.get("Level")
            rel["level_antigo"] = int(scalar(nivel_no, 1) or 1)

            # `Level` vem como ByteProperty, não IntProperty: o formato do
            # `_read_ByteProperty` do palsav é
            #   {"id": ..., "value": {"type": "None", "value": N}}
            # — DOIS níveis de "value". Sobrescrever só o primeiro nível
            # (como a primeira versão deste script fazia) troca o dict
            # {"type": "None", "value": N} inteiro pelo inteiro puro, e o
            # `_write_ByteProperty` quebra em `property['value']['type']`
            # porque 'value' virou um int (TypeError: 'int' object is not
            # subscriptable — foi o que aconteceu na primeira tentativa
            # real, sem corromper nada porque o erro é antes de qualquer
            # upload). Por isso desce mais um nível aqui.
            interno = nivel_no.get("value") if isinstance(nivel_no, dict) else None
            if not isinstance(interno, dict) or "value" not in interno or interno.get("type") != "None":
                rel["erro"] = (
                    f"campo Level em formato inesperado ({nivel_no!r}); "
                    "abortando para não inventar estrutura"
                )
            else:
                interno["value"] = novo_level
            faltam.discard(chave)

    return porUid


def _abortar(motivo: str) -> int:
    print(f"\n  ❌ ABORTADO: {motivo}")
    print("     Nada foi sobrescrito. O mundo continua como estava.")
    return 1


# ---------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Reseta o Level de um jogador no Level.sav")
    ap.add_argument("--servidor", required=True, help="slug: pve-free, pve-vip, pvp-free")
    ap.add_argument("--uid", help="UID(s) do jogador (32 hex), separados por vírgula. Dispensável em --verificar")
    ap.add_argument("--level", type=int, default=1, help="novo Level (padrão: 1)")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--verificar", action="store_true",
                      help="só prova que ler+reserializar não corrompe. Não escreve.")
    modo.add_argument("--simular", action="store_true",
                      help="faz a troca em memória e relata. Não escreve.")
    modo.add_argument("--aplicar", action="store_true",
                      help="grava de verdade. Servidor tem que estar PARADO.")
    modo.add_argument("--sondar", action="store_true",
                      help="lista as chaves do SaveParameter de um UID. Não escreve.")
    args = ap.parse_args()

    if not args.verificar and not args.uid:
        sys.exit("--uid é obrigatório em --simular, --aplicar e --sondar")
    if args.level < 1:
        sys.exit("--level tem que ser 1 ou mais")

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items()
              if k in NEEDED_SECTIONS}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    uids = [norm_uid(u) for u in args.uid.split(",") if u.strip()] if args.uid else []
    caminho = SAVE_PATH.format(guid=cfg.guid)

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
            print("     Gravar com o jogo rodando corrompe o mundo de todos: o")
            print("     servidor tem tudo em memória e reescreve por cima no")
            print("     autosave seguinte. Pare pelo painel e rode de novo.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

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

    # ---- modo sondar: só olhar, sem tocar em nada -------------------------
    if args.sondar:
        entradas = world.get("CharacterSaveParameterMap", {}).get("value", []) or []
        for entrada in entradas:
            param = (
                entrada.get("value", {})
                .get("RawData", {})
                .get("value", {})
                .get("object", {})
                .get("SaveParameter", {})
                .get("value")
            )
            if not isinstance(param, dict):
                continue
            eh_jogador = bool(scalar(param.get("IsPlayer"), False))
            chave = norm_uid(scalar(entrada.get("key", {}).get("PlayerUId"), ""))
            if eh_jogador and chave in uids:
                print(f"\n  {scalar(param.get('NickName'), '')!r} ({chave})")
                print("  chaves:", sorted(param.keys()))
                for campo in ("Exp", "EXP", "Experience", "Level"):
                    if campo in param:
                        print(f"  {campo!r} = {param[campo]!r}")
        return 0

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
        volta, _ = decompress_sav_to_gvas(refeito)
        print(f"     descomprimido original: {len(gvas_bytes):,}")
        print(f"     descomprimido refeito:  {len(volta):,}")
        if volta == gvas_bytes:
            print("  ✅ O GVAS descomprimido é IDÊNTICO. Só a compressão variou.")
            return 0
        print("  ❌ O GVAS mudou. NÃO usar --aplicar até entender o porquê.")
        return 1

    # ---- resetar ----------------------------------------------------------
    porUid = resetar_levels(world, uids, args.level)
    print()
    algum_ok = False
    for u, rel in porUid.items():
        if not rel["achado"]:
            print(f"  ⚠️  {u}: nenhum personagem com esse UID no mundo.")
            continue
        if rel.get("erro"):
            print(f"  ❌ {u}: {rel['erro']}")
            continue
        print(f"  jogador:  {rel['nome'] or '(sem nome no mundo)'} ({u})")
        print(f"  level:    {rel['level_antigo']} -> {rel['level_novo']}")
        algum_ok = True

    if not algum_ok:
        print()
        print("  Nenhum UID pôde ser resetado — nada a fazer.")
        return 1

    print("  ⚠️  Exp acumulado NÃO foi tocado — o jogo pode recalcular o Level")
    print("     a partir dele assim que a pessoa ganhar experiência de novo.")

    if args.simular:
        # Reserializa em memória (sem enviar nada) para provar que a edição
        # não quebra o gvas.write(). Foi a lacuna que deixou passar o bug
        # do ByteProperty na primeira vez: --simular só mexia em memória e
        # nunca chamava write(), então só --aplicar teria pego o erro — e
        # aplicar é o modo que já parou o servidor.
        print()
        t0 = time.time()
        try:
            compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
        except Exception as err:  # noqa: BLE001
            print(f"  ❌ reserializar quebrou: {err!r}")
            print("     a edição deixou alguma estrutura inválida — não aplicar.")
            return 1
        print(f"  ✅ reserializado sem erro em {time.time()-t0:.0f}s "
              "(prova que o write não quebra)", flush=True)
        print("  (simulação — nada foi gravado)")
        return 0

    info = info_arquivo(cfg, caminho)
    if info:
        idade = time.time() - info[1]
        if idade > 900:
            print(f"  ⚠️  o Level.sav tem {idade/60:.0f} minutos — o desligamento")
            print("     pode não ter salvado. Seguindo, mas confira depois.")
        else:
            print(f"  ✅ mundo salvo há {idade/60:.0f} min pelo desligamento", flush=True)

    t0 = time.time()
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    print(f"\n  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s", flush=True)

    backup = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, backup, original)

    conf = info_arquivo(cfg, backup)
    if not conf or conf[0] != len(original):
        return _abortar(
            f"backup incompleto ({conf[0] if conf else 0} de {len(original)} bytes)."
        )
    print(f"  ✅ backup conferido: {backup} ({conf[0]:,} bytes)", flush=True)

    temporario = caminho + ".novo"
    enviar(cfg, temporario, novo)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(novo):
        apagar(cfg, temporario)
        return _abortar(
            f"upload incompleto ({conf_novo[0] if conf_novo else 0} de {len(novo)} bytes)."
        )

    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(novo):,} bytes, por rename)", flush=True)

    print("\n  ✅ Feito. Suba o servidor e peça para o jogador entrar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
