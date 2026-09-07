-- Guarda quem era o líder (admin_player_uid) da guild no momento do
-- recorte da base — `tools/arquivar_bases.py` já lê o campo do
-- GroupSaveDataMap junto com guild_id/guild_name, só não guardava ainda.
--
-- Existe porque a restauração paga (§ handoff restauracao-paga-fase-2.md,
-- item 6) vai passar a exigir que só o LÍDER da guild confirme a
-- restauração da base — decidido em 07/09/2026: a base é de todo mundo, mas
-- quem aciona (e paga, ou gasta a grátis) devia ser quem lidera.
--
-- Fica nulo para todo snapshot já arquivado antes desta coluna existir
-- (inclusive o backfill de 22/08) — o site trata "líder desconhecido" como
-- "não bloqueia", não como "ninguém pode restaurar".

alter table base_snapshots
  add column if not exists leader_uid text;
