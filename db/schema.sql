-- Palleira — schema mínimo do plano curto (§7.9 do PROMPT.md)
--
-- Só o necessário para o ranking completo: jogadores e guilds, alimentados
-- pelo import do save. Carteira, ledger e marketplace entram junto com o
-- login do Discord.
--
-- Disciplina de espaço (Neon grátis = 0,5 GB): guardar ESTADO ATUAL, não
-- histórico bruto. Um snapshot completo a cada 5 min viraria milhões de
-- linhas por ano. O que interessa é "como está agora" + um agregado diário.

-- ---------------------------------------------------------------- guilds
create table if not exists guilds (
  server_slug   text        not null,
  guild_id      text        not null,
  name          text        not null,
  base_count    integer     not null default 0,
  pal_count     integer     not null default 0,
  member_count  integer     not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (server_slug, guild_id)
);

create index if not exists guilds_rank_idx
  on guilds (pal_count desc, base_count desc);

-- -------------------------------------------------------------- jogadores
create table if not exists players (
  server_slug    text        not null,
  -- UID do Palworld COM prefixo: steam_… / gdk_… / ps5_… (§3.5).
  -- Nunca validar como Steam64: a comunidade é cross-platform.
  palworld_uid   text        not null,
  name           text        not null default '',
  level          integer     not null default 0,
  platform       text        not null default 'desconhecida',
  guild_id       text,
  pal_count      integer     not null default 0,
  -- Última vez que o jogador apareceu online numa coleta
  last_online_at timestamptz,
  -- Última vez que os dados dele foram atualizados por qualquer fonte
  updated_at     timestamptz not null default now(),
  primary key (server_slug, palworld_uid)
);

create index if not exists players_rank_idx
  on players (level desc, pal_count desc);

create index if not exists players_guild_idx
  on players (server_slug, guild_id);

-- ------------------------------------------------- histórico enxuto (1/dia)
-- Uma linha por jogador por dia, só para o gráfico de evolução. Com 400
-- jogadores dá ~146 mil linhas por ano — cabe folgado.
create table if not exists player_daily (
  server_slug  text    not null,
  palworld_uid text    not null,
  day          date    not null,
  level        integer not null,
  pal_count    integer not null default 0,
  primary key (server_slug, palworld_uid, day)
);

-- ------------------------------------------------------------ auditoria
-- Toda execução do robô fica registrada: o que rodou, quanto trouxe, e o
-- erro quando falha. Sem isso, import quebrado passa despercebido.
create table if not exists imports (
  id           bigserial   primary key,
  server_slug  text        not null,
  source       text        not null,          -- 'save' | 'api'
  ok           boolean     not null,
  message      text,
  stats        jsonb       not null default '{}'::jsonb,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);

create index if not exists imports_recent_idx
  on imports (created_at desc);

-- ------------------------------------------------ vínculo Discord ↔ jogo
-- §4.2: a conta do Discord é a identidade mestre. Um personagem só pode
-- estar ligado a um Discord, e vice-versa — senão vira porta para lavar
-- item entre contas.
--
-- 🔴 O vínculo é GLOBAL, não por servidor. Medido em 22/08/2026: o
-- `palworld_uid` é da conta e não muda de mundo para mundo — DEMON é
-- `058C8A05…` nos três servidores. Por isso o UID é único na tabela inteira:
-- se fosse único só por servidor, dois Discords poderiam reivindicar a mesma
-- pessoa em servidores diferentes.
--
-- ⚠️ `palworld_uid` guarda o formato CANÔNICO: hex maiúsculo, sem hífen — o
-- mesmo de `players`. O PalDefender devolve com hífen e a conversão acontece
-- em `lib/palworld/uid.ts`, na borda. Se as duas formas circularem juntas, o
-- cruzamento entre save e API para de encontrar as pessoas, em silêncio.
create table if not exists account_links (
  discord_id    text        primary key,
  -- Onde e com que nome o código foi provado. É registro de origem, não
  -- limite de alcance: o vínculo vale nos três servidores.
  server_slug   text        not null,
  palworld_uid  text        not null unique,
  player_name   text        not null,
  linked_at     timestamptz not null default now()
);

-- Códigos de 6 dígitos entregues DENTRO DO JOGO. Quem não está com o
-- personagem na mão não vê o código.
create table if not exists link_codes (
  code          text        primary key,
  discord_id    text        not null,
  server_slug   text        not null,
  palworld_uid  text        not null,
  player_name   text        not null,
  attempts      integer     not null default 0,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists link_codes_discord_idx on link_codes (discord_id);
create index if not exists link_codes_expira_idx  on link_codes (expires_at);

-- ------------------------------------------------------- carteira (§7.8)
-- Regra não negociável: **saldo é sempre a soma do extrato**, nunca um campo
-- que alguém edita. Não existe UPDATE de saldo em lugar nenhum — só INSERT
-- de linha nova. Assim todo centavo tem origem rastreável.
--
-- `balance_after` é redundante de propósito: é a testemunha de qual era o
-- saldo no instante daquela linha. Se um dia a soma não bater com ele, houve
-- escrita fora do caminho — e dá para achar exatamente onde.
create table if not exists ledger (
  id              bigserial   primary key,
  discord_id      text        not null,
  -- Paleta é SEMPRE inteira (§7.1). Nada de decimal aqui, nunca.
  delta           integer     not null,
  balance_after   integer     not null,
  -- daily | doacao | venda | compra | taxa | slot | slotPal | ajuste | migracao | evento
  kind            text        not null,
  descricao       text        not null default '',
  -- Aponta para o anúncio, a ordem ou a doação que gerou a linha
  ref_id          text,
  -- Clique duplo, retry de rede e webhook repetido não podem virar duas
  -- transações. A chave única é o que garante isso (§7.8).
  idempotency_key text        not null unique,
  -- Só preenchido em ajuste de admin: quem mexeu no saldo de quem
  actor_id        text,
  created_at      timestamptz not null default now()
);

create index if not exists ledger_extrato_idx
  on ledger (discord_id, created_at desc, id desc);

-- --------------------------------------------- moderação no jogo (§5.3)
-- Toda ação do painel admin (kick, ban, unban, save, shutdown, anúncio)
-- fica registrada: quem mandou, em qual servidor, e se deu certo. Sem isso,
-- um ban indevido não tem como ser rastreado até a pessoa.
create table if not exists admin_actions (
  id          bigserial   primary key,
  -- ID do Discord de quem executou a ação
  actor_id    text        not null,
  server_slug text        not null,
  -- broadcast | kick | ban | unban | save | shutdown
  action      text        not null,
  -- userId do jogador (steam_… / gdk_… / ps5_…), quando a ação mira alguém
  target      text,
  -- mensagem do anúncio, motivo do ban, ou texto do shutdown
  detail      text        not null default '',
  ok          boolean     not null,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists admin_actions_recent_idx
  on admin_actions (created_at desc);

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
  -- `>= 0` e não `> 0`: o débito é uma instrução só (é ela que trava a
  -- corrida) e sacar a pilha inteira passa por zero no caminho. A linha
  -- zerada é apagada logo depois — ver `db/migrations/003`.
  qty         integer     not null check (qty >= 0),
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
  -- item_id/qty preenchidos quando kind='item'; pal_template quando
  -- kind='pal' — nunca os dois, nunca nenhum (checado abaixo).
  item_id      text,
  qty          integer     check (qty > 0),
  pal_template jsonb,
  -- O que o comprador paga
  price       integer     not null check (price > 0),
  -- O que é QUEIMADO na venda: o vendedor recebe `price - fee` (§7.7).
  -- Gravada na criação para o anúncio nunca mudar de taxa depois de no ar.
  fee         integer     not null check (fee >= 0),
  -- ativo | vendido | cancelado
  status      text        not null default 'ativo',
  buyer_id    text,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  -- Só quando kind='pal': o servidor de onde o vendedor tirou o Pal (vem de
  -- `vault_pals.server_slug`). Migração 006 — atravessa para o comprador.
  pal_server_slug text,

  constraint listings_kind_shape check (
    (kind = 'item' and item_id is not null and qty is not null and pal_template is null)
    or
    (kind = 'pal'  and pal_template is not null and item_id is null and qty is null)
  )
);

-- A vitrine só mostra anúncio ativo, e é a consulta mais chamada do site.
create index if not exists listings_vitrine_idx
  on listings (status, created_at desc);

create index if not exists listings_vendedor_idx
  on listings (seller_id, created_at desc);

create index if not exists listings_comprador_idx
  on listings (buyer_id, closed_at desc);

-- ------------------------------------------------------------ cofre de Pals
-- Um Pal não é fungível como item: cada um carrega IVs, passivas e alma
-- próprios. Uma linha por Pal, com o template inteiro — ver migração 004.
create table if not exists vault_pals (
  id           bigserial   primary key,
  discord_id   text        not null,
  pal_id       text        not null,
  template     jsonb       not null,
  imported_at  timestamptz not null default now(),
  -- De qual servidor este Pal saiu. Nulo = veio de antes da migração 006
  -- (ou de `semearPalDeTeste`, que nunca passa pelo jogo) — sem trava de
  -- servidor nesses casos. Quando preenchido, o resgate só pode voltar
  -- para este mesmo servidor (ver `iniciarResgateDePal`).
  server_slug  text
);

create index if not exists vault_pals_dono_idx
  on vault_pals (discord_id, imported_at desc);

-- --------------------------------------------------- entrega em duas fases
-- `givepal_j` e `give/paltemplate` só aceitam NOME DE ARQUIVO, já existente
-- no servidor do jogo. O GitHub Actions escreve por SFTP (aguardando_arquivo
-- → arquivo_pronto); a Vercel entrega por RCON, síncrono (→ concluido).
create table if not exists pal_transfers (
  id            bigserial   primary key,
  discord_id    text        not null,
  server_slug   text        not null,
  palworld_uid  text        not null,
  template      jsonb       not null,
  -- importar | resgatar (migração 005 — a mesma tabela audita as duas)
  direction     text        not null default 'resgatar',
  -- Nome do arquivo em Pals/Templates/, sem `.json`. Só existe em
  -- 'resgatar' — importar não passa por SFTP nenhum.
  arquivo       text,
  -- resgatar: aguardando_arquivo → arquivo_pronto → concluido / falhou
  -- importar: andando → concluido / falhou (igual a vault_transfers)
  status        text        not null default 'aguardando_arquivo',
  detail        text        not null default '',
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists pal_transfers_pendentes_idx
  on pal_transfers (status, created_at desc);

create index if not exists pal_transfers_pessoa_idx
  on pal_transfers (discord_id, created_at desc);

