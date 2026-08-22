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
create table if not exists account_links (
  discord_id    text        primary key,
  server_slug   text        not null,
  palworld_uid  text        not null,
  player_name   text        not null,
  linked_at     timestamptz not null default now(),
  unique (server_slug, palworld_uid)
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
  -- daily | doacao | venda | compra | taxa | ajuste | migracao | evento
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
