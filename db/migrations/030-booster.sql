-- Booster da comunidade — pedido do dono em 24/09/2026.
--
-- Uma doação (R$ 5 por padrão) ou um crédito do VIP turbina a taxa de um
-- servidor por um ciclo de restart (4h): XP, Drop e/ou Captura, à escolha
-- de quem doa, multiplicados (2x por padrão). Vale para todo mundo que
-- estiver no servidor.
--
-- O jogo só lê as taxas no boot, então quem aplica é o próprio servidor: o
-- startup command roda `vigia/booster_boot.py` logo depois do
-- PalworldServerConfigParser (que regrava o .ini com as taxas do painel a
-- cada boot) e pergunta ao site o que vale neste ciclo. Nada é aplicado
-- fora do restart normal — ver `lib/booster.ts`.
--
-- Idempotente.

begin;

create table if not exists booster_config (
  id              integer     primary key default 1 check (id = 1),
  preco_centavos  integer     not null default 500 check (preco_centavos >= 100),
  multiplicador   numeric     not null default 2 check (multiplicador > 1 and multiplicador <= 10),
  ativo           boolean     not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      text
);
insert into booster_config (id) values (1) on conflict (id) do nothing;

create table if not exists boosters (
  id               bigserial   primary key,
  discord_id       text        not null,
  server_slug      text        not null,
  -- Subconjunto de {xp, drop, captura}; quem doa escolhe, pode misturar.
  tipos            text[]      not null check (cardinality(tipos) > 0),
  -- 'doacao' (Pix) ou 'vip' (crédito do plano — aí `vip_doacao_id` aponta de onde saiu).
  origem           text        not null,
  vip_doacao_id    bigint      references vip_doacoes (id),
  -- Copiado na hora, como o valor da doação VIP.
  multiplicador    numeric     not null,
  valor_centavos   integer     not null default 0,
  -- aguardando (Pix) → na_fila → ativo → encerrado; 'falhou' = link não abriu.
  status           text        not null default 'aguardando',
  order_nsu        text        unique,
  checkout_url     text,
  transaction_nsu  text,
  invoice_slug     text,
  paid_amount      integer,
  capture_method   text,
  receipt_url      text,
  pago_em          timestamptz,
  ativado_em       timestamptz,
  encerrado_em     timestamptz,
  -- O que o servidor gravou no .ini ao ligar: { ExpRate: [base, turbinado], ... }
  taxas            jsonb       not null default '{}',
  detail           text        not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists boosters_fila_idx on boosters (server_slug, status, pago_em);
create index if not exists boosters_doador_idx on boosters (discord_id, created_at desc);

-- Boosters por mês de cada plano VIP. A doação copia, como as Paletas.
alter table vip_planos add column if not exists boosters integer not null default 0;
alter table vip_doacoes add column if not exists boosters integer not null default 0;

-- "1 booster" / "2 boosters" / "4 boosters" viram número de verdade e saem
-- do texto do card (o card mostra sozinho).
update vip_planos
   set boosters = case key when 'hardMetal' then 1 when 'newMetal' then 2 when 'palleira' then 4 end,
       beneficios = coalesce((
         select jsonb_agg(b order by n)
           from jsonb_array_elements_text(beneficios) with ordinality as t(b, n)
          where b !~* 'booster'
       ), '[]'::jsonb),
       updated_at = now()
 where key in ('hardMetal', 'newMetal', 'palleira')
   and boosters = 0;

-- Doações já pagas ganham os boosters do plano delas.
update vip_doacoes d
   set boosters = p.boosters
  from vip_planos p
 where p.key = d.plano_key
   and d.boosters = 0
   and d.status in ('pago', 'entregue');

commit;
