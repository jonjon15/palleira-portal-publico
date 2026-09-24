-- Boosters do VIP amarrados ao CARGO — pedido do dono em 24/09/2026.
--
-- Quem tem o cargo Hard Metal / New Metal / Palleira no Discord ganha os
-- boosters do plano (vip_planos.boosters) a cada 30 dias: cada booster usado
-- volta 30 dias depois do uso. Não depende mais de ter doado pelo site —
-- a maior parte dos VIPs ganhou o cargo antes do Pix existir.
--
-- Como alguns já usaram boosters por fora, a staff acerta o saldo em
-- /admin/vip. Cada acerto é uma linha aqui: `consumidos` positivo gasta,
-- negativo devolve. Conta na mesma janela de 30 dias dos usos.
--
-- Idempotente.

begin;

create table if not exists booster_ajustes (
  id          bigserial   primary key,
  discord_id  text        not null,
  consumidos  integer     not null,
  motivo      text        not null default '',
  por         text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists booster_ajustes_pessoa_idx on booster_ajustes (discord_id, created_at desc);

commit;
