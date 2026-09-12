-- 016 — Evento criado a partir de mensagem do Discord
--
-- O dono anuncia evento no canal 📣┇eventos-pve e quer que isso apareça no
-- mural do site sozinho, sem digitar duas vezes.
--
-- A coluna guarda o id da mensagem que virou o evento. É o que impede a
-- sincronização de duplicar: rodando de novo, quem já tem linha é pulado.
-- Nula para todo evento escrito à mão no admin, que continua funcionando
-- igual.
--
-- `unique` e não só índice: se duas execuções se cruzarem (o cron e um
-- clique manual, por exemplo), o banco recusa a segunda em vez de deixar o
-- mural com o evento repetido.
--
-- Idempotente.

begin;

alter table events
  add column if not exists discord_message_id text;

create unique index if not exists events_discord_message_idx
  on events (discord_message_id)
  where discord_message_id is not null;

commit;
