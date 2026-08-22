# Passagem de bastão — palleira.com.br

> Escrito em 22/08/2026. Serve para abrir um chat novo sem perder o fio.
> Leia junto com o **`PROMPT.md`**, que é a especificação e guarda o *porquê*
> de cada decisão. Este arquivo guarda o **estado de hoje** e o que vem depois.

---

## 1. O que é

Portal da comunidade **Palleira BR** (Palworld, servidores brasileiros).
Login só pelo Discord, carteira da moeda da comunidade (**Paletas**), placar
com jogador offline, mapa ao vivo e — o objetivo final — um **mercado onde o
jogador vende Pal e item por Paletas**.

- **Produção:** https://palleira.vercel.app
- **Domínio alvo:** palleira.com.br (DNS ainda não apontado)
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
| `/mercado` | ⛔ ainda é placeholder |

### O vínculo de personagem — como funciona

O site manda um código de 6 dígitos **dentro do jogo**, por RCON
(`send msg <uid> <mensagem>`), e a pessoa digita de volta no site. É prova que
não dá para forjar: precisaria do Discord **e** do personagem da vítima ao
mesmo tempo.

Provado que é direcionado: com UID inválido o comando responde
*"Failed to find player by UserId"*. Testado ponta a ponta com o `jonjon7D`.

Código em [`lib/linking.ts`](lib/linking.ts). Vale 10 minutos, 5 tentativas,
um personagem por Discord e vice-versa.

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

1. **O mercado** (`/mercado`) — a peça que falta para o site ter razão de
   existir. Depende do **cofre** (§7.3): o Pal fica em custódia enquanto o
   anúncio está no ar, porque `/pals` só responde com o jogador online.
2. **Os sinks** (§7.7). Hoje a economia **só tem entrada**. Sem slot de cofre,
   taxa queimada e cosmético, em três meses tudo custa milhão.
3. **O bot do Discord na Vercel**, por HTTP Interactions — resolve o problema
   que o Jonjon lamentava ("não sabíamos onde hospedar"), sem VPS.
4. **RCON no PvP** — decisão dele. Destrava o vínculo para quem só joga lá.
5. **DNS do palleira.com.br** — e limpar o acesso do ex-dev no Registro.br.
6. **Divergência dos planos VIP** — os cartazes falam Hard Metal / New Metal /
   Palleira; o Discord tem Bronze/Prata/Ouro/Diamante/Colossal, todos com 0
   membros. Conferir qual é a verdade antes de publicar benefício.
7. **Doação automática** (§7.14) — as Paletas já são vendidas por dinheiro
   real, hoje na mão. É a maior oportunidade de automação do projeto.

---

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
