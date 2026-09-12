-- 015 — A contagem do anticheat sai da memória e vai para o banco
--
-- O `/api/anticheat` contava as detecções em `Map` na memória do processo.
-- A justificativa original era boa no papel — a janela é de 5 minutos e a
-- função fica quente entre chamadas seguidas —, mas ignora como a Vercel
-- de fato atende: várias instâncias em paralelo, e cada POST do PalDefender
-- pode cair numa diferente. Com o tráfego se dividindo, cada instância vê
-- um pedaço da rajada e **nenhuma chega ao limiar**.
--
-- Efeito medido em 12/09/2026: o 'VOID' acumulou 10 avisos de stamina em 24
-- segundos no Dominantes (ritmo de ~25/min, muito acima do limiar de 25 em
-- 5 min) e não levou aviso nem kick. O que devia ser ao vivo não era.
--
-- Três tabelas em vez de uma coluna de contador: a janela é deslizante, e
-- contar linha por timestamp é o que deixa "quantos nos últimos 5 minutos"
-- ser uma pergunta exata, sem depender de quando o contador foi zerado.
--
-- Idempotente: só `create table if not exists` e índice.

begin;

-- Uma linha por detecção que passou pelo filtro de `contaParaOGatilho`.
-- A limpeza das velhas acontece no próprio endpoint, a cada escrita.
create table if not exists anticheat_detections (
  id          bigserial primary key,
  server_slug text        not null,
  user_id     text        not null,
  -- 'dano' | 'stamina' — contados separado de propósito: somar os dois faria
  -- alguém com lag nos dois detectores passar sem ser cheater em nenhum.
  tipo        text        not null,
  nome        text        not null default '',
  created_at  timestamptz not null default now()
);

-- A consulta quente é sempre "deste jogador, deste tipo, nos últimos 5 min".
create index if not exists anticheat_detections_janela
  on anticheat_detections (server_slug, user_id, tipo, created_at desc);

-- Quem já levou o aviso e ainda está no prazo para desligar o cheat.
-- Uma linha por (servidor, jogador, tipo) — o aviso vale uma vez.
create table if not exists anticheat_warnings (
  server_slug text        not null,
  user_id     text        not null,
  tipo        text        not null,
  avisado_em  timestamptz not null default now(),
  primary key (server_slug, user_id, tipo)
);

-- Quem já foi kickado, para não repetir o kick pelos mesmos avisos enquanto
-- a pessoa não volta.
create table if not exists anticheat_kicks (
  server_slug text        not null,
  user_id     text        not null,
  tipo        text        not null,
  nome        text        not null default '',
  kickado_em  timestamptz not null default now(),
  primary key (server_slug, user_id, tipo)
);

commit;
