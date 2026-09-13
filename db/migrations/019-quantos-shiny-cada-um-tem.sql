-- 019 — Quantos Pals shiny cada jogador tem, e a série histórica disso
--
-- Pedido do dono em 13/09/2026 para o ranking: mostrar quantos shiny a
-- pessoa tem.
--
-- ⚠️ O QUE ESTE NÚMERO É, E O QUE NÃO É
--
-- É "tem agora", não "capturou ao longo da vida". O jogo não guarda
-- histórico de captura em lugar nenhum: quem pegar 10 shiny e abater 9
-- aparece com 1, e os outros 9 não deixaram rastro no save, na API nem no
-- log. Não há de onde tirá-los — nem hoje, nem depois.
--
-- O que dá para fazer, e é o que esta migração monta, é começar a série
-- daqui para a frente: guardando quanto cada um tinha em cada dia, o site
-- passa a poder dizer "ganhou 3 shiny este mês" e mostrar evolução. Isso
-- vale do dia em que entrar no ar em diante, nunca para trás.
--
-- ---------------------------------------------------------------------
--
-- O número sai da MESMA resposta do PalDefender que já dá HP, level e IV,
-- então contar shiny não custa nem uma requisição a mais. E, como aquelas,
-- só pode ser lido com a pessoa NO JOGO — a palbox vive na memória do
-- servidor. Quem nunca entrar depois do deploy fica com traço.
--
-- Três coisas, por isso:
--
--   1. `players.poder_shiny` — quanto tem agora. Vale a mesma leitura da
--      017 e mora na mesma linha, carimbado pelo mesmo `poder_em`: é a
--      mesma leitura, no mesmo instante, e uma segunda coluna de data só
--      poderia discordar da primeira.
--
--   2. `player_daily.shiny` — a série, uma linha por jogador por dia, no
--      mesmo lugar onde `level` e `pal_count` já se guardam (§7.9). Nulo
--      nos dias anteriores a hoje, que passaram sem ninguém contando.
--
--   3. `players.shiny_recorde` — o maior número já visto. Sai de graça e
--      responde "qual foi o auge dele" sem varrer a série inteira.
--
-- Idempotente.

begin;

alter table players
  add column if not exists poder_shiny   integer,
  -- O maior valor já visto desta pessoa. Só sobe: shiny vendido ou
  -- abatido derruba `poder_shiny`, mas não apaga que ela já teve aquilo.
  add column if not exists shiny_recorde integer;

-- A série histórica. Fica junto de `level` e `pal_count` em vez de virar
-- tabela nova: é a mesma chave, o mesmo dia e a mesma pessoa — tabela
-- separada só multiplicaria linha e join para guardar um inteiro.
--
-- Nulo (e não zero) para todo dia anterior a esta migração: naqueles dias
-- ninguém contou, e registrar zero afirmaria que a pessoa não tinha
-- nenhum, que é coisa diferente de "não se sabe".
alter table player_daily
  add column if not exists shiny integer;

commit;
