-- 007 — Mural de eventos
--
-- Um evento é uma linha só. `status` decide quem enxerga: rascunho só
-- aparece em /admin/eventos, para quem tem o cargo Criador de Evento (ou é
-- staff) escrever com calma antes de publicar. `pinned` decide o destaque —
-- o evento fixado é sempre o que aparece na home e no topo do mural; sem
-- fixado nenhum, é o publicado mais recente.
--
-- Sem tabela de comentário: o mural é aviso de mão única por enquanto. Dá
-- para somar resposta depois, se fizer falta.

begin;

create table if not exists events (
  id              bigserial   primary key,
  title           text        not null,
  slug            text        not null unique,
  body            text        not null default '',
  -- Um emoji só, pro cartaz não ficar sem nenhuma cara — nunca upload de
  -- imagem: o projeto não tem armazenamento de arquivo em lugar nenhum.
  cover_emoji     text,
  -- Servidor do evento, quando faz sentido amarrar a um só. Nulo = "todos".
  server_slug     text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text        not null default 'rascunho'
                    check (status in ('rascunho', 'publicado', 'arquivado')),
  pinned          boolean     not null default false,
  created_by      text        not null,
  created_by_name text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- O mural público: só publicado, fixado primeiro, depois o mais recente.
create index if not exists events_mural_idx
  on events (status, pinned desc, coalesce(starts_at, created_at) desc);

commit;
