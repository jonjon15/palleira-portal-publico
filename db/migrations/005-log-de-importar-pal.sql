-- 005 — `pal_transfers` também registra a importação, não só a entrega
--
-- A migração 004 desenhou `pal_transfers` só para a metade assíncrona (o
-- resgate, que passa pelo GitHub Actions). Mas importar um Pal do jogo para
-- o cofre tem o mesmo risco que importar um item (`vault_transfers`): se o
-- RCON não responder, não dá para saber se o `deletepals` executou ou não —
-- e sem registro isso vira "o Pal sumiu e ninguém sabe".
--
-- Em vez de criar uma segunda tabela, `pal_transfers` aprende uma
-- `direction`, igual a `vault_transfers` já tem para item. `arquivo` só
-- existe para `resgatar` (é o nome do arquivo em Pals/Templates/); em
-- `importar` não tem SFTP nenhum envolvido, por isso vira opcional.
--
-- Idempotente.

begin;

alter table pal_transfers
  add column if not exists direction text not null default 'resgatar';

alter table pal_transfers
  alter column arquivo drop not null;

commit;
