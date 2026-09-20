-- Kits da loja — o lote de itens que a cúpula monta e o jogador compra.
--
-- Não é um `listing` com `kind='kit'` de propósito. Anúncio do mercado é
-- peça única: nasce de algo que o vendedor tirou do cofre, some quando
-- alguém leva, e a forma dele é amarrada pelo `listings_kind_shape`. Kit é o
-- oposto nos três pontos — estoque infinito, nasce do nada, e é uma lista de
-- itens, não um. Enfiar isso em `listings` obrigaria a afrouxar o check que
-- protege as outras duas formas.
--
-- A entrega é RCON na hora (`giveitems`), sem passar pelo cofre: por isso
-- não há slot para conferir nem transferência para acompanhar — ou o
-- comando responde, ou a compra é desfeita inteira.

create table if not exists kits (
  id          bigserial   primary key,
  nome        text        not null,
  descricao   text        not null default '',
  -- O que o comprador paga. É QUEIMADO inteiro: o dono não recebe nada, e
  -- os itens nascem do nada, então a Paleta sai de circulação em vez de
  -- trocar de dono (§7.7 e a trava do Ouro em `lib/itens.ts`).
  preco       integer     not null check (preco > 0),
  -- [{ itemId, quantidade }] — a mesma forma que `entregarItensParaJogadores`
  -- já recebe, para o kit entrar no motor de entrega sem tradução no meio.
  itens       jsonb       not null,
  -- Fora do ar não aparece no mercado, mas o histórico de quem já comprou
  -- continua de pé. É como se tira um kit de venda sem apagar o passado.
  ativo       boolean     not null default true,
  criado_por  text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint kits_itens_nao_vazio check (jsonb_array_length(itens) > 0)
);

create index if not exists kits_vitrine_idx on kits (ativo, created_at desc);

-- ------------------------------------------------------------- as compras
--
-- Uma linha por compra, gravada ANTES do RCON — mesmo motivo de
-- `vault_transfers`: se o processo morrer entre cobrar e entregar, a linha
-- fica em 'andando' e alguém consegue ver o que ficou pelo caminho.
--
-- Recompra é livre (decisão do dono, 20/09/2026), então não há unicidade por
-- (kit, comprador): o mesmo jogador aparece aqui quantas vezes comprar.
create table if not exists kit_purchases (
  id           bigserial   primary key,
  kit_id       bigint      not null references kits (id),
  discord_id   text        not null,
  server_slug  text        not null,
  palworld_uid text        not null,
  -- O que foi pago, copiado na hora: o preço do kit pode mudar depois, e o
  -- extrato não pode mudar junto.
  preco        integer     not null,
  -- andando | concluido | falhou
  status       text        not null default 'andando',
  -- A resposta crua do RCON, item a item. Quando algo falhar, é por ela que
  -- se descobre o que o jogo respondeu.
  detail       text        not null default '',
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists kit_purchases_comprador_idx
  on kit_purchases (discord_id, created_at desc);

create index if not exists kit_purchases_pendentes_idx
  on kit_purchases (status) where status = 'andando';
