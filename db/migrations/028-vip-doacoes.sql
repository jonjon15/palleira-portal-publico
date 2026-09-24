-- VIP por doação via Pix (InfinitePay), com entrega automática — pedido do
-- dono em 23/09/2026.
--
-- A página /vip deixa de ser vitrine fixa no código: o dono edita os planos
-- (nome, valor, Paletas do mês, lista de benefícios) em /admin/vip. O que é
-- regra do site — daily e slots do cofre — continua em `lib/roles.ts`
-- (`PLANOS`), porque o dono pediu para editar "só a aba de VIP".
--
-- Os três planos são fixos (a chave amarra no cargo do Discord em
-- `PLANOS`); o que muda é o conteúdo de cada um.

create table if not exists vip_config (
  id            integer     primary key default 1 check (id = 1),
  -- A InfiniteTag do dono, sem o "$". Vazia = botão de doar desligado.
  infinite_tag  text        not null default '',
  updated_at    timestamptz not null default now(),
  updated_by    text
);

insert into vip_config (id) values (1) on conflict (id) do nothing;

create table if not exists vip_planos (
  key             text        primary key,
  nome            text        not null,
  preco_centavos  integer     not null check (preco_centavos > 0),
  paletas_no_mes  integer     not null default 0 check (paletas_no_mes >= 0),
  beneficios      jsonb       not null default '[]',
  destaque        boolean     not null default false,
  ativo           boolean     not null default true,
  ordem           integer     not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      text
);

insert into vip_planos (key, nome, preco_centavos, paletas_no_mes, beneficios, destaque, ordem) values
  ('hardMetal', 'Hard Metal', 2000, 30, '["Whitelist do PVE VIP","Dobro de prêmio em evento","3 Paletas de desconto em kit e Pal Monster","1.000 moedas cachorro","50 cristais de prata","30 esferas soraliticas","20 esferas antigas","20 núcleos de IA","1 booster"]', false, 1),
  ('newMetal', 'New Metal', 4000, 60, '["Tudo do Hard Metal","4 Paletas de desconto em kit e Pal Monster","2.000 moedas cachorro","200 bilhetes de batalha","200 provas de recompensa","80 cristais de prata","50 esferas soraliticas","30 esferas antigas","30 núcleos de IA","2 boosters"]', false, 2),
  ('palleira', 'Palleira', 6000, 90, '["Tudo do New Metal","5 Paletas de desconto em kit e Pal Monster","2.500 moedas cachorro","350 bilhetes de batalha","350 provas de recompensa","120 cristais de prata","80 esferas soraliticas","50 esferas antigas","50 núcleos de IA","4 boosters"]', true, 3)
on conflict (key) do nothing;

-- Uma linha por doação. Nasce 'aguardando' quando o link do InfinitePay é
-- criado; vira 'pago' quando a InfinitePay CONFIRMA (payment_check — o
-- webhook deles não é assinado, então nunca se acredita nele sozinho); vira
-- 'entregue' quando cargo e Paletas saíram. 'pago' parado = entrega pela
-- metade, com o motivo em `detail`, e o admin tenta de novo.
create table if not exists vip_doacoes (
  id               bigserial   primary key,
  discord_id       text        not null,
  plano_key        text        not null references vip_planos (key),
  -- Copiados na hora: o dono pode mudar o plano depois, a doação não muda.
  plano_nome       text        not null,
  valor_centavos   integer     not null,
  paletas          integer     not null,
  order_nsu        text        unique,
  checkout_url     text,
  status           text        not null default 'aguardando',
  transaction_nsu  text,
  invoice_slug     text,
  paid_amount      integer,
  capture_method   text,
  receipt_url      text,
  pago_em          timestamptz,
  -- Até quando o cargo vale. Doar de novo antes de vencer soma 30 dias.
  vip_ate          timestamptz,
  cargo_ok         boolean     not null default false,
  paletas_ok       boolean     not null default false,
  cargo_removido_em timestamptz,
  detail           text        not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists vip_doacoes_doador_idx on vip_doacoes (discord_id, created_at desc);
create index if not exists vip_doacoes_status_idx on vip_doacoes (status);
