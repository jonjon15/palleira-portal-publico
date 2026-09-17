#!/usr/bin/env python3
"""
Corrige, em tempo de execução, um bug do `palworld_aio.managers.backup_manager`
que impede exportar/importar jogador.

O bug: o módulo procura a seção na RAIZ do GVAS —

    cspm = level_wrapper.get('CharacterSaveParameterMap', {}).get('value', [])

— mas em `properties` só existem `Version`, `Timestamp`, `Revision` e
`worldSaveData`; a `CharacterSaveParameterMap` mora **dentro** de
`worldSaveData.value`. Como o `.get()` do wrapper engole o `KeyError` e
devolve `{}`, a lista sai vazia e **nenhum** jogador é encontrado. O sintoma é
`Could not find player <uid> in CharacterSaveParameterMap` para todo mundo,
inclusive para quem está no save (confirmado em 17/09/2026: `21f2bd36`
(TenshiGamePlay) e `0edc41b1` (Srta Bjorn) existem e falhavam mesmo assim).

Este patch troca a leitura por uma que desce até `worldSaveData` antes de
procurar, deixando o resto do módulo intacto. É aplicado pelo
`migrar_sem_decay.py` antes de usar o backup_manager.

Não grava nada em disco nem no servidor — só altera o módulo em memória.
"""

from __future__ import annotations

TROCA_DE = "level_wrapper.get('CharacterSaveParameterMap', {}).get('value', [])"
TROCA_PARA = "__secao_cspm(level_wrapper)"

AJUDANTE = '''

def __secao_cspm(wrapper):
    """A CharacterSaveParameterMap de verdade: dentro de worldSaveData."""
    props = wrapper.get('properties', None)
    if props is None:
        try:
            props = wrapper.gvas_file.properties
        except AttributeError:
            props = {}
    no = props.get('worldSaveData', {})
    if isinstance(no, dict):
        no = no.get('value', no)
    secao = no.get('CharacterSaveParameterMap', {}) if isinstance(no, dict) else {}
    if isinstance(secao, dict):
        return secao.get('value', [])
    return secao or []
'''


def aplicar() -> int:
    """Reescreve o fonte do backup_manager em memória. Devolve quantas
    ocorrências foram trocadas."""
    import palworld_aio.managers.backup_manager as bm

    caminho = bm.__file__
    fonte = open(caminho, "r", encoding="utf-8").read()

    n = fonte.count(TROCA_DE)
    if n == 0:
        raise SystemExit(
            "patch não se aplica: a linha esperada não está no backup_manager "
            "(a ferramenta mudou de versão?)"
        )

    novo = fonte.replace(TROCA_DE, TROCA_PARA) + AJUDANTE
    exec(compile(novo, caminho, "exec"), bm.__dict__)
    return n


if __name__ == "__main__":
    print(f"{aplicar()} ocorrência(s) corrigida(s)")
