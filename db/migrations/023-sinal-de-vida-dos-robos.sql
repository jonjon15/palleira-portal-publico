-- Sinal de vida dos processos que rodam fora do site (§ saúde, 18/09/2026).
--
-- Existe porque três coisas quebraram em silêncio na mesma semana e só foram
-- percebidas dias depois, por reclamação de jogador:
--
--   16/09  a REST do PalDefender do PVE Free caiu numa reinstalação
--   17/09  o GitHub Actions travou por cota estourada, parando o import
--   18/09  o ranking mostrava o mundo de antes do wipe, por causa do acima
--
-- Nenhuma dessas falhas gera erro visível: o servidor continua de pé e o site
-- continua servindo o último dado bom, que vai envelhecendo sem avisar. Uma
-- linha aqui por robô permite ao site dizer "faz 3h que ninguém escreve isto".
--
-- Uma linha por robô, sobrescrita a cada batida — não é histórico, é "quando
-- foi a última vez". O histórico de import já existe na tabela `imports`.

create table if not exists heartbeats (
  nome        text        primary key,   -- 'vigia-relog:pvp-free', 'import', …
  server_slug text,                      -- nulo quando não é por servidor
  visto_em    timestamptz not null default now(),
  detalhe     jsonb       not null default '{}'::jsonb
);
