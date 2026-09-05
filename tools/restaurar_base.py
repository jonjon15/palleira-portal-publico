#!/usr/bin/env python3
"""
Restaura a(s) base(s) de um ou mais jogadores, perdida(s) por decay, copiando
de um backup antigo onde a base ainda existia (§ restauração de base).

Existe porque o decay do próprio Palworld apaga a base do `Level.sav` atual
sem deixar rastro — não tem "desfazer" no jogo. A única forma de trazer de
volta é ter uma cópia de antes (`Level.sav.bak-AAAAMMDD-HHMMSS`, gerada como
efeito colateral de operações anteriores) e transplantar de lá pro save de
hoje as três peças que, juntas, formam uma base:

  1. A entrada em `BaseCampSaveData` (posição, estado, dono) — achada pela
     mesma chave (UUID da base) no backup e injetada no save atual.
  2. Toda entrada em `MapObjectSaveData` (pal box, parede, baú, cama, fábrica
     — cada peça construída é uma entrada própria) cujo
     `Model.RawData.base_camp_id_belong_to` bate com o UUID da base — achado
     confirmado por `tools/sondar_bases.py` (não documentado em lugar
     nenhum, teve que ser sondado).
  3. Os campos `base_ids` e `map_object_instance_ids_base_camp_points` da
     guild em `GroupSaveDataMap`, atualizados no save atual para religar a
     guild à base restaurada.

Mesmo padrão de segurança do `tools/reset_player.py`: três modos
(`--verificar`/`--simular`/`--aplicar`), backup do original conferido por
tamanho antes de qualquer sobrescrita, upload com nome temporário + rename
atômico, e recusa a gravar se o servidor não estiver `offline`.

Uso:
    python tools/restaurar_base.py --servidor pve-free \
        --uids 21F2BD36...,502FCA99... \
        --arquivo-backup Level.sav.bak-20260822-154657 \
        --simular
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

SAVE_PATH = "Pal/Saved/SaveGames/0/{guid}/Level.sav"
BACKUP_PATH = "Pal/Saved/SaveGames/0/{guid}/{arquivo}"
PLAYER_PATH = "Pal/Saved/SaveGames/0/{guid}/Players/{uid}.sav"

# As três seções que a restauração precisa — decodificar o resto do mundo
# (300+ MB) estoura o runner à toa. O que não é tocado não pode ser
# corrompido.
NEEDED_SECTIONS = (
    ".worldSaveData.GroupSaveDataMap",
    ".worldSaveData.BaseCampSaveData.Value.RawData",
    ".worldSaveData.MapObjectSaveData",
    # Cada base referencia uma lista de "trabalhos" (reparo, produção, etc.)
    # pelo `WorkCollection.RawData.value.work_ids` — se essas entradas não
    # existem em WorkSaveData, é bem provável que o jogo trate a base como
    # inconsistente e a descarte no autosave seguinte (achado real, via
    # código-fonte do Save Pal — não documentado em lugar nenhum).
    ".worldSaveData.WorkSaveData",
    # Precisa para renovar o `LastOnlineRealTime` do próprio personagem — o
    # Save Pal atualiza o contador nos dois lugares (guild e SaveParameter),
    # ver `sync_timestamps` em transfer.rs.
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
)


# ------------------------------------------------------------------- helpers

def dig(obj, *caminho, default=None):
    cur = obj
    for chave in caminho:
        if not isinstance(cur, dict) or chave not in cur:
            return default
        cur = cur[chave]
    return cur


def scalar(node, default=None):
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


ZERO_UID = "0" * 32

TICKS_POR_DIA = 24 * 60 * 60 * 10_000_000  # ticks de 100ns num dia


def agora_na_escala_do_save(world) -> int | None:
    """O "agora" de `last_online_real_time`.

    É `GameTimeSaveData.RealDateTimeTicks` — o relógio de tempo real do mundo,
    campo irmão do `GameDateTimeTicks` que o `reset_dias.py` mexe. Fonte: o
    Save Pal usa exatamente esse campo em `sync_timestamps` (transfer.rs).
    Não é FDateTime: conta desde o início do mundo, não desde o ano 1.

    Se o relógio não existir ou estiver zerado, cai para o maior
    `last_online_real_time` do save (o jogador que entrou mais recentemente
    entre as centenas do servidor), que é a mesma escala.
    """
    relogio = dig(world, "GameTimeSaveData", "value", "RealDateTimeTicks", "value", default=None)
    if isinstance(relogio, int) and relogio != 0:
        return relogio

    maior = None
    for entry in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        raw = dig(entry, "value", "RawData", "value", default=None)
        if not isinstance(raw, dict):
            continue
        for membro in raw.get("players") or []:
            valor = dig(membro, "player_info", "last_online_real_time", default=None)
            if isinstance(valor, int) and (maior is None or valor > maior):
                maior = valor
    return maior


def ticks_para_dias(ticks) -> str:
    try:
        return f"{int(ticks) / TICKS_POR_DIA:.1f}d"
    except (TypeError, ValueError):
        return str(ticks)


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


# --------------------------------------------------------------- navegação

def guildas_por_id(world) -> dict[str, dict]:
    """group_id (norm_uid) -> {"entry": <entrada bruta da lista>, "raw": <dict RawData.value>}."""
    out = {}
    for entry in dig(world, "GroupSaveDataMap", "value", default=[]) or []:
        raw = dig(entry, "value", "RawData", "value", default=None)
        if not isinstance(raw, dict) or raw.get("group_type") != "EPalGroupType::Guild":
            continue
        gid = norm_uid(dig(entry, "key", default="") or raw.get("group_id", ""))
        out[gid] = {"entry": entry, "raw": raw}
    return out


def guild_do_jogador(world, uid: str) -> dict | None:
    for gid, info in guildas_por_id(world).items():
        membros = info["raw"].get("players") or []
        if any(norm_uid(m.get("player_uid", "")) == uid for m in membros):
            return info
    return None


def base_camp_entries(world) -> list:
    return dig(world, "BaseCampSaveData", "value", default=[]) or []


def base_camp_por_id(world) -> dict[str, dict]:
    """UUID da base (norm_uid) -> entrada bruta {key, value} de BaseCampSaveData."""
    out = {}
    for entry in base_camp_entries(world):
        chave = norm_uid(dig(entry, "key", default=""))
        if chave:
            out[chave] = entry
    return out


def entries_of(prop) -> list | None:
    """Desembrulha um valor de propriedade GVAS até achar a lista de entradas
    de verdade. `BaseCampSaveData` guarda a lista direto em `.value`, mas
    `MapObjectSaveData` tem mais um nível por baixo (achado real, não
    documentado — confirmado por `tools/sondar_bases.py`). Sem esse
    desembrulho extra, `entry_of` para em um dict e a lista nunca aparece."""
    node = prop
    for _ in range(4):
        if isinstance(node, list):
            return node
        if isinstance(node, dict):
            if "values" in node and isinstance(node["values"], list):
                return node["values"]
            if "value" in node:
                node = node["value"]
                continue
        break
    return None


def map_object_entries(world) -> list:
    return entries_of(dig(world, "MapObjectSaveData", default=None)) or []


def map_object_list_ref(world) -> list:
    """Referência MUTÁVEL de verdade pra lista de MapObjectSaveData dentro de
    `world` — pra usar com `.append()` e o resultado aparecer no save
    reserializado. Levanta erro em vez de adivinhar uma forma nova se a
    seção não existir do jeito esperado (silenciosamente perder as
    construções copiadas seria pior que travar aqui)."""
    prop = world.get("MapObjectSaveData")
    if not isinstance(prop, dict):
        prop = {"id": None, "type": "MapProperty", "value": {"value": []}}
        world["MapObjectSaveData"] = prop
    inner = prop.get("value")
    if isinstance(inner, list):
        return inner  # forma simples, sem o nível extra — aceitar também
    if not isinstance(inner, dict):
        inner = {}
        prop["value"] = inner
    if not isinstance(inner.get("value"), list):
        inner["value"] = []
    return inner["value"]


def map_objects_da_base(world, base_id_norm: str) -> list:
    """Entradas de MapObjectSaveData cujo base_camp_id_belong_to bate com a base pedida."""
    out = []
    for entry in map_object_entries(world):
        dono = dig(entry, "Model", "value", "RawData", "value", "base_camp_id_belong_to", default=None)
        if dono and norm_uid(dono) == base_id_norm:
            out.append(entry)
    return out


def instance_ids_presentes(world) -> set[str]:
    """instance_id de cada objeto já presente em MapObjectSaveData — evita duplicar
    se o script rodar duas vezes sobre o mesmo save."""
    presentes = set()
    for entry in map_object_entries(world):
        iid = dig(entry, "Model", "value", "RawData", "value", "instance_id", default=None)
        if iid:
            presentes.add(norm_uid(iid))
    return presentes


def work_entries(world) -> list:
    return entries_of(dig(world, "WorkSaveData", default=None)) or []


def work_ids_da_base(entry_camp: dict) -> list:
    """work_ids que o WorkCollection dessa base referencia — achado no código-fonte
    do Save Pal: se essas entradas não existirem em WorkSaveData, o jogo trata a
    base como inconsistente e a descarta no autosave seguinte."""
    return dig(entry_camp, "value", "WorkCollection", "value", "RawData", "value", "work_ids", default=[]) or []


def work_por_id(world) -> dict[str, dict]:
    out = {}
    for entry in work_entries(world):
        wid = dig(entry, "RawData", "value", "id", default=None)
        if wid:
            out[norm_uid(wid)] = entry
    return out


def work_list_ref(world) -> list:
    """Referência MUTÁVEL da lista de WorkSaveData — mesmo cuidado do
    map_object_list_ref, essa seção tem a forma de ArrayProperty simples
    (sem o nível de aninhamento extra do MapObjectSaveData, a julgar pelo
    path registrado sem `.Value`), mas usa o mesmo desembrulho genérico por
    segurança em vez de assumir."""
    prop = world.get("WorkSaveData")
    if not isinstance(prop, dict):
        prop = {"id": None, "type": "ArrayProperty", "value": []}
        world["WorkSaveData"] = prop
    inner = prop.get("value")
    if isinstance(inner, list):
        return inner
    if not isinstance(inner, dict):
        inner = {}
        prop["value"] = inner
    if not isinstance(inner.get("value"), list):
        inner["value"] = []
    return inner["value"]


# -------------------------------------------------------------------- edição

def restaurar_jogador(atual: dict, backup: dict, uid: str) -> dict:
    """
    Restaura, no `atual` (em memória), toda base que o jogador `uid` tinha no
    `backup` e não tem mais hoje. Devolve um relatório do que foi mexido.
    """
    rel = {"uid": uid, "guild": None, "guild_nome": "",
           "bases_restauradas": [], "objetos_restaurados": 0,
           "erro": None}

    guild_atual = guild_do_jogador(atual, uid)
    if not guild_atual:
        rel["erro"] = "jogador não está em nenhuma guild no save atual"
        return rel

    gid = norm_uid(dig(guild_atual["entry"], "key", default=""))
    rel["guild"] = gid
    rel["guild_nome"] = (guild_atual["raw"].get("guild_name") or "").strip() or "Guild sem nome"

    guildas_backup = guildas_por_id(backup)
    guild_backup = guildas_backup.get(gid)
    if not guild_backup:
        rel["erro"] = f"guild {gid} não existe no backup — nada para restaurar"
        return rel

    bases_backup = [norm_uid(b) for b in (guild_backup["raw"].get("base_ids") or [])]
    bases_atuais = {norm_uid(b) for b in (guild_atual["raw"].get("base_ids") or [])}
    faltando = [b for b in bases_backup if b not in bases_atuais]

    if not faltando:
        rel["erro"] = "guild já tem no save atual todas as bases que tinha no backup"
        return rel

    camps_backup = base_camp_por_id(backup)
    # Referência de verdade pra dentro de `atual` — nunca o `default=[]` do
    # dig() sozinho, que devolveria uma lista solta e o .append() abaixo não
    # apareceria no save reserializado.
    if not isinstance(atual.get("BaseCampSaveData"), dict):
        atual["BaseCampSaveData"] = {"value": []}
    if not isinstance(atual["BaseCampSaveData"].get("value"), list):
        atual["BaseCampSaveData"]["value"] = []
    camps_atual_lista = atual["BaseCampSaveData"]["value"]
    ids_ja_presentes = set(base_camp_por_id(atual).keys())

    objetos_atual_lista = map_object_list_ref(atual)
    instance_ids_atuais = instance_ids_presentes(atual)

    works_backup = work_por_id(backup)
    works_atual_lista = work_list_ref(atual)
    work_ids_ja_presentes = set(work_por_id(atual).keys())

    novos_base_ids = list(guild_atual["raw"].get("base_ids") or [])
    novos_palbox_ids = list(guild_atual["raw"].get("map_object_instance_ids_base_camp_points") or [])

    for base_id in faltando:
        entry_camp = camps_backup.get(base_id)
        if not entry_camp:
            # base_id está listado na guild do backup mas sem entrada própria
            # em BaseCampSaveData — dado inconsistente, pula em vez de adivinhar.
            continue

        if base_id not in ids_ja_presentes:
            camps_atual_lista.append(entry_camp)
            ids_ja_presentes.add(base_id)

        objetos = map_objects_da_base(backup, base_id)
        copiados = 0
        for obj in objetos:
            iid = norm_uid(dig(obj, "Model", "value", "RawData", "value", "instance_id", default=""))
            if iid and iid in instance_ids_atuais:
                continue
            objetos_atual_lista.append(obj)
            if iid:
                instance_ids_atuais.add(iid)
            copiados += 1

        raw_camp = dig(entry_camp, "value", "RawData", "value", default={}) or {}
        owner_palbox = raw_camp.get("owner_map_object_instance_id")

        # O Pal Box é o que faz a base ser uma base: a guild aponta pra ele em
        # `map_object_instance_ids_base_camp_points`. Se ele não veio junto, o
        # vínculo aponta pro vazio e o jogo tem todo motivo pra limpar a base.
        ids_copiados = {
            norm_uid(dig(o, "Model", "value", "RawData", "value", "instance_id", default=""))
            for o in objetos
        }
        palbox_veio = bool(owner_palbox) and norm_uid(owner_palbox) in ids_copiados
        tipos = {}
        for o in objetos:
            tipo = scalar(dig(o, "MapObjectId"), "?")
            tipos[tipo] = tipos.get(tipo, 0) + 1
        palbox_tipos = [t for t in tipos if "palbox" in str(t).lower()]

        novos_base_ids.append(entry_camp.get("key"))
        if (owner_palbox and norm_uid(owner_palbox) != ZERO_UID
                and norm_uid(owner_palbox) not in {norm_uid(x) for x in novos_palbox_ids}):
            novos_palbox_ids.append(owner_palbox)

        trabalhos_copiados = 0
        for wid in work_ids_da_base(entry_camp):
            wid_norm = norm_uid(wid)
            if not wid_norm or wid_norm in work_ids_ja_presentes:
                continue
            work_entry = works_backup.get(wid_norm)
            if not work_entry:
                continue
            works_atual_lista.append(work_entry)
            work_ids_ja_presentes.add(wid_norm)
            trabalhos_copiados += 1

        rel["bases_restauradas"].append({
            "base_id": base_id,
            "nome": (raw_camp.get("name") or "").strip(),
            "objetos": copiados,
            "trabalhos": trabalhos_copiados,
            "palbox_veio": palbox_veio,
            "palbox_id": norm_uid(owner_palbox) if owner_palbox else "(vazio)",
            "palbox_tipos": palbox_tipos,
            "work_ids_na_base": len(work_ids_da_base(entry_camp)),
        })
        rel["objetos_restaurados"] += copiados
        rel["trabalhos_restaurados"] = rel.get("trabalhos_restaurados", 0) + trabalhos_copiados

    guild_atual["raw"]["base_ids"] = novos_base_ids
    guild_atual["raw"]["map_object_instance_ids_base_camp_points"] = novos_palbox_ids

    # ⚠️ SEM ISTO A RESTAURAÇÃO NÃO SOBREVIVE AO PRIMEIRO AUTOSAVE.
    # O servidor roda com `bAutoResetGuildNoOnlinePlayers=true` e
    # `AutoResetGuildTimeNoOnlinePlayers=72.0`: guild sem ninguém online há mais
    # de 72h tem as bases apagadas de novo, que é justamente o que tirou a base
    # do jogador. Marcar os membros como "online agora" devolve a eles a janela
    # de 72h para entrar e reivindicar a base — sem isso, restaurar é jogar
    # tempo fora (medido: a primeira tentativa sumiu no autosave seguinte).
    agora = agora_na_escala_do_save(atual)
    membros_tocados = []
    if agora is None:
        rel["aviso"] = ("não achei nenhum last_online_real_time no save para servir de"
                        " referência de 'agora' — contador NÃO foi renovado")
    else:
        uids_da_guild = set()
        for membro in guild_atual["raw"].get("players") or []:
            uids_da_guild.add(norm_uid(membro.get("player_uid", "")))
            info = membro.get("player_info")
            if not isinstance(info, dict):
                continue
            membros_tocados.append({
                "nome": info.get("player_name") or "(sem nome)",
                "antes": info.get("last_online_real_time"),
                "depois": agora,
            })
            info["last_online_real_time"] = agora

        # O mesmo contador vive também no SaveParameter do personagem, e o
        # Save Pal atualiza os dois. Só mexe onde a chave já existe — inventar
        # o campo em quem não tem muda a forma da entrada.
        rel["personagens_renovados"] = 0
        for entrada in dig(atual, "CharacterSaveParameterMap", "value", default=[]) or []:
            param = dig(entrada, "value", "RawData", "value", "object", "SaveParameter", "value")
            if not isinstance(param, dict) or "LastOnlineRealTime" not in param:
                continue
            chave = norm_uid(scalar(dig(entrada, "key", "PlayerUId"), ""))
            if chave in uids_da_guild:
                param["LastOnlineRealTime"]["value"] = agora
                rel["personagens_renovados"] += 1

    rel["membros_renovados"] = membros_tocados

    return rel


def _abortar(motivo: str) -> int:
    print(f"\n  ❌ ABORTADO: {motivo}")
    print("     Nada foi sobrescrito. O mundo continua como estava.")
    return 1


# ---------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Restaura base(s) perdida(s) por decay a partir de um backup")
    ap.add_argument("--servidor", required=True, help="slug: pve-free, pve-vip, pvp-free")
    ap.add_argument("--uids", help="UIDs dos jogadores (32 hex cada), separados por vírgula")
    ap.add_argument("--arquivo-backup", default="Level.sav.bak-20260822-154657",
                     help="nome do arquivo de backup na mesma pasta do save")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--verificar", action="store_true",
                      help="só prova que ler+reserializar o save atual não corrompe. Não escreve.")
    modo.add_argument("--simular", action="store_true",
                      help="faz a restauração em memória e relata. Não escreve.")
    modo.add_argument("--aplicar", action="store_true",
                      help="grava de verdade. Servidor tem que estar PARADO.")
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
            sys.exit(f"sem panelId para {cfg.slug} — não dá para conferir se está parado")
        try:
            atual_estado = estado_do_painel(pid)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
        if atual_estado != "offline":
            print(f"  ❌ O servidor está '{atual_estado}', não 'offline'.")
            print("     Gravar com o jogo rodando corrompe o mundo de todos.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    t0 = time.time()
    original = baixar(cfg, caminho)
    print(f"  save atual baixado: {len(original):,} bytes em {time.time()-t0:.0f}s", flush=True)

    t0 = time.time()
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    print(f"  descomprimido: {len(gvas_bytes):,} bytes em {time.time()-t0:.0f}s (tipo 0x{tipo:02x})", flush=True)

    t0 = time.time()
    gvas = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    print(f"  parse: {time.time()-t0:.0f}s ({len(custom)} de {len(PALWORLD_CUSTOM_PROPERTIES)} seções)", flush=True)
    world = gvas.properties["worldSaveData"]["value"]

    # ---- modo verificar ---------------------------------------------------
    if args.verificar:
        t0 = time.time()
        refeito = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
        print(f"  reserializado: {len(refeito):,} bytes em {time.time()-t0:.0f}s", flush=True)
        print()
        if refeito == original:
            print("  ✅ IDÊNTICO byte a byte — o ciclo não corrompe o save.")
            return 0
        print(f"  ⚠️  DIFERENTE: {len(original):,} -> {len(refeito):,} bytes")
        volta, _ = decompress_sav_to_gvas(refeito)
        if volta == gvas_bytes:
            print("  ✅ O GVAS descomprimido é IDÊNTICO. Só a compressão variou.")
            return 0
        print("  ❌ O GVAS mudou. NÃO usar --aplicar até entender o porquê.")
        return 1

    # ---- baixar o backup e restaurar em memória ---------------------------
    t0 = time.time()
    backup_bytes = baixar(cfg, caminho_backup)
    print(f"\n  backup baixado: {len(backup_bytes):,} bytes em {time.time()-t0:.0f}s ({args.arquivo_backup})", flush=True)

    t0 = time.time()
    backup_gvas_bytes, _ = decompress_sav_to_gvas(backup_bytes)
    backup_gvas = GvasFile.read(backup_gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    backup_world = backup_gvas.properties["worldSaveData"]["value"]
    print(f"  backup decodificado em {time.time()-t0:.0f}s", flush=True)

    print()
    algo_mudou = False
    for uid in uids:
        rel = restaurar_jogador(world, backup_world, uid)
        print(f"  uid {uid}:")
        if rel["erro"]:
            print(f"    ✗ {rel['erro']}")
            continue
        print(f"    guild: {rel['guild_nome']} ({rel['guild']})")
        for b in rel["bases_restauradas"]:
            print(f"    ✓ base {b['base_id']} \"{b['nome']}\" — {b['objetos']} objetos, {b['trabalhos']} trabalhos restaurados")
            print(f"        pal box {b['palbox_id']}: "
                  + ("✓ veio junto" if b["palbox_veio"] else "❌ NÃO está entre os objetos copiados")
                  + f" | tipos palbox achados: {b['palbox_tipos'] or 'nenhum'}"
                  + f" | work_ids na base: {b['work_ids_na_base']}")
        if rel.get("aviso"):
            print(f"    ⚠️  {rel['aviso']}")
        for m in rel.get("membros_renovados") or []:
            atraso = ""
            if isinstance(m["antes"], int) and isinstance(m["depois"], int):
                atraso = f" (estava {ticks_para_dias(m['depois'] - m['antes'])} atrás)"
            print(f"    ⏱  {m['nome']}: {ticks_para_dias(m['antes'])}"
                  f" -> {ticks_para_dias(m['depois'])}{atraso}")
        if rel.get("personagens_renovados"):
            print(f"    ⏱  LastOnlineRealTime renovado em {rel['personagens_renovados']} personagem(ns)")
        algo_mudou = algo_mudou or bool(rel["bases_restauradas"])

    if not algo_mudou:
        print("\n  Nada a restaurar para os UIDs informados.")
        return 1

    # ---- checagem pós-edição, sempre, mesmo em --simular -------------------
    # Prova que a MUTAÇÃO EM MEMÓRIA sobrevive ao ciclo reserializar+reler,
    # ANTES de decidir se o problema (se houver) está na escrita da lib ou em
    # outra coisa (ex.: o próprio jogo descartando no autosave seguinte).
    t0 = time.time()
    checagem = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    print(f"\n  reserializado (checagem): {len(checagem):,} bytes em {time.time()-t0:.0f}s "
          f"(save atual original tinha {len(original):,})", flush=True)

    recheck_bytes, _ = decompress_sav_to_gvas(checagem)
    recheck_gvas = GvasFile.read(recheck_bytes, PALWORLD_TYPE_HINTS, custom)
    recheck_world = recheck_gvas.properties["worldSaveData"]["value"]

    print("  pós-reserialização (relendo o que acabamos de gravar em memória):")
    for uid in uids:
        g = guild_do_jogador(recheck_world, uid)
        if not g:
            print(f"    uid {uid}: guild não encontrada na releitura")
            continue
        bases = g["raw"].get("base_ids") or []
        palboxes = g["raw"].get("map_object_instance_ids_base_camp_points") or []
        print(f"    guild {g['raw'].get('guild_name')}: base_ids={len(bases)} "
              f"map_object_instance_ids_base_camp_points={len(palboxes)}")
    mo_total_antes = len(map_object_entries(world))
    bc_total_antes = len(base_camp_entries(world))
    wk_total_antes = len(work_entries(world))
    mo_total_depois = len(map_object_entries(recheck_world))
    bc_total_depois = len(base_camp_entries(recheck_world))
    wk_total_depois = len(work_entries(recheck_world))
    print(f"    MapObjectSaveData: {mo_total_antes} em memória -> {mo_total_depois} após reler o reserializado")
    print(f"    BaseCampSaveData: {bc_total_antes} em memória -> {bc_total_depois} após reler o reserializado")
    print(f"    WorkSaveData: {wk_total_antes} em memória -> {wk_total_depois} após reler o reserializado")

    if args.simular:
        print("\n  (simulação — nada foi gravado)")
        return 0

    # ---- aplicar ------------------------------------------------------------
    info = info_arquivo(cfg, caminho)
    if info:
        idade = time.time() - info[1]
        if idade > 900:
            print(f"\n  ⚠️  o Level.sav tem {idade/60:.0f} minutos — confira se salvou certo.")
        else:
            print(f"\n  ✅ mundo salvo há {idade/60:.0f} min", flush=True)

    t0 = time.time()
    novo = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    print(f"\n  reserializado: {len(novo):,} bytes em {time.time()-t0:.0f}s", flush=True)

    backup_de_seguranca = caminho + time.strftime(".bak-%Y%m%d-%H%M%S")
    enviar(cfg, backup_de_seguranca, original)
    conf = info_arquivo(cfg, backup_de_seguranca)
    if not conf or conf[0] != len(original):
        return _abortar(f"backup incompleto ({conf[0] if conf else 0} de {len(original)} bytes).")
    print(f"  ✅ backup conferido: {backup_de_seguranca} ({conf[0]:,} bytes)", flush=True)

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
        print(f"  Players/{uid}.sav: " + ("apagado" if apagar(cfg, individual) else "não existia"), flush=True)

    print("\n  ✅ Feito. Suba o servidor e peça para os jogadores entrarem.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
