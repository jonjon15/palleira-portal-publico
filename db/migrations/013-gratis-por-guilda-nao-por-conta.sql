-- Corrige o escopo da restauração grátis: por GUILD, não por conta.
--
-- Decidido em 07/09/2026, depois de ver na prática que uma pessoa pode ter
-- base arquivada em mais de um servidor (cada um com uma guild diferente) e
-- a base é sempre da guild inteira, não de quem clicou. A grátis existe
-- porque a rotina de decay ainda não tinha o gatilho certo quando foi
-- ligada e apagou base de gente que não devia — não é um mimo por conta de
-- Discord.
--
-- Guarda o guild_id no PEDIDO (não só no snapshot) porque o snapshot que a
-- pessoa escolher pode, em teoria, trocar de guild_id numa recaptura futura
-- — o pedido precisa congelar "isto foi um resgate desta guild", não
-- reapontar para o que `base_snapshots.guild_id` disser depois.

alter table base_restore_requests
  add column if not exists guild_id text;
