-- Booster: cada tipo tem a sua própria fila — pedido do dono em 24/09/2026.
--
-- Regra: pedir um booster com outro já ligado mantém o que a pessoa
-- escolheu e acrescenta o que faltar, mas a taxa nunca passa de 2x. XP
-- ligado + alguém pede XP e Drop: no próximo restart o Drop entra e o XP do
-- novo pedido vem depois, estendendo o XP por mais um ciclo, em vez de
-- virar 4x.
--
-- Para isso, cada (booster, tipo) é gasto separadamente: um uso por tipo,
-- num ciclo de restart. O booster só fica 'encerrado' quando todos os
-- tipos dele foram usados.
--
-- A Captura saiu da lista (pedido do dono), mas nenhum booster tinha
-- pedido Captura.
--
-- Idempotente.

begin;

create table if not exists booster_usos (
  id           bigserial   primary key,
  booster_id   bigint      not null references boosters (id),
  server_slug  text        not null,
  tipo         text        not null,
  ativado_em   timestamptz not null default now(),
  -- O que o servidor gravou para este tipo: { ExpRate: [base, turbinado] }
  taxas        jsonb       not null default '{}',
  unique (booster_id, tipo)
);

create index if not exists booster_usos_ciclo_idx on booster_usos (server_slug, ativado_em desc);

commit;
