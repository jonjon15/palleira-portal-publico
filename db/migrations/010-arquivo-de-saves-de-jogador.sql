-- Arquivo dos saves individuais: `Players/<uid>.sav`, guardado fora do
-- servidor.
--
-- Complemento do 009. As bases estavam cobertas; o save individual não, e é
-- ele que guarda os ponteiros dos containers — mochila, Pal Box, party. Foi
-- justamente comparar VERSÕES desse arquivo que revelou, em 06/09/2026, que
-- o jogo tinha trocado os GUIDs de container do Tenshi e do Givaldo. Sem
-- histórico, esse diagnóstico teria sido impossível.
--
-- São arquivos pequenos: ~25 KB cada, 345 jogadores = 8,6 MB por versão de
-- servidor inteiro. Menos que a tabela de histórico diário que já existe.
--
-- Espaço fica sob controle por deduplicação, não por apagar histórico: o save
-- da maioria dos jogadores não muda de um dia para o outro, e versão idêntica
-- só avança o `seen_at` em vez de virar linha nova. Foi a ideia do dono —
-- "regravar em cima" — aplicada onde ela não custa segurança.

create table if not exists player_snapshots (
  id           bigserial   primary key,
  server_slug  text        not null,
  -- UID canônico do personagem: hex maiúsculo sem hífen
  palworld_uid text        not null,

  -- sha256 do arquivo. É por ele que se decide se há algo novo a guardar.
  sha256       text        not null,
  blob         bytea       not null,
  blob_bytes   integer     not null,

  -- Os seis GUIDs de container de item mais os dois de Pal, extraídos na
  -- hora de guardar. Ficam fora do blob para o site poder responder "os
  -- containers dele mudaram?" sem descomprimir nada — a pergunta que abriu
  -- o caso da bag perdida.
  containers   jsonb       not null default '{}',

  taken_at     timestamptz not null default now(),
  -- Última vez em que este mesmo conteúdo foi visto no servidor. Versão
  -- repetida atualiza esta coluna em vez de criar linha.
  seen_at      timestamptz not null default now()
);

create unique index if not exists player_snapshots_versao_idx
  on player_snapshots (server_slug, palworld_uid, sha256);

create index if not exists player_snapshots_recentes_idx
  on player_snapshots (server_slug, palworld_uid, taken_at desc);
