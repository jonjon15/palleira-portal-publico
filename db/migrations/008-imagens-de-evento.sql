-- 008 — Imagem de capa do evento, e uma galeria pra somar depois
--
-- Pedido direto do dono do site: faltava lugar pra imagem do evento, e ele
-- queria poder colocar mais fotos depois (campeões do evento, por exemplo)
-- sem precisar editar o post original.
--
-- Sem upload de arquivo — o projeto não guarda arquivo em lugar nenhum, e
-- criar armazenamento novo (Vercel Blob, S3...) é infraestrutura com custo
-- que não entra sem decisão do dono. Por isso as duas colunas são link: a
-- pessoa cola a URL de uma imagem que já está em algum lugar (Discord,
-- Imgur...), igual a como o site já faz com `public/marca/*`.

begin;

alter table events
  add column if not exists cover_image_url text;

create table if not exists event_images (
  id         bigserial   primary key,
  event_id   bigint      not null references events (id) on delete cascade,
  url        text        not null,
  caption    text        not null default '',
  -- Ordem de exibição na galeria — a pessoa que adiciona decide, não
  -- necessariamente a ordem de upload (a foto do campeão pode vir primeiro).
  position   integer     not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_images_evento_idx
  on event_images (event_id, position, id);

commit;
