# Changelog

Registro das mudanças do palleira.com.br entregues em produção. Começa em 03/09/2026 — o que veio antes está nos commits e no `HANDOFF.md`.

Escrito para quem usa o site, não para quem mexe no código: ferramenta interna, sonda de investigação e correção de bug que ninguém chegou a ver ficam de fora, nos commits.

## 2026-09-25

- **Corrigido: booster sumia da página antes da hora.** Na última meia hora do ciclo, a página VIP dizia "Sem booster agora" com o servidor ainda turbinado. Agora ele aparece até o restart que de fato o desliga, e o horário "até ~" mostra esse restart.
- **Booster termina sempre num restart programado.** Se o servidor for reiniciado no meio do ciclo, o booster volta ligado e o tempo não se perde. Ligado perto de um restart, ele segue até o restart seguinte.
- **"Quem turbinou".** Embaixo dos servidores, a página VIP mostra quem colocou cada booster, onde, e se está ligado, na fila ou se já rodou.
- **Aviso no Discord quando o booster liga.** No restart em que um booster entra, o bot avisa todo mundo no 💬┇chat-geral, dizendo o que ficou em dobro, em qual servidor e quem colocou.
- **Confirmação antes do booster.** Antes de usar o booster do VIP ou de ir para o Pix, o site pergunta se é mesmo naquele servidor.

## 2026-09-24

- **Booster da comunidade.** Na página VIP, qualquer um pode doar R$ 5 para turbinar um servidor: XP, Drop de Pals (o que cai ao derrotar) e/ou Coleta (madeira, pedra, minério, plantas) em dobro, por 4 horas e para todo mundo que estiver jogando. O booster entra no próximo restart do servidor, e a página mostra quais servidores estão com booster e o que está na fila. Pedir com outro booster já ligado não empilha: o que faltar é acrescentado, o tipo que já estava ligado ganha mais 4 horas, e a taxa nunca passa do dobro. Quem tem cargo VIP no Discord ganha boosters para ativar de graça (1, 2 ou 4 por mês, conforme o plano) e vê quantos ainda tem. Cada um volta 30 dias depois de usado. Acabaram, é só doar outro.

- **"Seus personagens" no painel mostra os números de agora.** No servidor em que você está jogando, o level e a quantidade de Pals são os do momento, com o selo "Online". Nos outros servidores, valem os do último save lido. O PVE VIP aparece como "servidor desativado".
- **Corrigido: level do mundo antigo depois de um wipe.** Quem recomeçou num servidor continuava aparecendo com o level que tinha antes do wipe. Agora vale o level do personagem atual.

- **Entrar no site já te coloca no Discord da Palleira.** Quem ainda não está no servidor entra nele automaticamente ao fazer login com o Discord, sem precisar de convite. Só o servidor da Palleira, nenhum outro.

- **Home mais viva.** Nova lista "Jogando agora", com quem está conectado neste momento e o level de cada um. "Os melhores da Palleira" e os números da comunidade agora contam só os servidores ativos (o PVE VIP, que está sendo desligado, saiu da conta), mostram de qual servidor é cada jogador e marcam quem está online.

- **Mercado, VIP, Ranking, Mapa, Eventos e Painel agora são só para a comunidade.** Para ver essas páginas é preciso entrar com o Discord e estar no servidor da Palleira. Início, Servidores, Como jogar e Regras continuam abertos para quem ainda está conhecendo.

- **Itens do VIP chegam pelo site.** Moedas Cachorro, esferas, Núcleos de IA e os outros itens do jogo que o VIP dá agora vêm junto com a doação: aparecem na página VIP com o botão "Receber no jogo". É só entrar em um servidor e clicar, e os itens caem na mochila de onde você estiver jogando. Vêm uma vez por doação e ficam te esperando, sem prazo. Se a mochila estiver cheia, libere espaço e clique de novo: só o que faltou é enviado.

- **O site é só para quem está no Discord da Palleira.** Cofre, Câmara de Purificação, Kits, restauração de base e vínculo de personagem agora exigem estar no servidor do Discord, como já era com daily, Mercado e VIP. Quem sair do Discord perde o acesso em até 5 minutos, mas nada do que tem guardado some: ao voltar, está tudo lá.

## 2026-09-23

- **Corrigido: Pal que já tinha passado pela Câmara voltava com IV menor.** Um Pal já purificado (ex: 110) que entrava de novo pra continuar subindo era contado como se estivesse em 100 — e ao cancelar ou resgatar, saía com 100, perdendo o que já tinha ganho. Agora a purificação continua do IV que o Pal já tem, e nunca devolve abaixo disso.
- **Câmara de Purificação aceita Pal do cofre.** Além da palbox, dá para escolher um Pal que está no seu cofre de Pals do site — não precisa estar no jogo nem ter espaço na palbox. A regra de entrada é a mesma (IV 100 e rank 5), e ao resgatar o Pal volta no servidor de onde saiu.
- **Corrigido: Pal dado como entregue sem ter chegado.** Quando o jogo não respondia nada ao comando de entrega, o site contava como entregue. Agora isso fica como "sem resposta" e o Pal não se perde. O resgate também avisa antes, se a sua palbox e o seu time estiverem lotados.
- **Página VIP virou página de doação.** Deixa claro que é uma doação voluntária para manter os servidores, não uma compra, e o cargo VIP é o agradecimento, por 30 dias. Quando as doações forem ligadas, dá para doar por Pix pela própria página: confirmado o pagamento, o cargo e as Paletas chegam sozinhos. Doar de novo antes de acabar soma mais 30 dias.
- **Câmara de Purificação: alfa e comum agora contam como a mesma espécie para doar.** Purificando um Felbat alfa, os Felbats comuns da sua palbox também aparecem como doadores (e o contrário também vale). Antes, só alfa doava para alfa.
- **Aba nova no Mercado: Pals Monster.** Os Pals montados pela administração agora ficam numa vitrine da loja, ao lado dos Kits, e **valem para qualquer servidor** — quem joga no PVE Free compra igual a quem joga no Dominantes. Comprou, o Pal cai no seu cofre de Pals e você resgata na hora, onde estiver jogando. Alguns podem ter estoque limitado; o card mostra quantos restam.
- **Pal despertado volta a poder entrar na Câmara de Purificação**, a pedido de vocês. Ele aparece na lista com a etiqueta "Despertado", e antes de começar a Câmara avisa: **o despertar não volta** — ao resgatar ou cancelar, o Pal sai sem ele, e só dá para despertar de novo no jogo, com outro Cristal do Despertar. O botão só libera depois de marcar que entendeu.
- **Corrigido: resgatar o Pal purificado duas vezes seguidas.** Clicar em "Resgatar" de novo enquanto o primeiro ainda estava a caminho criava uma segunda entrega. Agora cada purificação resgata uma vez só.

## 2026-09-21

- **Câmara de Purificação ganhou uma explicação no topo da tela.** Agora dá pra ler o que é o sistema, como ele funciona e quais são os 4 requisitos pra doar um Pal, antes de mexer em qualquer coisa.
- **Passivas sugeridas da Câmara agora têm prazo de validade.** O staff escolhe por quanto tempo a sugestão vale (com contagem regressiva na tela) — passado o prazo, ela some sozinha em vez de continuar valendo pra sempre. O texto também ficou mais direto: "Passivas sugeridas para essa rodada" no lugar de "da última vez".
- Corrigido: depois de salvar a sugestão de passivas ou o IV mínimo de resgate (staff), o formulário ficava aberto — agora fecha sozinho.
- A Câmara de Purificação ficou em manutenção por algumas horas hoje enquanto essas mudanças eram testadas — já está de volta ao normal.
- Painel de Economia (staff) juntou "migrar saldo" e "ajustar saldo" numa tela só, com a lista de jogadores vinculados pra escolher em vez de colar o ID na mão.
- Nova tela **Entregar itens** (staff), separada da Moderação: dá pra entregar item avulso pra quem está online, ou montar um **kit de prêmio** salvo (ex: prêmio de evento) e reusar sempre que precisar, sem remontar a lista toda vez.
- **Corrigido — grave: cancelar a purificação podia perder o Pal de vez.** Cancelar só mudava o status na tela, mas o Pal já tinha saído da palbox desde que o ritual começou — sem nenhum caminho de volta, cancelar simplesmente o perdia, sem aviso nenhum disso. Foi assim que o Felbat do SantØs sumiu ao cancelar (já devolvido na mão). Agora cancelar manda o Pal para o seu cofre, com a mesma trava de tempo antes de poder resgatar — e o aviso, antes de confirmar o cancelamento, já diz quanto tempo é essa espera.
- **Pal que já despertou (Cristal do Despertar) não entra mais na Câmara.** O jogo não devolve o despertar de um Pal depois que ele passa pela Câmara de Purificação — testado e confirmado. Em vez de deixar entrar e o jogador perder isso sem saber, agora esse Pal nem aparece na lista pra escolher, e o aviso no topo explica o motivo.

## 2026-09-20

- **Corrigido: item recusado por mochila cheia sumia.** Quando o jogo negava a entrega porque não havia espaço livre na mochila, o site não entendia a recusa e dava a entrega por feita — o item não chegava e, no caso do cofre, também não voltava para lá. Agora a recusa é reconhecida: o item continua guardado no seu cofre e a tela avisa para abrir espaço antes de tentar de novo.
- **Comprar slot do cofre agora pede confirmação.** Antes, um toque no botão já descontava as Paletas — e dava para gastar sem querer, principalmente quando a aba aparecia embaixo do dedo. Agora o primeiro toque só arma a compra: o botão passa a dizer quanto vai sair do seu saldo e espera você confirmar, com um "Cancelar" do lado. Se você não confirmar em alguns segundos, ele volta sozinho ao normal. Vale para o cofre de itens e para o de Pals — nesse segundo o cuidado importa mais ainda, porque o preço dobra a cada slot.
- **Kits no Mercado.** Aba nova ao lado de Itens e Pals, com lotes montados pela cúpula — um pacote de itens por um preço em Paletas. Comprou, os itens caem na sua mochila **na hora**, dentro do jogo: não passa pelo cofre e não tem fila. Para isso você precisa estar conectado no servidor no momento da compra, porque o jogo entrega o item na mão do personagem. Kit não acaba: o mesmo pode ser comprado quantas vezes você quiser, por quantas pessoas quiserem. As Paletas pagas são queimadas, então o kit tira moeda de circulação em vez de passá-la para alguém. A busca do Mercado também acha kit pelo nome dos itens que tem dentro.
- **Staff pode entregar item direto para quem está no jogo**, escolhendo em uma grade com o ícone de cada item — sem digitar nome nenhum. Dá para mandar o mesmo lote para várias pessoas de uma vez, e o fundo de cada ícone mostra o grau do item (comum, incomum, raro, épico, lendário). Toda entrega fica registrada no log de auditoria.

## 2026-09-18

- Corrigido: o ranking do PVE Free mostrava os jogadores de antes do wipe, com os levels e a quantidade de Pals do mundo antigo. Agora mostra só quem está no mundo novo.
- Corrigido: no PVE Free, a lista de personagens da página de vincular aparecia vazia, e não dava pra vincular a conta. O servidor estava normal — o que tinha caído era a ponte que conta pro site quem está no jogo, desde a manutenção do dia 16. Ranking ao vivo e cofre do PVE Free também voltaram junto.
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
