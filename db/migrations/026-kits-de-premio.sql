-- Kits de prêmio — lote de itens salvo para entregar DE GRAÇA, pela staff.
--
-- Pedido do dono em 21/09/2026: "Entregar itens manual" (app/admin/moderacao)
-- exigia remontar a lista de itens toda vez. Um kit de prêmio se monta uma
-- vez ("Prêmio do evento das Guitarras Elementais" = 3 itens) e fica salvo
-- para reusar em outra entrega.
--
-- Tabela PRÓPRIA, separada de `kits` (024-kits-da-loja.sql) — decisão do
-- dono, não reaproveitar a mesma tabela com um campo "à venda / só prêmio":
-- kit de prêmio nunca tem preço e nunca aparece no Mercado, e misturar os
-- dois usos numa tabela só criava a chance de um kit de prêmio vazar para a
-- vitrine por engano (ou vice-versa). A forma dos itens é a mesma
-- ([{ itemId, quantidade }]) de propósito — entra direto no mesmo motor de
-- entrega (`entregarItensParaJogadores`), sem tradução no meio.
--
-- Sem tabela de "compras" equivalente a `kit_purchases`: a entrega usa o
-- mesmo motor RCON síncrono de "Entregar itens manual" (resposta na hora,
-- sem fila), então não há nada assíncrono para rastrear — o resultado já
-- chega pronto na mesma resposta que confirma o envio.
--
-- Idempotente.

begin;

create table if not exists kits_premio (
  id          bigserial   primary key,
  nome        text        not null,
  descricao   text        not null default '',
  -- [{ itemId, quantidade }] — mesma forma de `kits.itens`.
  itens       jsonb       not null,
  -- Fora do ar não aparece na lista de entrega, mas fica salvo — é como
  -- "arquivar" um kit sem apagar o que já foi usado dele no passado.
  ativo       boolean     not null default true,
  criado_por  text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint kits_premio_itens_nao_vazio check (jsonb_array_length(itens) > 0)
);

create index if not exists kits_premio_lista_idx on kits_premio (ativo, created_at desc);

commit;
