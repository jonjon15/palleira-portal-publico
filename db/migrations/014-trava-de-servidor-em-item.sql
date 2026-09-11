-- 014 — Item guardado só troca com quem jogou no mesmo servidor
--
-- Mesmo problema que a migração 006 resolveu para Pal, agora para item: o
-- cofre de item (`vault_items`) e o mercado de item (`listings`) nunca
-- souberam de qual servidor o item veio. Cada Palworld roda sua própria
-- economia (§3.4) — deixar item circular entre servidores diferentes pelo
-- mercado do site é o mesmo furo que a 006 fechou para Pal, só que ainda
-- aberto aqui.
--
-- A cura é a mesma: a pilha lembra de qual servidor saiu (`server_slug`), e
-- só resgata e só é vendida para quem também joga nesse servidor. Igual ao
-- Pal, quem compra herda o servidor de origem de quem vendeu.
--
-- Diferente do Pal, a pilha agora precisa da chave primária incluindo
-- `server_slug` — o mesmo item pode existir em pilhas separadas por
-- servidor (500 balas do pve-free e 200 balas do pvp-free não se somam).
--
-- 🔴 Zerado por pedido explícito do dono em 11/09/2026: só ele tinha
-- item guardado e anúncio ativo até aqui (o servidor pvp-free/DOMINATIONS
-- abre hoje), então não há estoque de terceiros para migrar ou perder.
-- Não repetir este `delete`/`update` em produção depois que outros
-- jogadores tiverem itens guardados — nesse caso, a coluna nasceria nula
-- (sem trava) para o estoque antigo, do mesmo jeito que a 006 fez com Pal.
--
-- Idempotente pelas partes que dá pra ser (`if not exists`); o zerado em si
-- não é, de propósito — só deve rodar esta vez.

begin;

-- Cancela e esvazia ANTES de mexer na forma da tabela: mais simples do que
-- reconciliar linha por linha com uma coluna que ainda não existe.
update listings
   set status = 'cancelado', closed_at = now()
 where kind = 'item' and status = 'ativo';

delete from vault_items;

alter table vault_items drop constraint if exists vault_items_pkey;
alter table vault_items add column if not exists server_slug text not null default '';
alter table vault_items alter column server_slug drop default;
alter table vault_items add primary key (discord_id, item_id, server_slug);

alter table listings add column if not exists item_server_slug text;

commit;
