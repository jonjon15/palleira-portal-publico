-- Itens do jogo que o VIP dá — entrega automática, pedido do dono em
-- 24/09/2026.
--
-- Até aqui a lista de benefícios era só texto: "1.000 moedas cachorro"
-- aparecia no card e ninguém entregava. Agora cada plano tem os itens de
-- verdade ([{ itemId, quantidade }], a mesma forma de `kits.itens`), e cada
-- doação copia a lista na hora — o dono pode mudar o plano depois, quem já
-- doou recebe o que estava prometido quando doou.
--
-- Uma vez por doação. O jogador resgata pelo site com o personagem online
-- (`giveitems` exige isso), no servidor em que estiver jogando.
--
-- Idempotente.

begin;

alter table vip_planos add column if not exists itens jsonb not null default '[]';

alter table vip_doacoes add column if not exists itens jsonb not null default '[]';
-- ItemIDs que já chegaram. Resgate que falha no meio (mochila cheia) pode
-- ser repetido sem duplicar o que já saiu.
alter table vip_doacoes add column if not exists itens_entregues jsonb not null default '[]';
-- 'pendente' → 'entregando' (trava contra clique duplo) → 'entregue'.
alter table vip_doacoes add column if not exists itens_status text not null default 'pendente';
alter table vip_doacoes add column if not exists itens_tentativa_em timestamptz;
alter table vip_doacoes add column if not exists itens_entregue_em timestamptz;
alter table vip_doacoes add column if not exists itens_server text;
alter table vip_doacoes add column if not exists itens_detail text not null default '';

-- Os itens que o texto já prometia e cujo ItemID é certo no catálogo. As
-- linhas correspondentes saem da lista de texto, senão apareceriam duas
-- vezes no card. "Cristais de prata" e "booster" ficam no texto: o ItemID
-- deles não foi identificado, o dono escolhe na grade em /admin/vip.
update vip_planos
   set itens = case key
         when 'hardMetal' then '[{"itemId":"DogCoin","quantidade":1000},{"itemId":"PalSphere_Ancient_1","quantidade":30},{"itemId":"PalSphere_Ancient_2","quantidade":20},{"itemId":"AIcore","quantidade":20}]'::jsonb
         when 'newMetal' then '[{"itemId":"DogCoin","quantidade":2000},{"itemId":"BattleTicket","quantidade":200},{"itemId":"BountyProof_1","quantidade":200},{"itemId":"PalSphere_Ancient_1","quantidade":50},{"itemId":"PalSphere_Ancient_2","quantidade":30},{"itemId":"AIcore","quantidade":30}]'::jsonb
         when 'palleira' then '[{"itemId":"DogCoin","quantidade":2500},{"itemId":"BattleTicket","quantidade":350},{"itemId":"BountyProof_1","quantidade":350},{"itemId":"PalSphere_Ancient_1","quantidade":80},{"itemId":"PalSphere_Ancient_2","quantidade":50},{"itemId":"AIcore","quantidade":50}]'::jsonb
       end,
       beneficios = coalesce((
         select jsonb_agg(b order by n)
           from jsonb_array_elements_text(beneficios) with ordinality as t(b, n)
          where b !~* '(moedas cachorro|bilhetes de batalha|provas de recompensa|esferas solar|esferas soral|esferas antigas|núcleos de ia)'
       ), '[]'::jsonb),
       updated_at = now()
 where key in ('hardMetal', 'newMetal', 'palleira')
   and itens = '[]'::jsonb;

commit;
