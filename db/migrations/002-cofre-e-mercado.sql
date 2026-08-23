-- 002 — O cofre e o mercado de itens (§7.3, §7.6 e §7.7 do PROMPT.md)
--
-- Por que existe um cofre em vez de vender direto do inventário do jogo:
-- `/items/{uid}` do PalDefender **só responde com o jogador online** — medido
-- de novo em 23/08/2026, devolve `Failed to find APalPlayerController` para
-- quem está fora. Se o anúncio dependesse de ler o inventário, ninguém
-- conseguiria comprar de madrugada. Com o cofre, o ativo entra em custódia
-- enquanto a pessoa joga e é vendido a qualquer hora, com os dois lados
-- offline.
--
-- Idempotente: `if not exists` em tudo. Rodar duas vezes não muda nada.

begin;

-- ------------------------------------------------------------------ cofre
-- Uma linha por (pessoa, tipo de item): as quantidades se somam na mesma
-- pilha. É essa linha que conta como **slot ocupado** — 3 slots são de
-- graça e o 4º em diante se compra com Paleta (§7.12), que é o sink
-- principal da economia. Somar a uma pilha que já existe nunca custa slot.
create table if not exists vault_items (
  discord_id  text        not null,
  -- ItemID cru do jogo (`PalSphere_Ancient_1`, `HandgunBullet`…). O rótulo
  -- em português mora em `lib/itens.ts`; aqui fica a chave, que é o que o
  -- `giveitems` do RCON entende.
  item_id     text        not null,
  qty         integer     not null check (qty > 0),
  updated_at  timestamptz not null default now(),
  primary key (discord_id, item_id)
);

-- ---------------------------------------------------- movimento jogo↔cofre
-- O registro de intenção, gravado ANTES de tocar no jogo.
--
-- É o que impede o pior caso: o comando tira o item do jogador e o processo
-- morre antes de creditar o cofre. Sem esta linha, o item some e ninguém
-- sabe. Com ela, a transferência fica em 'andando' e aparece para o admin.
create table if not exists vault_transfers (
  id           bigserial   primary key,
  discord_id   text        not null,
  server_slug  text        not null,
  palworld_uid text        not null,
  -- importar = jogo → cofre   ·   resgatar = cofre → jogo
  direction    text        not null,
  item_id      text        not null,
  qty          integer     not null check (qty > 0),
  -- andando | concluido | falhou
  status       text        not null default 'andando',
  -- A resposta crua do RCON. Quando algo der errado, é por ela que se
  -- descobre o que o jogo respondeu de verdade.
  detail       text        not null default '',
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists vault_transfers_pendentes_idx
  on vault_transfers (status, created_at desc);

create index if not exists vault_transfers_pessoa_idx
  on vault_transfers (discord_id, created_at desc);

-- --------------------------------------------------------------- anúncios
-- Um anúncio é um lote inteiro: "500 balas de rifle por 10 Paletas". O
-- preço é do lote, não da unidade — sem fração, sem arredondamento, e a
-- Paleta continua sempre inteira (§7.1).
--
-- Não existe tabela `orders` separada de propósito: um anúncio é vendido
-- uma vez e para um comprador só, então a venda **é** o anúncio fechado. O
-- histórico financeiro de verdade vive no `ledger`, que aponta para cá pelo
-- `ref_id`.
create table if not exists listings (
  id          bigserial   primary key,
  seller_id   text        not null,
  -- 'item' hoje; 'pal' entra na v2 com o template do `givepal_j`
  kind        text        not null default 'item',
  item_id     text        not null,
  qty         integer     not null check (qty > 0),
  -- O que o comprador paga
  price       integer     not null check (price > 0),
  -- O que é QUEIMADO na venda: o vendedor recebe `price - fee` (§7.7).
  -- Gravada na criação para o anúncio nunca mudar de taxa depois de no ar.
  fee         integer     not null check (fee >= 0),
  -- ativo | vendido | cancelado
  status      text        not null default 'ativo',
  buyer_id    text,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

-- A vitrine só mostra anúncio ativo, e é a consulta mais chamada do site.
create index if not exists listings_vitrine_idx
  on listings (status, created_at desc);

create index if not exists listings_vendedor_idx
  on listings (seller_id, created_at desc);

create index if not exists listings_comprador_idx
  on listings (buyer_id, closed_at desc);

commit;
