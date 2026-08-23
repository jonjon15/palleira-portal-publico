-- 003 — A pilha do cofre precisa poder chegar a zero
--
-- O `check (qty > 0)` da migração 002 parecia certo — pilha vazia não é
-- pilha — mas quebra o caso mais comum de todos: **sacar tudo**.
--
-- O débito é feito numa instrução só, porque é ela que trava a corrida:
--
--   update vault_items set qty = qty - $n
--    where discord_id = $1 and item_id = $2 and qty >= $n
--
-- Quando `$n` é a pilha inteira, o resultado é 0 e o `check` derruba a
-- operação com erro de banco. Na prática: ninguém conseguiria resgatar o
-- último item nem anunciar o lote fechado.
--
-- Trocar por `qty >= 0` mantém a instrução atômica e a linha zerada é
-- apagada logo em seguida. Enquanto ela existir, conta como slot ocupado —
-- erra para o lado seguro, nunca a favor de quem está sacando.
--
-- Encontrado testando concorrência contra o banco em 23/08/2026, antes de
-- qualquer jogador ver a tela.

begin;

alter table vault_items drop constraint if exists vault_items_qty_check;
alter table vault_items add  constraint vault_items_qty_check check (qty >= 0);

-- Linha zerada que tenha sobrado de um processo interrompido não deve
-- ocupar slot de ninguém.
delete from vault_items where qty = 0;

commit;
