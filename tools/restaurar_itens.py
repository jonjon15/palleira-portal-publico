#!/usr/bin/env python3
"""
Devolve ao jogador o CONTEÚDO da bag: mochila, essenciais, armas, armadura e
comida equipada.

Existe porque a restauração de base e Pals não cuidava dos containers de
item, e por isso os criava do zero. A sequência medida em 06/09/2026, no
pve-free:

  1. `restaurar_player_sav` devolve o `Players/<uid>.sav` do backup, que
     aponta para seis containers de item;
  2. o `Level.sav` vivo não tem esses containers — a limpeza do jogo já os
     tinha apagado, e nada os trouxe de volta;
  3. o jogador entra, o jogo acha os ponteiros quebrados e **cria seis
     containers novos e vazios**, gravando os GUIDs novos no save individual.

Foi assim que TenshiGamePlay perdeu 122 slots e GivaldoJuniorr 67, às
20:59 UTC de 05/09/2026 — o mesmo minuto para os dois.

O conserto não reescreve GUID nenhum no `Players/<uid>.sav`: para cada campo
de inventário, pega a entrada do container **antigo** no backup e transplanta
o conteúdo dela para dentro do container que o save individual aponta
**hoje**, mantendo a chave de hoje. O save individual não é tocado, e é por
isso que este é o caminho seguro — reescrever o save pequeno exige
recomprimir certo, e um erro ali deixa o jogador sem conseguir entrar.

⚠️ Rodar com o servidor PARADO. Subir no meio acorda a limpeza do jogo.

Uso:
    python tools/restaurar_itens.py --servidor pve-free --uids 21F2BD36... --simular
    python tools/restaurar_itens.py --servidor pve-free --uids 21F2BD36... --aplicar
"""

from __future__ import annotations

import argparse
import copy
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from energia_painel import PANEL_IDS, estado as estado_do_painel  # noqa: E402
from restaurar_base import (  # noqa: E402
    _abortar, _sftp, apagar, baixar, dig, enviar, info_arquivo, lista_mutavel,
    norm_uid, renomear, secao_por_id, servidores,
)
from sondar_inventario import (  # noqa: E402
    SECOES_MUNDO, conteudo, guid_sob, ler_gvas, slots_com_coisa,
)

BASE_DIR = "Pal/Saved/SaveGames/0/{guid}"
SAVE_PATH = BASE_DIR + "/Level.sav"
PLAYER_PATH = BASE_DIR + "/Players/{uid}.sav"

# Só os de ITEM. Os dois de Pal (`PalStorage`, `Otomo`) são trabalho do
# `restaurar_pals.py`, e nunca foram o problema: os GUIDs deles não mudaram
# em nenhuma das versões comparadas.
CAMPOS_DE_ITEM = (
    "CommonContainerId",           # mochila
    "DropSlotContainerId",         # o que cai ao morrer
    "EssentialContainerId",        # itens-chave
    "WeaponLoadOutContainerId",    # armas
    "PlayerEquipArmorContainerId",  # armadura
    "FoodEquipContainerId",        # comida equipada
)


def ler_player_sav(cfg, uid: str, pasta_backup: str | None = None) -> dict[str, str]:
    """campo -> GUID do container, lido do save individual.

    `pasta_backup` vazio = o save que está valendo; senão o de
    `backup/world/<pasta>/`.
    """
    base = BASE_DIR.format(guid=cfg.guid)
    caminho = (f"{base}/backup/world/{pasta_backup}/Players/{uid}.sav"
               if pasta_backup else f"{base}/Players/{uid}.sav")
    props = ler_gvas(baixar(cfg, caminho), {}).properties
    save_data = dig(props, "SaveData", "value", default=props)
    return {c: guid_sob(save_data, c) for c in CAMPOS_DE_ITEM}


def pastas_de_backup(cfg) -> list[str]:
    """As pastas de `backup/world/`, da mais nova para a mais velha."""
    t, sftp = _sftp(cfg)
    try:
        try:
            return sorted(sftp.listdir(f"{BASE_DIR.format(guid=cfg.guid)}/backup/world"),
                          reverse=True)
        except FileNotFoundError:
            return []
    finally:
        t.close()


def trocar_guid(no, de: str, para, prof: int = 14) -> int:
    """Troca todo GUID igual a `de` pelo objeto `para`, em qualquer profundidade.

    O GUID do container aparece repetido dentro do próprio conteúdo (o
    `RawData` de cada slot carrega o id do container a que pertence). Copiar o
    conteúdo sem trocar essas cópias deixaria o container com a chave de hoje
    e o miolo apontando para um GUID que não existe mais — o mesmo tipo de
    ponteiro quebrado que causou o problema.

    `para` é um objeto emprestado do próprio save (o tipo `palsav.archive.UUID`
    não se constrói à mão de forma estável entre versões da lib).
    """
    trocados = 0
    if prof <= 0:
        return 0
    if isinstance(no, dict):
        for chave, valor in list(no.items()):
            if not isinstance(valor, (dict, list)) and norm_uid(valor) == de:
                no[chave] = para
                trocados += 1
            else:
                trocados += trocar_guid(valor, de, para, prof - 1)
    elif isinstance(no, list):
        for i, item in enumerate(no):
            if not isinstance(item, (dict, list)) and norm_uid(item) == de:
                no[i] = para
                trocados += 1
            else:
                trocados += trocar_guid(item, de, para, prof - 1)
    return trocados


def restaurar_itens_do_jogador(atual: dict, backup: dict,
                               hoje: dict[str, str],
                               antigos: dict[str, str]) -> dict:
    """Transplanta o conteúdo de cada container de item, campo a campo."""
    rel = {"campos": [], "slots_copiados": 0, "erro": None}

    itens_atual = secao_por_id(atual, "ItemContainerSaveData")
    itens_bkp = secao_por_id(backup, "ItemContainerSaveData")
    lista = lista_mutavel(atual, "ItemContainerSaveData")

    for campo in CAMPOS_DE_ITEM:
        novo_id, velho_id = hoje.get(campo, ""), antigos.get(campo, "")
        info = {"campo": campo, "de": velho_id, "para": novo_id,
                "slots": 0, "acao": ""}

        if not novo_id or not velho_id:
            info["acao"] = "sem GUID em uma das versões — pulado"
            rel["campos"].append(info)
            continue

        origem = itens_bkp.get(velho_id)
        if origem is None:
            info["acao"] = "o container antigo não existe no backup — pulado"
            rel["campos"].append(info)
            continue

        ocupados, _ = slots_com_coisa(origem)
        info["slots"] = ocupados
        if not ocupados:
            info["acao"] = "vazio também no backup — nada a devolver"
            rel["campos"].append(info)
            continue

        destino = itens_atual.get(novo_id)
        if destino is None:
            info["acao"] = "o container de hoje não existe no mundo — pulado"
            rel["campos"].append(info)
            continue

        # Não sobrescrever o que o jogador juntou desde então. Container de
        # hoje com coisa dentro é sinal de que ele voltou a jogar, e a cópia
        # apagaria isso — pior que o problema.
        ja_tem, _ = slots_com_coisa(destino)
        if ja_tem:
            info["acao"] = f"o de hoje já tem {ja_tem} slot(s) — pulado para não sobrescrever"
            rel["campos"].append(info)
            continue

        chave_de_hoje = dig(destino, "key", "ID", default=None)
        miolo = copy.deepcopy(origem.get("value"))
        if chave_de_hoje is not None:
            trocar_guid(miolo, velho_id, chave_de_hoje)
        destino["value"] = miolo
        # A entrada é a mesma que já está na lista, mas quando a seção guarda
        # cópias em vez de referências o `.index()` garante que a troca apareça
        # no save reserializado — o erro do `map_object_list_ref` foi esse.
        try:
            lista[lista.index(destino)] = destino
        except ValueError:
            pass

        info["acao"] = "conteúdo transplantado"
        rel["slots_copiados"] += ocupados
        rel["campos"].append(info)

    return rel


def main() -> int:
    ap = argparse.ArgumentParser(description="Devolve o conteúdo da bag de um jogador")
    ap.add_argument("--servidor", required=True)
    ap.add_argument("--uids", required=True, help="UIDs (32 hex), separados por vírgula")
    ap.add_argument("--arquivo-backup", default="auto",
                    help="pasta de backup/world a usar; auto = a mais nova que "
                         "ainda tenha a bag")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--simular", action="store_true", help="mede e não grava")
    modo.add_argument("--aplicar", action="store_true", help="grava o Level.sav")
    args = ap.parse_args()

    from palsav.core import compress_gvas_to_sav, decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    custom = {k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in SECOES_MUNDO}

    cfg = servidores().get(args.servidor)
    if not cfg:
        sys.exit(f"servidor '{args.servidor}' não está em PALLEIRA_SERVERS")

    uids = [norm_uid(u) for u in args.uids.split(",") if u.strip()]
    if not uids:
        sys.exit("informe pelo menos um uid")

    print(f"=== {cfg.slug} — devolver a bag de {len(uids)} jogador(es) ===", flush=True)

    # Gravar com o jogo rodando corrompe o mundo: o servidor reescreve o
    # Level.sav por cima no autosave seguinte. Mesma trava do restaurar_pals.
    if args.aplicar:
        pid = PANEL_IDS.get(cfg.slug)
        if not pid:
            sys.exit(f"sem panelId para {cfg.slug}")
        try:
            estado = estado_do_painel(pid)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"não consegui perguntar ao painel se está parado: {err}")
        if estado != "offline":
            print(f"  ❌ O servidor está '{estado}', não 'offline'.")
            return 1
        print("  ✅ servidor confirmado 'offline'", flush=True)

    caminho = SAVE_PATH.format(guid=cfg.guid)
    t0 = time.time()
    original = baixar(cfg, caminho)
    gvas_bytes, tipo = decompress_sav_to_gvas(original)
    gvas_atual = GvasFile.read(gvas_bytes, PALWORLD_TYPE_HINTS, custom)
    print(f"  save atual: {len(original):,} bytes, lido em {time.time()-t0:.0f}s", flush=True)
    atual = gvas_atual.properties["worldSaveData"]["value"]

    pastas = pastas_de_backup(cfg)
    if not pastas:
        sys.exit("não há backup/world/ nenhum neste servidor")

    escolhidas = ([args.arquivo_backup] if args.arquivo_backup != "auto"
                  else pastas)

    total_geral = 0
    houve_mudanca = False
    # (uid, campo) -> quantos slots devem existir depois da gravação. É o que
    # a checagem pós-reserialização confere; sem isso "gravou" só quer dizer
    # "o arquivo subiu", não "o jogador tem os itens".
    esperados: dict[tuple[str, str], int] = {}

    for uid in uids:
        print(f"\n---------------- {uid} ----------------", flush=True)
        try:
            hoje = ler_player_sav(cfg, uid)
        except FileNotFoundError:
            print("  ✗ o save individual não existe hoje — nada a fazer")
            continue
        print("  containers de hoje: " +
              ", ".join(f"{c.replace('ContainerId', '')}={g[:8]}…"
                        for c, g in hoje.items() if g))

        # Procura, do backup mais novo para o mais velho, o primeiro em que o
        # save individual aponta para containers DIFERENTES dos de hoje e com
        # conteúdo. É a assinatura do momento anterior à troca de GUIDs.
        melhor = None
        for pasta in escolhidas[:12]:
            try:
                antigos = ler_player_sav(cfg, uid, pasta)
            except FileNotFoundError:
                continue
            if not any(antigos.get(c) and antigos[c] != hoje.get(c)
                       for c in CAMPOS_DE_ITEM):
                continue  # mesma bag de hoje: não adianta
            try:
                mundo_bkp = ler_gvas(
                    baixar(cfg, f"{BASE_DIR.format(guid=cfg.guid)}/backup/world/{pasta}/Level.sav"),
                    custom).properties["worldSaveData"]["value"]
            except Exception as err:  # noqa: BLE001
                print(f"  {pasta}: não deu para ler o Level.sav ({type(err).__name__})")
                continue
            itens_bkp = secao_por_id(mundo_bkp, "ItemContainerSaveData")
            tem = sum(slots_com_coisa(itens_bkp.get(antigos[c]))[0]
                      for c in CAMPOS_DE_ITEM if antigos.get(c))
            print(f"  {pasta}: {tem} slot(s) com conteúdo nos containers antigos")
            if tem:
                melhor = (pasta, antigos, mundo_bkp)
                break

        if not melhor:
            print("  ✗ nenhum backup tem uma bag anterior com conteúdo — nada a devolver")
            continue

        pasta, antigos, mundo_bkp = melhor
        print(f"  → usando {pasta}")
        rel = restaurar_itens_do_jogador(atual, mundo_bkp, hoje, antigos)
        for info in rel["campos"]:
            print(f"    {info['campo']:<28} {info['slots']:>3} slot(s) — {info['acao']}")
            if info["acao"] == "conteúdo transplantado":
                esperados[(uid, info["campo"])] = info["slots"]
                for item, qtd in conteudo(secao_por_id(mundo_bkp, "ItemContainerSaveData")
                                          .get(info["de"]))[:8]:
                    print(f"        {item} x{qtd}")
        print(f"  → {rel['slots_copiados']} slot(s) devolvidos")
        total_geral += rel["slots_copiados"]
        houve_mudanca = houve_mudanca or rel["slots_copiados"] > 0

    print(f"\n=== total: {total_geral} slot(s) ===")

    if not houve_mudanca:
        print("  nada a devolver — o Level.sav não foi tocado")
        return 0

    # Reserializar e reler ANTES de gravar. É o teste que faltou nas três
    # primeiras tentativas de 05/09: a edição parecia certa em memória e
    # sumia no ciclo de escrita.
    t0 = time.time()
    checagem = compress_gvas_to_sav(gvas_atual.write(PALWORLD_CUSTOM_PROPERTIES), tipo)
    recheck_bytes, _ = decompress_sav_to_gvas(checagem)
    recheck = GvasFile.read(recheck_bytes, PALWORLD_TYPE_HINTS,
                            custom).properties["worldSaveData"]["value"]
    print(f"\n  reserializado (checagem): {len(checagem):,} bytes em {time.time()-t0:.0f}s")

    tudo_ok = True
    for uid in uids:
        try:
            hoje = ler_player_sav(cfg, uid)
        except FileNotFoundError:
            continue
        itens = secao_por_id(recheck, "ItemContainerSaveData")
        for campo, gid in hoje.items():
            if not gid:
                continue
            esperado = esperados.get((uid, campo), 0)
            if not esperado:
                continue
            ocupados, _ = slots_com_coisa(itens.get(gid))
            marca = "✓" if ocupados >= esperado else "❌"
            print(f"    {marca} {uid[:8]}… {campo}: {ocupados} de {esperado} slot(s)")
            if ocupados < esperado:
                tudo_ok = False

    if not tudo_ok:
        print("\n  ❌ O conteúdo não sobreviveu ao ciclo de escrita. Nada foi gravado.")
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
    enviar(cfg, temporario, checagem)
    conf_novo = info_arquivo(cfg, temporario)
    if not conf_novo or conf_novo[0] != len(checagem):
        apagar(cfg, temporario)
        return _abortar(f"upload incompleto ({conf_novo[0] if conf_novo else 0} de {len(checagem)} bytes).")

    renomear(cfg, temporario, caminho)
    print(f"  ✅ Level.sav trocado ({len(checagem):,} bytes, por rename)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
