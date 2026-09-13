# Changelog

Registro das mudanças do palleira.com.br entregues em produção. Começa em 03/09/2026 — o que veio antes está nos commits e no `HANDOFF.md`.

Escrito para quem usa o site, não para quem mexe no código: ferramenta interna, sonda de investigação e correção de bug que ninguém chegou a ver ficam de fora, nos commits.

## 2026-09-13

- **Placar filtra por elemento.** As colunas Elemento Primário e Elemento Secundário ganharam filtro no próprio cabeçalho, e os dois combinam — dá para pedir "primário Grama e secundário Sombra" e ver só quem bate nos dois.
- Quem escreveu a raça como "Elfin" (e não "Elfien") passou a aparecer com o selo: era como a maioria daquela raça escrevia.
- O Poder de quem está offline voltou a mostrar o separador de milhar — aparecia "134644" no lugar de "134.644".

## 2026-09-12

- **Raça e elementos no placar do Dominantes**, ideia do Leo_Raposa. O registro que cada um faz no Discord agora aparece no site, com a cor da raça na linha e os ícones dos elementos tirados do próprio jogo.
- **Poder total da palbox no placar**, em três medidas: soma do HP, soma dos levels e soma dos IVs. Cada uma conta uma história diferente — quem tem bicho forte, quem tem bicho alto e quem tem bicho bom.
- O poder de quem está offline passou a ser guardado: quem já entrou no jogo desde hoje mantém o número na tabela, em cinza, em vez de traço.
- **O placar ordena por clique** em Level, Pals, Poder e nas somas.
- **Página de regras** (`/regras`) e **página de privacidade** (`/privacidade`), que estavam linkadas no rodapé de todas as páginas e davam erro 404. As regras vieram do texto real dos canais do Discord.
- **Eventos do Discord viram evento no site.** O que for anunciado com `@everyone` no canal de eventos aparece no mural sozinho, com o cartaz junto e assumindo o destaque da home.
- **VIP:** os cargos do Discord passaram a valer na hora. Quem comprava um plano depois de já estar logado continuava recebendo o daily de quem não tem plano — 2 Paletas em vez de 12 — e com um slot de cofre em vez de quatro. As Paletas que faltaram foram creditadas.
- **Sela pode ser vendida.** O jogo guarda sela fora da mochila, na aba de itens importantes, e por isso ela nunca aparecia na tela do cofre.
- **Cofre no Dominantes:** dizia "você não está no jogo agora" para quem estava — a lista de quem está conectado vinha atrasada em até um minuto.
- Cancelar um anúncio de Pal não zera mais o tempo de espera para resgatar: quem tinha cumprido cinco horas de cofre voltava para o começo da contagem.
- Anticheat passou a valer de verdade: a contagem de detecções agora é compartilhada, e o aviso e o kick saem em segundos.
- Painel de economia e de moderação voltaram a mostrar nomes em vez de números de conta.
- No cartão do vínculo, "provado" virou "aprovado".

## 2026-09-11

- **Ranking só do Dominantes**, separado dos servidores PvE.
- Quem está online aparece no ranking com o level e a contagem de Pals do momento, em vez do último save.
- Contas de administração saíram da lista de jogadores do ranking.
- **Item e Pal do Dominantes só trocam com quem joga lá** — pedido do dono, para o servidor competitivo não se misturar com a economia dos PvE.
- **Anticheat expulsa quem trapaceia**, com um aviso antes: quem desliga o programa depois do aviso não é expulso.
- Botões de ação do mural de eventos (publicar, arquivar, fixar) voltaram a funcionar.
- Nome do servidor no site passou a acompanhar o painel sozinho.

## 2026-09-07

- **Restauração de base paga pelo site** (`/painel/resgate`): o jogador pede a devolução da própria base, paga em Paletas e acompanha a fila, sem depender da administração.
- A administração ganhou a tela da fila de restauração, com estorno de pedido recusado.
- O preço da restauração passou a contar por guilda, e não por pessoa: com base em dois servidores, a segunda cobrava sem avisar.

## 2026-09-06

- O site acha o mundo sozinho quando um wipe troca a pasta do servidor.
- Busca de jogador no painel passou a achar quem escreve o nome espaçado (`C H R I S`).

## 2026-09-05

- **Devolução de base, de Pals e da mochila** perdidos por decay, direto pelo painel de moderação.
- **Página "Como funciona"** (`/como-funciona`): o site inteiro explicado em português.
- **Arquivo de bases:** cada base passou a ser guardada no banco todo dia, o que tornou a devolução possível sem depender do backup do jogo.
- Saída de emergência para reverter o mundo, caso uma restauração dê errado.

## 2026-09-04

- A administração ganhou o botão de zerar o contador de Dias do mundo.
- E o de wipe do mundo, com trava de confirmação.

## 2026-09-03

- Preço do slot extra do cofre (item e Pal) muda de novo: agora é 100, 200, e a partir do terceiro dobra (400, 800, 1600...) — pedido do dono.
