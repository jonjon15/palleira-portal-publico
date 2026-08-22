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
