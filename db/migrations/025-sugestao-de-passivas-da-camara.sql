-- 025 — "sugestão de passivas" da Câmara de Purificação, com validade
--
-- Pedido do Dayvison no Discord (15/09) mais o pedido do dono (21/09): o
-- bloco que mostra "as passivas que o staff pediu da última vez" (ver
-- `passivasDoUltimoRitual` em lib/purificacao.ts) precisa de prazo de
-- validade — a staff escolhe quantas horas a sugestão vale, e passado esse
-- prazo a sugestão simplesmente some da tela.
--
-- Primeira tentativa foi reaproveitar `passivas_aceitas` de um ritual
-- antigo (cancelado/completo) — errada: só existe algo pra "editar" quando
-- já houve pelo menos um ritual encerrado antes. Servidor novo, ou depois
-- de expirar sem staff ter mexido, ficava sem jeito de criar a primeira
-- sugestão pela UI.
--
-- Tabela própria, singleton — mesmo padrão de `purification_config`
-- (migração 021): configuração ÚNICA e global da Câmara, não presa a
-- nenhum ritual específico.
--
-- Idempotente.

begin;

create table if not exists purification_referencia (
  id                 int          primary key default 1,
  passivas_aceitas   text[]       not null default '{}',
  definida_por       text,
  definida_em        timestamptz,
  expira_em          timestamptz,
  constraint purification_referencia_singleton check (id = 1)
);

insert into purification_referencia (id)
values (1)
on conflict (id) do nothing;

commit;
