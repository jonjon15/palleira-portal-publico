-- Pals Monster — o Pal montado pela cúpula e vendido na loja, de qualquer
-- servidor (pedido do dono em 23/09/2026).
--
-- Mesmo raciocínio dos kits (024): não é `listing`. Anúncio é peça única que
-- sai do cofre de alguém; o Pal Monster nasce de um molde (o JSON colado pelo
-- dono), e cada compra gera uma cópia nova. Até 23/09 o Lobo de Ferro
-- anunciava um por um a partir do Dominantes, e a trava de origem do
-- Mercado barrava quem só joga no PVE Free.
--
-- A entrega é no cofre de Pals do comprador, sem servidor de origem e sem
-- cooldown: resgata na hora, em qualquer servidor, pelo fluxo de sempre.

create table if not exists pals_monster (
  id          bigserial   primary key,
  nome        text        not null,
  descricao   text        not null default '',
  -- QUEIMADO inteiro, igual ao kit: o Pal nasce do nada, então a Paleta
  -- sai de circulação em vez de virar receita de alguém.
  preco       integer     not null check (preco > 0),
  -- O molde entregue a cada compra, no formato de `PalTemplate`.
  template    jsonb       not null,
  -- null = ilimitado. Com número, a vitrine some sozinha quando esgota.
  estoque     integer     check (estoque is null or estoque >= 0),
  vendidos    integer     not null default 0,
  ativo       boolean     not null default true,
  criado_por  text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint pals_monster_com_palid check (template ? 'PalID')
);

create index if not exists pals_monster_vitrine_idx on pals_monster (ativo, created_at desc);

-- Uma linha por compra, gravada antes de cobrar — se algo cair no meio, o
-- rastro fica. `vault_pal_id` aponta para a cópia que caiu no cofre.
create table if not exists pal_monster_purchases (
  id              bigserial   primary key,
  pal_monster_id  bigint      not null references pals_monster (id),
  discord_id      text        not null,
  preco           integer     not null,
  -- andando | concluido | falhou
  status          text        not null default 'andando',
  detail          text        not null default '',
  vault_pal_id    bigint,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists pal_monster_purchases_comprador_idx
  on pal_monster_purchases (discord_id, created_at desc);
