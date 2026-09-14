-- 020 — A Câmara de Purificação: ritual de Pal + doadores
--
-- Mecânica pedida pelo dono em 14/09/2026: o jogador escolhe 1 Pal da
-- própria palbox para "purificar". A cada 4 doadores que ele confirma —
-- cada um IV 100 em Vida/Ataque/Defesa, Full Condensado (rank 4) e com
-- pelo menos uma das passivas que o staff aceitar naquele ritual — o Pal
-- ganha +1 de IV nos três eixos, até o teto de 150.
--
-- ⚠️ POR AGORA É SÓ REGISTRO NO SITE. Não edita `Level.sav`, não usa fila
-- de GitHub Actions nem RCON de escrita — ao contrário de `pal_transfers`
-- (004), que existe porque `givepal_j` exige tocar o jogo de verdade. Aqui
-- não há isso ainda: aplicar o IV no jogo fica para uma etapa futura
-- separada, que vai ter que resolver como reencontrar o Pal certo do
-- jogador (ver nota de identidade abaixo). Enquanto essa etapa não existe,
-- estas tabelas são a fonte de verdade sozinhas.
--
-- IDENTIDADE DO "PAL ALVO" — por que não é uma chave estável
--
-- O Pal nunca sai do jogo (ao contrário do cofre, `vault_pals`, que copia o
-- Pal pra cá e some com ele de lá). O único identificador que a API do
-- PalDefender dá, `instanceId`, só existe enquanto aquela sessão do
-- servidor estiver de pé — não é uma chave que se possa guardar e usar para
-- "reachar" o mesmo Pal depois com garantia (mesma limitação que já vale
-- para `deletepals` em `lib/pal-template.ts`). Por isso `template` guarda
-- uma fotografia completa do Pal no momento em que o ritual abriu, e
-- `instance_id_inicial` fica só como prova de origem/auditoria — não como
-- algo que o site tente buscar de novo no jogo depois. Consequência aceita
-- e documentada: nada aqui reconfirma que o jogador ainda tem aquele Pal
-- específico enquanto o ritual roda.
--
-- POR QUE "ATAQUE" É UM EIXO SÓ
--
-- A API do jogo devolve IV separado em `AttackMelee` e `AttackShot`
-- (`lib/pals.ts`), mas a própria ficha do jogo mostra um valor único de
-- Ataque — o dono confirmou com print da tela do jogo. A Câmara trata só
-- três eixos (Vida, Ataque, Defesa), lendo `AttackMelee` como o valor de
-- Ataque e ignorando `AttackShot` como eixo à parte nesta feature.
--
-- POR QUE O DOADOR NÃO SAI DA PALBOX
--
-- Sem mutação de save (ver acima), não haveria como de fato remover o Pal
-- doado do jogo. `purification_donors` grava um retrato mínimo de cada
-- doação (para o histórico "doado por fulano, dia tal" que a vitrine já
-- mostrava) e trava `(ritual_id, instance_id)` único para barrar doar o
-- mesmo Pal duas vezes dentro do MESMO ritual — não cobre reuso entre
-- rituais diferentes, limitação aceita pelo mesmo motivo da nota acima.
--
-- Idempotente.

begin;

create table if not exists purification_rituals (
  id                    bigserial   primary key,
  discord_id            text        not null,
  server_slug           text        not null,
  -- PalID cru (`Suzaku`), só para listar/exibir sem abrir o jsonb.
  pal_id                text        not null,
  -- Fotografia do PalTemplate no instante em que o ritual abriu.
  template              jsonb       not null,
  -- Prova de origem, não chave de busca futura — ver nota acima.
  instance_id_inicial   text        not null,

  -- aguardando_regra → ativo → completo (bateu IV 150)
  --                 ↘ cancelado
  status                text        not null default 'aguardando_regra',

  -- Vale para o ritual inteiro, fixada uma vez pelo staff — não muda
  -- rodada a rodada.
  passivas_aceitas      text[]      not null default '{}',
  regra_definida_por    text,
  regra_definida_em     timestamptz,

  rodadas_completas     int         not null default 0,
  iv_health             int         not null default 100,
  iv_attack             int         not null default 100,
  iv_defense            int         not null default 100,

  created_at            timestamptz not null default now(),
  completed_at          timestamptz
);

-- Só um ritual em andamento por jogador de cada vez.
create unique index if not exists purification_rituals_um_ativo_idx
  on purification_rituals (discord_id)
  where status in ('aguardando_regra', 'ativo');

create index if not exists purification_rituals_status_idx
  on purification_rituals (status, created_at desc);

create table if not exists purification_donors (
  id             bigserial   primary key,
  ritual_id      bigint      not null references purification_rituals (id),
  rodada         int         not null,
  discord_id     text        not null,
  -- Auditoria, não chave de busca futura — mesma nota do topo do arquivo.
  instance_id    text        not null,
  pal_id         text        not null,
  nickname       text        not null default '',
  iv_health      int         not null,
  iv_attack      int         not null,
  iv_defense     int         not null,
  condensed_pals int         not null,
  -- Qual das passivas aceitas este doador cumpriu, para exibir na lista.
  passiva_usada  text        not null,
  donated_at     timestamptz not null default now()
);

-- Barra doar o mesmo Pal (mesmo instanceId) duas vezes no mesmo ritual.
create unique index if not exists purification_donors_sem_repetir_idx
  on purification_donors (ritual_id, instance_id);

create index if not exists purification_donors_ritual_idx
  on purification_donors (ritual_id, rodada);

commit;
