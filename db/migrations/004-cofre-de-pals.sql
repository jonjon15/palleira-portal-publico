-- 004 — O cofre de Pals, e a entrega em dois passos
--
-- Por que Pal não é só mais uma linha em `vault_items`: um item é fungível
-- (500 balas são 500 balas, tanto faz quais); um Pal não é — cada um carrega
-- IVs, passivas e alma próprios. Por isso o cofre de Pals guarda **uma linha
-- por Pal**, com o template inteiro, em vez de somar quantidade numa pilha.
--
-- E por que a entrega precisa de duas fases: `givepal_j` e
-- `POST /give/paltemplate` não aceitam o JSON do Pal no corpo — só o NOME de
-- um arquivo que já precisa existir no servidor do jogo, em
-- `Pal/Binaries/Win64/PalDefender/Pals/Templates/`. Escrever esse arquivo é
-- SFTP, que a Vercel não fala; o GitHub Actions fala (§3.8: mesmo motivo do
-- editor de `Level.sav`). A ordem fica:
--
--   1. GitHub Actions escreve o arquivo por SFTP     (pal_transfers.status:
--                                                      aguardando_arquivo → arquivo_pronto)
--   2. a Vercel roda `givepal_j` por RCON, síncrono   (→ concluido)
--
-- Idempotente: `if not exists` em tudo. Rodar duas vezes não muda nada.

begin;

-- ------------------------------------------------------------- cofre de Pals
create table if not exists vault_pals (
  id           bigserial   primary key,
  discord_id   text        not null,
  -- PalID cru (`GhostDragon_Fire`), só para listar sem abrir o jsonb.
  pal_id       text        not null,
  -- O template pronto para virar arquivo — é literalmente o que
  -- `givepal_j`/`give/paltemplate` vão ler. Ver `lib/palworld/pal-template.ts`.
  template     jsonb       not null,
  imported_at  timestamptz not null default now()
);

create index if not exists vault_pals_dono_idx
  on vault_pals (discord_id, imported_at desc);

-- --------------------------------------------------- entrega em duas fases
create table if not exists pal_transfers (
  id            bigserial   primary key,
  discord_id    text        not null,
  server_slug   text        not null,
  palworld_uid  text        not null,
  template      jsonb       not null,
  -- Nome do arquivo em Pals/Templates/, sem `.json`. Inclui o próprio id da
  -- transferência — cada entrega escreve o seu, nunca reaproveita nome.
  arquivo       text        not null,
  -- aguardando_arquivo → arquivo_pronto → concluido
  --                                    ↘ falhou (SFTP recusou, ou RCON recusou)
  -- Sem resposta do RCON no fim: fica em arquivo_pronto mesmo — não dá para
  -- saber se entregou, e reenviar arriscaria duplicar o Pal. Fica para
  -- conferência manual (mesma disciplina de `vault_transfers`).
  status        text        not null default 'aguardando_arquivo',
  detail        text        not null default '',
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists pal_transfers_pendentes_idx
  on pal_transfers (status, created_at desc);

create index if not exists pal_transfers_pessoa_idx
  on pal_transfers (discord_id, created_at desc);

-- --------------------------------------------- listings aprende a vender Pal
-- Mesma tabela dos itens — a coluna `kind` já esperava por isso (§7.9). Um
-- anúncio de Pal carrega o template inteiro em vez de item_id/qty.
alter table listings alter column item_id drop not null;
alter table listings alter column qty      drop not null;
alter table listings add column if not exists pal_template jsonb;

-- A forma certa por tipo, garantida pelo banco: anúncio de item nunca fica
-- sem item_id/qty, anúncio de Pal nunca fica sem template, e nenhum dos dois
-- carrega os campos do outro.
alter table listings drop constraint if exists listings_kind_shape;
alter table listings add constraint listings_kind_shape check (
  (kind = 'item' and item_id is not null and qty is not null and pal_template is null)
  or
  (kind = 'pal'  and pal_template is not null and item_id is null and qty is null)
);

commit;
