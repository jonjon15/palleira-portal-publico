# Changelog

Registro das mudanças do palleira.com.br entregues em produção. Começa em 03/09/2026 — o que veio antes está nos commits e no `HANDOFF.md`.

Escrito para quem usa o site, não para quem mexe no código: ferramenta interna, sonda de investigação e correção de bug que ninguém chegou a ver ficam de fora, nos commits.

## 2026-09-18

- **Anticheat do Dominantes fica mais rápido pra expulsar quem trapaceia.** Quem batia mais forte ou corria sem cansar em rajadas curtas, com pausas entre elas, conseguia ficar bastante tempo sem ser pego. Agora o aviso dispara bem mais cedo, e quem continuar depois dele é expulso em segundos, não minutos.
- Corrigido: pegar vários ovos seguidos na incubadora podia disparar aviso falso de "cheat de dano" — o anticheat agora só considera dano contra chefe/Ginásio ou outro jogador.

## 2026-09-16

- **Quem fica saindo e entrando pra resetar o spawn agora é pego sozinho, o tempo todo.** Antes alguém da staff precisava disparar a checagem na mão; agora ela roda por conta própria a cada 5 minutos, nos três servidores.

## 2026-09-14

- **Câmara de Purificação funciona de verdade, do início ao fim.** Escolha um Pal da sua palbox para entrar na cápsula (ele sai da palbox na hora), aguarde o staff liberar quais passivas os doadores precisam ter, e vá doando Pals (só da mesma espécie do que está na cápsula, IV 100 em Vida/Ataque/Defesa + Full Condensado + uma das passivas aceitas) até completar 4 — cada rodada soma +1 de IV, até o teto de 150. A partir de IV 110 (número que o staff pode mudar a qualquer momento, vale pra Câmara inteira) já dá para **resgatar o Pal purificado de volta pra palbox** — ele volta infértil, nunca entra em incubadora, é peça única da purificação.
- **Home mostra o Pal que está sendo purificado agora**, na cápsula da vitrine — antes era sempre uma cápsula vazia de exemplo.
- Staff agora define as passivas aceitas direto na tela da Câmara, sem precisar ir no admin.
- Corrigido: acessório e troféu apareciam misturados com passiva de Pal de verdade na lista de escolha do staff.
- Corrigido: o rank de estrelas do Pal (o que faz ele ficar "opaco" ou não na Câmara) usava um campo que o jogo sempre zera na entrega — agora usa o campo certo, que reflete o Full Condensado de verdade.
- Corrigido: selecionar vários Pals na tela de doação travava a aba por um instante a cada clique, numa palbox cheia.
- Corrigido: depois de doar um Pal, ele continuava aparecendo selecionável na lista mesmo já tendo saído da palbox — a tela agora atualiza sozinha.
- Corrigido: se o resgate do Pal purificado ficasse pelo meio do caminho (aba fechada, conexão caiu), ele ficava preso para sempre sem voltar pra palbox — a tela agora retoma o resgate sozinha ao recarregar.
- Corrigido: depois de resgatar o Pal de volta pra palbox, a cápsula continuava presa mostrando ele para sempre, sem opção de começar uma purificação nova.
- Corrigido: cancelar a purificação podia devolver o Pal pra palbox em vez de perdê-lo. Quem já tinha apertado "Resgatar" e cancelava antes do Pal chegar recebia ele de volta assim mesmo — e o resgate ainda ficava solto, voltando depois por cima de uma purificação nova, com o Pal errado. Agora, uma vez que o resgate começou, não dá mais para cancelar.
- Corrigido: na tela de escolher o Pal da cápsula, dava para deixar mais de um card aceso ao mesmo tempo depois de cancelar uma purificação sem recarregar a página.
- **Só aparecem na escolha os Pals que podem mesmo entrar na cápsula** — antes a palbox inteira era listada, com a maioria apagada e um aviso em vermelho embaixo de cada um.
- **Tela de entregar Pal manual (staff) ganhou campo de quantidade**, para mandar várias cópias de uma vez sem repetir o processo.
- Mais dois Pals na vitrine da Câmara de Purificação: Snow Tiger Beastman e Thunder Dragon Man já aparecem em 3D.

## 2026-09-13

- **Dominantes ganhou tabela própria no ranking geral**, em cima e com raça e elemento — igual à página dedicada. O ranking ordena por level, e como os PVE têm dois anos de vantagem, numa tabela só o Dominantes nem aparecia: as 25 primeiras linhas eram todas level 80 dos mundos antigos. Agora ele tem o próprio pódio, com raça e elemento de quem registrou no fórum, e mostra **todo mundo** — é servidor novo, ninguém corre risco de sumir da lista; PVE Free e PVE VIP continuam juntos na tabela de baixo, agora só com o **top 10 de cada**, que depois de dois anos de servidor é o que faz sentido mostrar de cara.
- **Número de um mundo aparecia na linha do outro**, no ranking geral. Quem joga em mais de um servidor via o mesmo level, os mesmos Pals e o mesmo poder repetidos nas duas linhas — o da Mari saiu igual no PVE Free e no PVE VIP. Cada mundo volta a mostrar o que é dele. O ranking do Dominantes nunca teve isso, por ser de um servidor só.
- **Quantos shiny cada um tem, no ranking.** Coluna nova na tabela, ordenável por clique como as outras: dá para ver de cara quem tem a coleção mais rara de cada mundo. Conta o time, a palbox e os que estão trabalhando nas bases. Como as colunas de Poder, o número só pode ser lido com a pessoa dentro do jogo — quem ainda não entrou aparece com um traço, e a tabela vai se preenchendo conforme o pessoal joga. O site também começou a guardar esse número dia a dia, o que no futuro permite mostrar quantos você ganhou no mês e o seu recorde.
- **Nomes em português no menu.** "Store" virou **Mercado** e "Placar" virou **Ranking**, no menu do topo e dentro das próprias páginas. A vitrine, que se chamava "Palleira Store", agora é **Mercado da Palleira**. Na tabela do ranking, a coluna "Soma lv" virou **Soma do Level**.
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
