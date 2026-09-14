-- 021 — IV mínimo de resgate, configuração global da Câmara
--
-- O dono pediu em 14/09/2026 poder mudar o IV mínimo pra resgatar o Pal
-- purificado (era uma constante fixa, 110). Primeira tentativa foi por
-- ritual — errada: com vários jogadores simultâneos, o staff precisaria
-- editar ritual por ritual. É uma configuração ÚNICA e global da Câmara
-- inteira, que vale pra todo mundo ao mesmo tempo.
--
-- Uma tabela de 1 linha só, no padrão de configuração singleton — mais
-- simples que uma coluna espalhada em cada `purification_rituals`, e não
-- precisa "propagar" a mudança pros rituais já abertos: a leitura sempre
-- pega o valor atual.
--
-- Idempotente.

begin;

create table if not exists purification_config (
  id                 int  primary key default 1,
  iv_minimo_resgate  int  not null default 110,
  constraint purification_config_singleton check (id = 1)
);

insert into purification_config (id, iv_minimo_resgate)
values (1, 110)
on conflict (id) do nothing;

commit;
