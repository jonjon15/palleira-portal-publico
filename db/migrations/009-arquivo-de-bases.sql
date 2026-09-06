-- Arquivo de bases: a base de cada guild guardada fora do servidor.
--
-- Existe porque o servidor NÃO tem rede de segurança. A API do painel
-- responde `backup_count: 0` — o único backup é a pasta `backup/world/` do
-- próprio jogo, que rotaciona sozinha. Em 06/09/2026 só restavam os de 03 e
-- 04/09 mais os da última hora; a base de 22/08 que salvou o Tenshi existia
-- por sorte.
--
-- Com isto, recuperar uma base deixa de depender de o backup certo ainda
-- estar lá: o recorte fica aqui, e o jogador recupera quando quiser.
--
-- Tamanho medido em 06/09/2026: ~150 bytes por peça construída, gzip. A maior
-- base do pve-free (1.425 peças) ocupa 202 KB. As 20 bases do servidor cabem
-- em 2,5 MB — o banco inteiro tinha 11 MB nesse dia.

create table if not exists base_snapshots (
  id           bigserial   primary key,
  server_slug  text        not null,
  -- UUID da base (`BaseCampSaveData.key`), canônico: hex maiúsculo sem hífen
  base_id      text        not null,
  guild_id     text        not null default '',
  guild_name   text        not null default '',
  -- Membros da guild no momento do recorte. É por aqui que o site sabe a quem
  -- oferecer a recuperação — a guild pode ter sumido junto com a base.
  member_uids  text[]      not null default '{}',

  -- Onde a base estava, em coordenada de mundo. Guardado fora do blob para o
  -- site poder desenhar no mapa sem descomprimir nada.
  world_x      double precision not null,
  world_y      double precision not null,
  world_z      double precision not null,
  -- `area_range` do save: o raio da base. Serve para checar se o destino de
  -- uma mudança encosta em base alheia.
  area_range   double precision not null default 3500,

  piece_count  integer     not null,
  -- pickle do recorte {base, pecas}, comprimido com gzip. Ver
  -- tools/arquivar_bases.py.
  blob         bytea       not null,
  blob_bytes   integer     not null,
  -- Versão do formato do recorte. Se a lib de save mudar de forma, um número
  -- novo aqui evita tentar ler um pickle antigo com código novo.
  formato      integer     not null default 1,

  taken_at     timestamptz not null default now()
);

-- A consulta que o site faz: "as versões da base X, mais recente primeiro".
create index if not exists base_snapshots_base_idx
  on base_snapshots (server_slug, base_id, taken_at desc);

-- E a que responde "esse jogador tem base arquivada?" sem varrer tudo.
create index if not exists base_snapshots_membros_idx
  on base_snapshots using gin (member_uids);

-- Pedidos de recuperação feitos pelo próprio jogador (§ autoatendimento).
--
-- Fica em fila em vez de rodar na hora porque restaurar para o servidor por
-- alguns minutos: a fila é executada encaixada no restart que o painel já faz
-- às 01/06/11/16/21 UTC, e aí o tempo fora do ar é o que já ia acontecer.
create table if not exists base_restore_requests (
  id           bigserial   primary key,
  discord_id   text        not null,
  server_slug  text        not null,
  -- UID do personagem que vai receber a base de volta
  palworld_uid text        not null,
  snapshot_id  bigint      not null references base_snapshots (id),

  -- Destino escolhido. Sempre a posição onde o jogador estava no jogo no
  -- momento do pedido: o save não guarda o relevo do mundo, então a única
  -- altura confiável é a de um chão em que alguém está pisando.
  dest_x       double precision,
  dest_y       double precision,
  dest_z       double precision,

  -- 'fila' → esperando a janela | 'rodando' | 'feito' | 'recusado'
  status       text        not null default 'fila',
  paletas      integer     not null default 0,
  detail       text        not null default '',
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);

create index if not exists base_restore_fila_idx
  on base_restore_requests (server_slug, status, created_at);

-- Uma pessoa não fica com dois pedidos abertos ao mesmo tempo.
create unique index if not exists base_restore_um_aberto_idx
  on base_restore_requests (discord_id)
  where status in ('fila', 'rodando');
