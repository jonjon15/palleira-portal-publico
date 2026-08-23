# Passagem de bastão — palleira.com.br

> Escrito em 22/08/2026. Serve para abrir um chat novo sem perder o fio.
> Leia junto com o **`PROMPT.md`**, que é a especificação e guarda o *porquê*
> de cada decisão. Este arquivo guarda o **estado de hoje** e o que vem depois.

---

## 1. O que é

Portal da comunidade **Palleira BR** (Palworld, servidores brasileiros).
Login só pelo Discord, carteira da moeda da comunidade (**Paletas**), placar
com jogador offline, mapa ao vivo e — o objetivo final — um **mercado onde o
jogador vende Pal e item por Paletas**. O mercado de **itens** está de pé
desde 23/08; o de **Pals** é o próximo passo.

- **Produção:** https://palleira.com.br ✅ **no ar desde 23/08** — o DNS foi
  apontado e o domínio serve o portal novo, com HTTPS e redirect de HTTP.
  O `palleira.vercel.app` continua respondendo.
  ⚠️ O `www` **serve direto** em vez de redirecionar para o apex, ao
  contrário do que a §11.1 do PROMPT combinou. São duas URLs com o mesmo
  conteúdo — arrumar na Vercel, em Domains.
- **Repositório:** `jonjon15/palleira-portal` (privado)
- **Dono:** Jonjon — `jonjon7D` no Discord, `ADM_JONJON` no jogo,
  Discord ID `882283198518804500`

---

## 2. Stack e armadilhas do build

| | |
|---|---|
| Framework | Next.js **15.5.23** (App Router) + React 19 + Tailwind v4 |
| Banco | Neon Postgres (integração da Vercel injeta `DATABASE_URL`) |
| Login | Auth.js v5 (`next-auth@beta`), provider Discord, sessão JWT |
| Deploy | `npx vercel --prod --yes` |

**Três coisas que já custaram tempo — não repetir:**

1. **Não subir para o Next 16.** O deploy quebra com
   `_global-error.segments/__PAGE__.segment.rsc.func ENOENT`.
2. **O build usa Turbopack** (`next build --turbopack`). O webpack derruba o
   build na Vercel de vez em quando com um crash no WasmHash.
3. **`engines.node: "22.x"`** no `package.json`. No 24 o crash acima volta.
   ⚠️ O projeto na Vercel está configurado em **24.x** — quem manda hoje é o
   `engines` do `package.json`, e é só por isso que o build passa. Tirar
   aquela linha derruba o deploy sem aviso.

O build local falha ao buscar o Geist no Google Fonts (coisa da rede daqui, o
`curl` no mesmo endereço responde 200). **Na Vercel funciona** — validar com
`npx tsc --noEmit` aqui e deixar o build de verdade para o deploy.

---

## 3. Os três servidores

Host, portas e slugs vivem em [`lib/servers.ts`](lib/servers.ts).
**Senhas e tokens só no `.env.local` e no `vercel env`** — nunca no banco,
nunca no código.

| Slug | Servidor | RCON | No mapa? |
|---|---|---|---|
| `pve-free` | [BR] Palleira PVE FREE | ✅ ligado | ✅ |
| `pve-vip` | [BR] Palleira PVE VIP | ✅ ligado | ✅ |
| `pvp-free` | [BR] Palleira PVP FREE NEW | ⛔ **desligado** | 🔴 **NUNCA** |

**Três fontes de dado, cada uma com seu limite:**

- **REST oficial do Palworld** — só enxerga quem está online.
- **PalDefender REST** — enxerga **jogador offline**, guilds e bases. É a
  fonte mais rica. `/pals` e `/items` só respondem com o jogador online, o que
  é a razão do modelo de cofre da §7.3.
- **RCON** — o único jeito de **agir** dentro do jogo (mandar mensagem,
  entregar item). É por ele que o código de vínculo chega ao jogador.

---

## 4. Regras que não se quebram

Vieram do Jonjon e valem para tudo que for construído daqui para frente.

- 🔴 **IP de jogador nunca sai do site.** O PalDefender devolve o IP no
  payload; ele **morre dentro de [`lib/palworld/paldefender.ts`](lib/palworld/paldefender.ts)**.
  Nada que sai daquele arquivo carrega endereço de ninguém.
- 🔴 **O PvP não aparece no mapa.** Nem jogador, nem base. Mostrar posição ali
  é entregar alvo de raide. Use `mappableServers()`, nunca `activeServers()`,
  em qualquer coisa com coordenada.
- 🔴 **O IP e a porta dos servidores não aparecem em página pública.** Quem
  quiser entrar procura "Palleira" na lista de dedicados dentro do jogo.
- 🔴 **Nada do portal concorrente** — nome, endereço, autor ou estética
  parecida. Nem uma citação.
- 🟡 **Paleta é sempre inteira.** Nunca decimal, nunca float.
- 🟡 **Ler a fonte antes de chutar.** Já se perdeu meio dia inventando
  formato de dado em vez de abrir o arquivo que descrevia o formato.
- 🟡 **`Status: "Online"` do PalDefender não prova nada.** Quem está mesmo
  no jogo tem `UserId` preenchido; fantasma vem com `UserId` e `IP` vazios.
  Medido em 23/08 nos três servidores, sem uma exceção. Já está tratado na
  borda (`paldefender.ts`), mas vale saber ao ler qualquer coisa da API.

---

## 5. O que já funciona

| Rota | Estado |
|---|---|
| `/` | Home com servidores ao vivo, estatísticas e top 5 |
| `/servidores` `/conectar` | Prontas |
| `/ranking` | Placar completo, **inclui jogador offline** (vem do save) |
| `/mapa` | Bases e jogadores ao vivo sobre o mapa de Palpagos, calibrado |
| `/entrar` `/painel` | Login pelo Discord com cargos e planos |
| `/vincular` | ✅ **Vínculo do personagem** |
| `/painel/carteira` | ✅ **Carteira + extrato + daily** |
| `/admin/economia` | ✅ **Migração do Palbot, ajuste e circulação** |
| `/painel/cofre` | ✅ **Cofre**: guardar item do jogo, resgatar, comprar slot |
| `/painel/anuncios` | ✅ **Meus anúncios** e minhas compras |
| `/mercado` | ✅ **Mercado de itens** — vitrine, compra e venda |
| `/mercado/vender` | ✅ Anunciar o que está no cofre |

### O vínculo de personagem — como funciona

O site manda um código de 6 dígitos **dentro do jogo**, por RCON
(`send msg <uid> <mensagem>`), e a pessoa digita de volta no site. É prova que
não dá para forjar: precisaria do Discord **e** do personagem da vítima ao
mesmo tempo.

Provado que é direcionado: com UID inválido o comando responde
*"Failed to find player by UserId"*. Testado ponta a ponta com o `jonjon7D`.

Código em [`lib/linking.ts`](lib/linking.ts). Vale 10 minutos, 5 tentativas,
**uma conta de jogo por Discord e vice-versa**.

📌 **O vínculo vale nos três servidores.** Medido em 22/08: o `palworld_uid` é
da conta e não muda de mundo — o dono é o mesmo `AA7C26DC…` como `jonjon7D` no
VIP e como `ADM_JONJON` no Free, e 86 dos 324 UIDs do banco aparecem em mais de
um servidor. Prova num servidor, reconhecido em todos. O detalhe inteiro, com o
que o diagnóstico anterior errou, está na **§11.2 do PROMPT.md**.

> ⚠️ Só funciona nos PvE. Quem joga **só no PvP não consegue vincular** até o
> `RCONEnabled=True` ser ligado lá.

### A carteira

A decisão da §7.1 foi a **opção C: o site é dono da economia**. O Palbot
hospedado não tem API pública — o "API Tester" do painel dele só testa as
credenciais do *servidor Palworld*, não expõe nada do bot.

Duas regras no [`lib/economia.ts`](lib/economia.ts):

1. **Saldo é a soma do extrato.** Não existe `UPDATE` de saldo em lugar
   nenhum. Toda mudança é uma linha nova com origem registrada.
2. **Toda operação tem chave de idempotência.** Clique duplo, retry e webhook
   repetido não viram duas transações.

O lançamento é **uma instrução SQL só** (lê o saldo, soma e grava, com
`where saldo + delta >= 0`). Testado: 5 compras simultâneas com 1 Paleta na
conta → exatamente uma passou.

- **Daily:** 2 Paletas, uma por dia, vira à meia-noite de Brasília.
- **Daily exige personagem vinculado** — senão conta descartável de Discord
  vira torneira e a calibração inteira da moeda vai por água abaixo.

### O cofre e o mercado — 23/08

**O problema que o cofre resolve:** `/items/{uid}` do PalDefender só
responde com o jogador **online**. Se o anúncio lesse o inventário na hora
da venda, ninguém compraria de madrugada e toda transação exigiria as duas
pessoas no jogo ao mesmo tempo.

```
JOGO ──guardar──▶ COFRE ──anunciar──▶ COMPRADOR ──resgatar──▶ JOGO
       (online)                                     (online)
```

Só as pontas exigem o jogo aberto. **A compra e a venda acontecem inteiras
dentro do site**, com os dois lados offline.

- **Um slot = um tipo de item**, não uma unidade. 500 balas ocupam um slot;
  somar a uma pilha existente é de graça. 3 slots grátis, e do 4º em diante
  o preço dobra: 15 · 30 · 60 · 120. É o **sink principal** da economia.
- **Taxa em degraus, queimada:** 1 até 20 Paletas, 2 até 50, 4 até 100, 5%
  acima disso. Percentual puro não funciona nesta moeda — 5% de 10 Paletas
  arredonda para zero e o sink some justo onde há mais volume.
- **Só a mochila entra no cofre.** A API traz seis compartimentos, mas
  equipamento em uso e item-chave não são coisa para vender sem querer.
- **`Money` (Ouro) e item de uso individual não entram no mercado** — o
  Ouro nasce de drop, e câmbio Ouro↔Paleta derrubaria a moeda em uma semana.

**A trava que dá segurança:** toda transferência grava a intenção em
`vault_transfers` **antes** de tocar no jogo, com a resposta crua do RCON ao
lado. Se a conexão cair no meio, a linha fica em `andando` — a verdade — em
vez de o site adivinhar. No resgate, resposta perdida **não** devolve o item
ao cofre: devolver criaria uma segunda cópia.

⚠️ **Um bug achado testando, que valeu a viagem:** a tabela nasceu com
`check (qty > 0)`, o que parecia certo — e quebrava o caso mais comum de
todos. Sacar a pilha inteira passa por zero antes de a linha ser apagada, e
o banco derrubava a operação. Ninguém conseguiria resgatar o último item nem
anunciar o lote fechado. Corrigido na migração `003`.

⚠️ **Publicar anúncio ficava com o card sumido até sair e entrar de novo.**
Publicar acontece em `/mercado/vender`, e navegar dali para `/mercado` por
um `<Link>` comum às vezes mostrava a versão que o cache de rotas do Next
tinha guardado antes do anúncio existir — só uma navegação de verdade (F5,
o reload do login) forçava buscar de novo. `acaoAnunciar` agora chama
`redirect("/mercado")` quando dá certo, o que força uma renderização nova.
Comprar e cancelar não tinham esse problema — acontecem na mesma página
onde o botão está.

### Os Pals em 3D, e o cofre de Pal — 23/08

O Jonjon trouxe um projeto de código aberto,
[Palworld Save Pal](https://github.com/PalworldSavePal/palworld-save-pal),
que já vem com **324 modelos 3D** dos Pals extraídos do jogo (glTF, ~33 MB
no total). Copiados para `public/models/pals/` — a licença GPL do projeto
cobre o código dele, não a arte da Pocketpair, e o site escreve o próprio
visualizador (`components/pal-3d.tsx`, com `three.js`) e serve tudo do
próprio domínio.

**Cobertura medida contra os dois PVE:** 1.504 dos 1.536 personagens vivos
têm modelo 3D (97,9%) — as 32 exceções são NPC humano do **mundo**
(mercador parado na cidade), não Pal.

📌 **NPC *capturado* por um jogador é outra história — decisão do dono em
23/08:** se aparecer no time/palbox de alguém, vende como qualquer Pal.
Nada no código bloqueia por `PalID`; só não vai ter ícone (o pacote de
assets não cobre esses) e a tela mostra "sem ícone" sem travar nada.

**Achado depois, no mesmo projeto: também tem ícone 2D** — 296 arquivos em
`ui/src/lib/assets/img/t_<pal>_icon_normal.webp`, ~8 KB cada. Copiados para
`public/icons/pals/`, filtrados para só entrar quem bate com uma chave real
de Pal (a pasta original mistura ícone de interface — "attack", "capture" —
junto). Cobertura: 1.483/1.517 personagens (97,8%), mesma exceção dos NPCs
de mundo. Isso é o que virou o cartão em `components/pal-card.tsx` — ícone,
nível, barrinha de IV e passivas, usado no cofre inteiro. `paldeck.cc/npcs`
tem ícone dos NPCs que faltam, mas sem licença de reuso declarada — fica em
aberto, mesma cesta do catálogo completo (§7.4 do PROMPT).

**E o catálogo de item, que já estava pendente há dois dias, também estava
ali** — `data/json/items.json`: **2.372 itens, 2.320 com nome em português
e 2.365 com ícone**, mais **421 passivas de Pal traduzidas**
(`data/json/l10n/pt-BR/passive_skills.json`). A ficha de Pal mostrava
`TrainerDEF_UP_1`; agora mostra "Estrategista Inabalável". `lib/itens.ts`
foi reescrito para usar isso — categoria vem do próprio jogo (`type_a`),
não mais de prefixo de `ItemID` chutado. Ícone entrou em toda tela que lista
item: mercado, cofre, anúncios. Regra de sempre sem mudar: item fora do
dataset mostra a chave, nunca um nome inventado.

**E o catálogo de espécie e de habilidade, achados na mesma varredura** —
`data/json/pals.json` (**409 espécies**: nome de exibição, descrição de
bestiário, tipo elemental com ícone, número da Paldex) e
`data/json/l10n/pt-BR/active_skills.json` (**326 habilidades ativas**
traduzidas, com o que cada uma faz). `nomeDoPal("OctopusGirl")` devolvia o
`PalID` cru; agora devolve **"Gloopie"**, com elemento Água/Escuridão e a
descrição de bestiário — a ficha ficou de pé para o lado do que os
concorrentes mostram.

⚠️ **Achado ao integrar: as habilidades ativas guardam a chave com um
prefixo de enum** (`EPalWazaID::FlareTornado`), que os outros catálogos não
têm. Testar contra dado real de novo (`FlareTornado`/`DarkWave`/`GhostFlame`,
vistos no `HadesBird` da Bonato em 23/08) pegou isso antes de subir — sem o
teste, toda habilidade ativa teria caído no fallback "mostra a chave crua"
silenciosamente.

📌 **Inventário fechado da pasta `data/json/` daquele projeto** — para não
ter mais rodada de "achei mais uma coisa": tem também `breeding*.json`
(~3,6 MB, calculadora de cruzamento), `buildings.json` +
`*_meshes.json` (editor de base), `technologies.json` +
`lab_research.json` (árvore tecnológica), `missions.json` (quests),
`dungeons.json`/`towers.json`/`relics.json`/`fast_travel_points.json`
(pontos de mapa) e `presets.json` (é da própria interface daquele app, não
é dado de jogo). **Nenhum disso serve ao que a Palleira constrói hoje**
(marketplace e cofre) — fica registrado que foi olhado e descartado de
propósito, não esquecido.

**Ajustes no visualizador 3D, pedidos olhando a tela de verdade:**

1. **A luz estava escura demais** — o Pal renderizava quase preto contra
   qualquer fundo, comparado ao render claro e colorido do Palworld Save
   Pal. Não era o material: era o desenho de "palco escuro" original
   (contraluz forte, pouco preenchimento) sem exposição explícita — o
   ACES do `three.js` comprime o meio-tom sem isso. Corrigido com
   `toneMappingExposure = 1.3`, uma luz de ambiente que nunca deixa nada
   virar preto puro, e a chave/preenchimento mais claras.
   > ⚠️ Chegou a existir uma versão com fundo claro (creme, `#f2efe9`) —
   > o Jonjon pediu para tentar, e depois preferiu o fundo escuro de
   > sempre (`bg-surface-2`) com a luz corrigida. Revertido no mesmo dia.
2. **A rotação automática volta sozinha** depois de 2,5s sem a pessoa
   mexer — antes, uma vez que você arrastava, ela parava para sempre
   naquela sessão do componente.
3. Nenhum bug: o giro de fato para quando alguém arrasta a câmera, de
   propósito, para não competir com a mão de quem está olhando o Pal.

Isso puxou a construção do **cofre de Pal**, que abriu uma parede que o
PROMPT.md não tinha previsto: `givepal_j` e `POST /give/paltemplate` **não
aceitam o JSON do Pal no corpo** — só o nome de um arquivo que já precisa
existir no servidor, em `Pals/Templates/`. Escrever esse arquivo é SFTP, que
a Vercel não fala.

**A solução, no mesmo padrão do editor de `Level.sav` (§3.8):** o GitHub
Actions escreve o arquivo (workflow novo,
`.github/workflows/deliver-pal-template.yml` +
`tools/escrever_template_pal.py`), reaproveitando o **mesmo segredo**
`PALLEIRA_SERVERS` que o `import_save.py` já usa — nenhuma credencial nova
em lugar nenhum. Depois que o arquivo está confirmado, a Vercel entrega por
RCON, do mesmo jeito que já entrega item.

```
clicar "resgatar"  →  GitHub Actions escreve o arquivo por SFTP
                   →  a Vercel chama givepal_j por RCON, síncrono
                   →  entregue
```

Só a metade da **retirada** é instantânea (igual ao item); a entrega ganha
uma parada de alguns segundos — a tela mostra "preparando a entrega…" com
polling, em vez de creditar na hora.

⚠️ **Limite conhecido e documentado, não corrigível pelo nosso lado:** o
filtro do `deletepals` não distingue dois Pals idênticos em tudo (espécie,
nível, gênero, shiny, condensação, passivas) menos no IV — `Limit=1` tira um
dos dois, sem garantia de qual. Não afeta o comprador (ele recebe o template
exato que foi salvo, não uma nova leitura do vendedor); só fica ambíguo qual
cópia física saiu da conta de quem vendeu. Registrado por inteiro em
`lib/pal-template.ts`.

🔴 **Nada disso passou pelo jogo de verdade ainda.** Cada metade foi testada
por si — a conversão para o formato de arquivo bate campo a campo com um Pal
real capturado da API, `deletepals`/`givepal_j` respondem no formato
esperado, as travas de concorrência passaram contra o Neon — mas o caminho
inteiro, com o GitHub Actions escrevendo de verdade num servidor, ainda não
rodou uma vez. O workflow tem um modo `verificar` que testa a conexão sem
escrever nada; comece por ele.

**O que falta para fechar o mercado de Pal:** as telas de anunciar e comprar
— hoje só o cofre existe (`/painel/cofre/pals`). `listings` já aceita
`kind='pal'`, testado contra o banco; falta a vitrine.

---

## 6. A migração das Paletas do Palbot — o assunto quente

**O problema:** o Palbot tem os saldos antigos (o Jonjon tinha 26) e **não
existe comando de exportar**. A lista inteira foi conferida: `/checkpoints`,
`/givepoints`, `/removepoints`, `/daily`, `/work`, `/balance`. Nada de
leaderboard, backup ou export.

**A saída encontrada:** o Palbot **responde em público**, e o Discord carimba
em cada resposta **quem digitou o comando**, com ID. Então:

> a pessoa roda `/balance` → o site lê a resposta → aquele saldo é daquele ID.

Sem transcrever nome, sem erro de digitação. Está em `/admin/economia`, caixa
dourada. Código em [`lib/palbot.ts`](lib/palbot.ts) e
[`lib/palbot-parse.ts`](lib/palbot-parse.ts) (o parser puro, com teste).

> ⚠️ O `/daily` também escreve "2 Paletas" no chat. Ler aquilo como saldo
> **zeraria a carteira de quase todo mundo** — `ehTextoDeSaldo()` rejeita
> mensagem de resgate de propósito.

### 🔴 Três interruptores que o Jonjon precisa ligar

Sem eles o importador não funciona:

1. **Message Content Intent** — Developer Portal → app → Bot → Privileged
   Gateway Intents. **Sem ele o Discord entrega as mensagens vazias.**
   Confirmado: uma mensagem do Carl-bot voltou com texto e embed em branco.
2. **Server Members Intent** — mesma tela. Resolve nome → ID.
3. **Permissão de canal** — hoje o bot só enxerga `#bem-vindo` e `#adeus`;
   os outros 17 canais respondem *Missing Access*. Precisa de **Ver canal** +
   **Ler histórico** onde a galera for rodar o `/balance`.

### A ordem certa da virada

1. Ligar os três interruptores
2. Pedir para a comunidade rodar `/balance` num canal
3. Importar em `/admin/economia`
4. Completar o que faltou com `/checkpoints` + a caixa manual
5. **Só então desligar a economia do Palbot** — enquanto os dois estiverem
   ligados, dá para pegar 2 Paletas lá e 2 aqui todo dia
6. Avisar a comunidade

---

## 7. Banco (Neon)

Schema em [`db/schema.sql`](db/schema.sql).

| Tabela | Para quê |
|---|---|
| `players` `guilds` `player_daily` | Placar, alimentado pelo import do save |
| `imports` | Auditoria do robô de import |
| `account_links` | Discord ↔ personagem |
| `link_codes` | Códigos de 6 dígitos pendentes |
| `ledger` | **A carteira.** Saldo = `SUM(delta)` |
| `admin_actions` | Log de ação de moderação |
| `vault_items` | **O cofre.** Uma linha por (pessoa, item) = um slot |
| `vault_transfers` | Movimento jogo↔cofre, com a resposta crua do RCON |
| `listings` | **Os anúncios.** Vendido = anúncio fechado, sem tabela de ordem |

Migrações em `db/migrations/`, aplicadas com
`node tools/migrar.mjs db/migrations/00X-….sql`. **Migração primeiro,
deploy depois** — código novo com banco velho falha em silêncio.

**Disciplina de espaço** (Neon grátis = 0,5 GB): guardar **estado atual**, não
histórico bruto. Snapshot completo a cada 5 min viraria milhões de linhas.

O `player_daily` é o único histórico, e é uma linha por jogador por dia.

---

## 8. O robô do save

`.github/workflows/import-save.yml`, de 2 em 2 horas. Baixa o `Level.sav` por
**SFTP** (porta 2022), parseia e joga no Neon.

**O que já deu errado e está resolvido:**

- O Palworld 0.6 trocou o container `PlZ`/zlib por **`PlM`/Oodle**. O
  `palworld-save-tools` 0.24 não lê. A solução foi o **`palsav-flex`**, do
  repositório do próprio Jonjon — e ele **já tinha passado o caminho**. Antes
  disso se perdeu tempo com `powzix/ooz` (só Windows), `oozlin` (precisa de
  `.so` proprietário) e um shim em C. **Lição: perguntar/ler antes de tentar.**
- `GvasFile.read` quer **dois** dicionários, não um.
- A seção certa é `.worldSaveData.CharacterSaveParameterMap.Value.RawData` —
  sem o `.Value.RawData` o level e os Pals voltam zerados.
- Os valores vêm aninhados em `{'value': ...}`; daí o helper `scalar()`.

---

## 9. Aberto, na ordem em que importa

1. 🔴 **Testar o cofre e o mercado com gente de verdade.** O código está no
   ar e as travas foram testadas contra o banco (venda concorrente, clique
   duplo, saque simultâneo), mas **nenhum item de verdade passou pelo
   caminho inteiro** — só o Jonjon pode fazer isso, porque exige entrar no
   jogo. O roteiro está na §9.1.
2. 🔴 **Testar a entrega de Pal, começando pelo modo `verificar`.** O
   workflow `deliver-pal-template.yml` nunca escreveu num servidor de
   verdade. Antes de resgatar um Pal real: `gh workflow run
   deliver-pal-template.yml -f transfer_id=<qualquer> -f modo=verificar` e
   conferir se ele acha a pasta `Pals/Templates/` nos três servidores.
3. **A vitrine do mercado de Pals** — anunciar e comprar. O cofre e a
   entrega já existem (`/painel/cofre/pals`); falta só a tela de vender, no
   mesmo molde da de item (`app/mercado/vender/`). `listings` já aceita
   `kind='pal'`, testado contra o banco.
4. **A fila de transferências travadas.** Quando o RCON não responde, a
   linha fica em `andando` e ninguém olha. Precisa de uma tela em
   `/admin/economia` mostrando essas linhas com a resposta crua ao lado.
5. **Expiração de anúncio.** Hoje anúncio fica no ar para sempre; a §7.7
   prevê prazo. Sem isso a vitrine envelhece sozinha.
6. **Números da economia no banco, não no código** (§7.12) — taxa, preço de
   slot, piso e teto de preço vivem em `lib/*-regras.ts` e mudar exige
   deploy. A tabela `economy_config` resolve.
7. **O bot do Discord na Vercel**, por HTTP Interactions — resolve o
   problema que o Jonjon lamentava ("não sabíamos onde hospedar"), sem VPS.
8. **A migração das Paletas do Palbot** — travada nos três interruptores da
   §6, que só o Jonjon pode ligar.
9. **RCON no PvP** — decisão dele. Destrava vínculo e cofre para quem só
   joga lá.
10. **Domínio:** o `palleira.com.br` já está no ar; falta fazer o `www`
   redirecionar para o apex e conferir o acesso ao Registro.br (§13 do
   PROMPT — o item que importa é o e-mail da conta, não a senha).
11. **Divergência dos planos VIP** — os cartazes falam Hard Metal / New
    Metal / Palleira; o Discord tem Bronze/Prata/Ouro/Diamante/Colossal,
    todos com 0 membros. Conferir qual é a verdade antes de publicar
    benefício.
12. **Doação automática** (§7.14) — as Paletas já são vendidas por dinheiro
    real, hoje na mão. É a maior oportunidade de automação do projeto.

### 9.1 O roteiro do primeiro teste de verdade

Precisa de **duas contas de Discord** e um personagem no PVE Free ou VIP.
No jogo, deixar na mochila algo barato e repetível (madeira, pedra, uma
munição) — nada de item raro na primeira vez.

1. Entrar no jogo → abrir `/painel/cofre` → a mochila aparece
2. **Guardar** um lote pequeno → conferir **no jogo** que sumiu de lá
3. **Resgatar** de volta → conferir que voltou. *Se estes dois passos
   funcionam, o resto é banco de dados.*
4. Guardar de novo → `/mercado/vender` → anunciar por 2 Paletas
5. Na segunda conta: pegar o daily até dar, comprar o anúncio
6. Conferir na carteira dos dois: comprador −2, vendedor +1, **1 queimada**
7. Na segunda conta: `/painel/cofre` → resgatar no jogo

⚠️ **O que olhar se algo falhar:** a tabela `vault_transfers` guarda a
resposta crua do servidor em cada movimento. Nenhuma transferência some sem
deixar rastro — é para isso que ela existe.

### 9.2 O primeiro teste do cofre de Pal — comece por aqui, não pelo cofre

📌 **Achado um jeito mais fácil de testar a entrega, em 23/08:** em
`/painel/cofre/pals`, staff vê uma caixa "🔧 semear Pal de teste" no fim da
página. Cole ali o JSON exportado de
[paldeck.cc/palcreator](https://paldeck.cc/palcreator) (ou qualquer
`PalTemplate` válido) e ele entra direto no seu cofre — **sem tirar nada de
ninguém**. Dá para testar o resgate inteiro (GitHub Actions escrevendo o
arquivo + a Vercel entregando por RCON) com um Pal descartável, antes de
arriscar o de um jogador de verdade. É o caminho recomendado para o passo
"com um Pal de verdade" mais abaixo — troque por um Pal semeado.

**Antes de tocar num Pal de verdade**, valide o workflow no modo seguro:

```
gh workflow run deliver-pal-template.yml -f transfer_id=1 -f modo=verificar
```

`transfer_id=1` não precisa existir de verdade nesse primeiro teste — se a
linha não existir no banco, o script avisa e para, sem tentar SFTP nenhum.
Para testar a conexão de verdade (que é o que importa aqui), é mais rápido
criar uma linha qualquer direto no banco e usar o id dela:

```sql
insert into pal_transfers (discord_id, server_slug, palworld_uid, template, direction, status, arquivo)
values ('teste', 'pve-free', 'AAAA', '{"PalID":"Anubis"}', 'resgatar', 'aguardando_arquivo', 'teste_verificar')
returning id;
```

Rode `verificar` com esse id, para cada `server_slug` (`pve-free`,
`pve-vip`, `pvp-free`) que você quiser testar, trocando a linha para o
servidor certo entre uma tentativa e outra. Se ele disser que a pasta não
existe, é isso que precisa resolver antes de qualquer coisa —
provavelmente o caminho `Pal/Binaries/Win64/PalDefender/Pals/Templates/`
está diferente do que a documentação do PalDefender descreve. Apague a
linha de teste do banco depois (`delete from pal_transfers where
discord_id = 'teste'`).

**Só depois disso**, o teste com um Pal de verdade:

1. Entrar no jogo → `/painel/cofre/pals` → escolher um Pal comum (não o
   melhor da coleção) → **Guardar**
2. Conferir **no jogo** que ele sumiu do time/palbox
3. Na ficha do Pal (clique nele no cofre) → **Resgatar** → acompanhar o
   status na tela: "preparando…" (workflow rodando) → "entregando…" (RCON)
   → "Entregue!"
4. Conferir **no jogo** que ele voltou, com o mesmo level/IV/passiva
5. Se travar em "preparando…" por mais de 2 minutos, o workflow falhou —
   ver a aba Actions do GitHub. Se travar em "entregando…", o arquivo foi
   escrito mas o `givepal_j` não respondeu — conferir se o arquivo está
   mesmo em `Pals/Templates/` antes de tentar de novo (reenviar arriscaria
   duplicar o Pal, e por isso a tela não tenta sozinha).

## 10. Como retomar num chat novo

Cole isto:

> Estou continuando o portal palleira.com.br. Leia o `HANDOFF.md` e o
> `PROMPT.md` na raiz do projeto antes de qualquer coisa — eles têm o estado
> atual e as decisões já tomadas. Responda sempre em português.

**Outros arquivos úteis:**

- `PROMPT.md` — a especificação inteira, 16 seções, com o *porquê* de tudo
- `docs/conversa-completa.md` — a conversa toda, 1550 mensagens, com as
  credenciais removidas. **Não vai para o git** (está no `.gitignore`), então
  existe só nesta máquina.

⚠️ **Havia uma segunda sessão de Claude mexendo neste repositório em
paralelo** enquanto este documento era escrito — dela vieram `/admin/moderacao`,
`tools/reset_player.py`, `tools/energia_painel.py` e o workflow
`reset-player.yml`.

✅ **Resolvido em 22/08:** as duas sessões viraram uma. O Jonjon encerrou este
chat e seguiu na outra sessão, que leu este documento. O que veio de lá está
documentado na **§3.8 do PROMPT.md** — e o resumo é:

- **Apagar `Players/{UID}.sav` não zera jogador.** O personagem mora no
  `Level.sav` e o servidor regrava o individual no primeiro autosave.
- **A ENX religa o servidor sozinha** depois do `shutdown` da REST. Parada de
  verdade é só com o `stop` do painel.
- **A API do painel exige User-Agent de navegador** — o Cloudflare devolve 403
  (erro 1010) para `Python-urllib`. Pegou o `lib/painel.ts` também.
- **O ciclo ler→reescrever o mundo é fiel**, provado no VIP: o GVAS
  descomprimido volta byte a byte idêntico (186.671.858 bytes nos dois lados).
- Anúncio no jogo é **`alert`** do PalDefender por RCON, não o `announce` da
  REST — que não aparece de forma visível para quem está jogando.
