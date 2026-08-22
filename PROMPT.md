# PROMPT MESTRE — PALLEIRA.COM.BR

> Documento vivo. Vá adicionando/riscando itens. Tudo marcado com `[?]` precisa de decisão sua.
> Última atualização: 2026-08-21

---

## 1. Objetivo

Construir e publicar **palleira.com.br**: um portal web da comunidade **Palleira BR** que:

1. Exibe em tempo real o estado do(s) **servidor(es) Palworld** (online/offline, jogadores conectados, uptime, versão, mundo).
2. Integra com o **Discord "Palleira BR"** — login via Discord, leitura de cargos e comunicação bidirecional com o bot **Palbot**.
3. Dá aos jogadores um painel pessoal e aos admins um painel de moderação.

**Domínio:** `palleira.com.br` (apex) + `www` → redirect para o apex.
**Hospedagem:** Vercel, deploy feito **via Vercel CLI** (`vercel`, `vercel --prod`), sem depender do dashboard.

---

## 2. Stack técnica

| Camada | Escolha | Observação |
|---|---|---|
| Framework | **Next.js 15+ (App Router)** | Server Components + Route Handlers para a API |
| Linguagem | **TypeScript** (strict) | |
| UI | **Tailwind CSS v4** + **shadcn/ui** | tema escuro por padrão |
| Ícones | lucide-react | |
| Auth | **Auth.js (NextAuth v5)**, provider **Discord** | escopos: `identify`, `guilds`, `guilds.members.read` |
| Banco | `[?]` Vercel Postgres / Neon / Supabase | decisão pendente |
| ORM | Drizzle ORM (ou Prisma) `[?]` | |
| Cache / tempo real | Upstash Redis (KV) + revalidação ISR + polling/SSE | status cacheado 30–60s |
| Pagamentos | **Mercado Pago** (Pix + cartão) com webhook | crédito automático de Paletas — §7.13 |
| Cron | Vercel Cron Jobs (ou agendador externo) | ⚠️ Hobby só roda diário — ver §3.3 |
| Integração servidor | `rcon-client` + `basic-ftp` + fetch para as REST APIs | Route Handlers em **runtime Node.js**, nunca Edge |
| Deploy | **Vercel CLI** | `npm i -g vercel` (ainda **não** instalado nesta máquina) |
| Runtime local | Node 24.18.0, npm 11.16.0 | já disponível |

---

## 3. Integração com o Palworld

São **três canais, e nenhum substitui o outro** — cada um tem algo exclusivo. Isso é o que define quantas portas o projeto precisa.

| Canal | Porta | Exclusividade dele | Precisa? |
|---|---|---|---|
| **RCON** | 10055 | **`deletepals` e `delitems`** — a REST do PalDefender **não tem endpoint de remoção** | 🔴 **Obrigatório.** Sem ele não existe custódia, e sem custódia não existe marketplace |
| **REST oficial** | 10056 | **`/metrics`** — FPS, uptime, dias no mundo, `/info` e `/settings` | 🟡 Só ele dá métrica de servidor. Sem ele, a página de status perde FPS e uptime |
| **REST PalDefender** | *a alocar* | **`GET /items/{uid}` e `/pals/{uid}`** — ler o que o jogador tem | 🟢 Grande ganho de qualidade, mas **não bloqueia o v1** |

> ⚠️ **Não dá para reaproveitar a 10056 para o PalDefender.** Duas aplicações não escutam a mesma porta TCP. E desligar a REST oficial para liberar a porta custa as métricas do servidor — que, com a CPU em 584%, são justamente o que a comunidade ia querer ver.

**Sem a REST do PalDefender o projeto anda assim:** entrega e custódia por RCON (funciona 100%), e a tela de "escolher o que vender" fica sendo declaração do jogador — o sistema tenta `delitems` e, **se o comando falhar, é porque ele não tinha o item**. Funciona, só é menos elegante que listar o inventário para clicar.

### 3.1 REST API oficial (preferencial)

Habilitar no `PalWorldSettings.ini`:

```ini
RESTAPIEnabled=True
RESTAPIPort=8212
AdminPassword="<senha-forte>"
```

Autenticação: **HTTP Basic**, usuário `admin` + `AdminPassword`.

Endpoints usados pelo portal:

- `GET  /v1/api/info` → nome, versão e descrição do servidor
- `GET  /v1/api/players` → lista de jogadores (nome, playerId, userId, ping, level, localização)
- `GET  /v1/api/metrics` → FPS do servidor, uptime, dias no mundo, nº de jogadores/objetos
- `GET  /v1/api/settings` → configurações do mundo (XP, drop, dificuldade)
- `POST /v1/api/announce` → anúncio no chat do jogo **(admin)**
- `POST /v1/api/kick` → expulsar jogador **(admin)**
- `POST /v1/api/ban` → banir jogador **(admin)**
- `POST /v1/api/save` → salvar mundo **(admin)**
- `POST /v1/api/shutdown` → desligar com contagem regressiva **(admin)**

### 3.2 RCON (fallback)

Habilitar `RCONEnabled=True`, `RCONPort=25575`. Comandos: `ShowPlayers`, `Info`, `Broadcast`, `KickPlayer`, `BanPlayer`, `Save`, `Shutdown`.
Biblioteca sugerida: `rcon-client`. **Atenção:** RCON/REST exigem TCP direto — os Route Handlers precisam rodar em **runtime Node.js**, não Edge.

### 3.3 Arquitetura de acesso — situação real ✅

**O que você tem** (confirmado em 21/08/2026): servidor em **host de games alugado**, com **RCON + senha de admin**, **FTP / gerenciador de arquivos** e **painel do host**. **Sem SSH/RDP.**

**Consequência:** não dá para instalar um agente coletor na máquina do servidor — host alugado não roda processo seu. O plano do agente Node ao lado do servidor está **descartado**.

**A boa notícia:** o **Palbot hospedado já conversa com o seu servidor** (`/palcon`, `/palapi` e `/playerlist` funcionam). Ele roda na nuvem — ou seja, **as portas do seu servidor já estão abertas para a internet**. Se o Palbot alcança, a Vercel alcança.

➡️ **Arquitetura definida: a Vercel fala direto com o servidor, sem intermediário.**

```
Vercel (Route Handlers, runtime Node.js)
  ├── RCON         :25575 → comandos do PalDefender (entrega, custódia)
  ├── REST oficial  :8212 → status, jogadores, métricas
  ├── PalDefender  :17993 → API JSON completa (§3.6) — se o host deixar abrir a porta
  └── FTP                 → ler os templates exportados e o save
```

**Pontos de atenção:**

- ⚠️ **RCON trafega a senha em texto puro.** Em porta pública, quem estiver no caminho captura. Senha longa, exclusiva, trocada se vazar. Mesma coisa para a REST oficial, que usa Basic Auth sobre HTTP puro.
- ⚠️ **Allowlist de IP não funciona bem com Vercel** — funções serverless saem de IPs dinâmicos. Só com IP de saída fixo (recurso pago). A defesa real vira senha forte + rate limit do nosso lado.
- ⚠️ **Função serverless é efêmera:** nada de conexão persistente; cada chamada abre e fecha o RCON.
- ⚠️ **Agendamento:** o Vercel Cron no plano Hobby tem granularidade de dia. Para varrer o servidor de minuto em minuto (detectar login e entregar compra pendente) vai precisar de **Vercel Pro** ou de um agendador externo (Upstash QStash, cron-job.org, GitHub Actions) batendo num Route Handler.

**A confirmar com o host** `[?]`: dá para **abrir a porta 17993** (PalDefender REST)? É a diferença entre uma API JSON limpa e RCON na unha.

### 3.4 Os 3 servidores — mapeados e testados ✅

Extraído dos `PalWorldSettings.ini` e **testado em 21/08/2026**: todas as portas de RCON e REST respondem da internet, e a REST devolve `HTTP 401` (viva e pedindo autenticação). **A Vercel alcança os três.**

| Servidor | Host | Jogo | RCON | REST | Status no projeto |
|---|---|---|---|---|---|
| **[BR] Palleira PVE FREE** | `enx-soc-20.enx.host`<br>`190.115.198.123` | 10084 | **10055** ✅ | **10056** ✅ | 🟢 **ativo** |
| **[BR] Palleira PVE VIP** | `enx-cirion-30.enx.host`<br>`190.115.197.159` | 10086 | **10055** ✅ | **10056** ✅ | 🟢 **ativo** |
| **[BR] Palleira PVP FREE NEW** | `enx-cirion-16.enx.host`<br>`190.115.197.145` | 11144 | 10056 ⛔ | **10058** ✅ | 🟡 **standby** — cadastrado e desligado |

#### ✅ Integração testada de ponta a ponta (21/08/2026)

Chamada autenticada real na REST dos dois PVE — **HTTP 200 com dados de verdade**. Não é teoria: **o pipeline funciona hoje.**

| | PVE FREE | PVE VIP |
|---|---|---|
| Jogadores no momento | 3 | 1 |
| **FPS do servidor** | **49** (média 47,8) | **61** (média 60,7) |
| Dia no mundo | 1806 | 1686 |
| Bases construídas | 123 | 35 |
| Palworld | v1.0.3.101283 | v1.0.3.101283 |

Endpoints validados: `/v1/api/info` · `/metrics` · `/players` · `/settings` — todos 200.

**`/players` devolve:** nome, nome de conta, playerId, userId, ping, coordenadas x/y, level. **E o IP — que nunca pode vazar (§10.1).**

#### 🗺️ Mapa ao vivo — dá para fazer só com a REST oficial ✅

`/v1/api/players` devolve `location_x` e `location_y` de cada jogador online. **Isso é suficiente para o mapa de jogadores em tempo real**, sem depender do PalDefender.

- Fundo: mapa do mundo de Palworld (imagem estática nossa, servida do Blob).
- Marcador por jogador, com nome e level, atualizando a cada 5–10s `[?]`.
- **Converter coordenada de mundo → coordenada de mapa.** A fórmula da comunidade é `((y + C1) / K, (x + C2) / K)` com K ≈ 459,42 — **calibrar com dois pontos conhecidos** comparando a posição do jogo com a do mapa.
- ⚠️ Mostrar posição de jogador vivo é **delicado em PvP** — no PVP FREE (§3.4) isso vira ferramenta de caçada. Manter o mapa **só nos PVE**, ou esconder posição no PvP `[?]`.

**Bases de guild: não dá, e foi verificado.** Testei nos servidores e a REST oficial **não tem** endpoint de base — `/guilds`, `/basecamps`, `/bases`, `/map`, `/worldinfo` retornam **404**. Ela dá só a **contagem** em `/metrics` (`basecampnum`: 123 no FREE, 35 no VIP).

#### 🏆 `/v1/api/game-data` — o endpoint que muda o projeto ✅

**Snapshot do mundo inteiro, na REST oficial, com a senha de admin. Funciona hoje, sem PalDefender, sem porta nova, sem chamado no host.**

Testado no PVE VIP em 21/08/2026: **362 KB, 501 atores**.

```json
{ "Time": "...", "FPS": 60.1, "AverageFPS": 61.1, "InGameTime": "03:36",
  "InGameDays": 1687,
  "ActorData": [ { "Type": "...", "UnitType": "...", ... } ] }
```

**Composição do snapshot:**

| Type / UnitType | Qtd | O que é |
|---|---|---|
| **`PalBox`** | **35** | 🎯 **as bases** — bate exatamente com `basecampnum` do `/metrics` |
| `Character / BaseCampPal` | 457 | cada Pal trabalhando nas bases |
| `Character / WildPal` | 7 | Pals selvagens carregados |
| `Character / Player` | 1 | jogadores online |
| `Character / OtomoPal` | 1 | Pal que acompanha o jogador |

**Campos de cada ator:**

```
Type · UnitType · InstanceID · Name · NickName · Class
GuildID · GuildName · level · HP · MaxHP
TrainerInstanceID · TrainerNickName · TrainerClass
LocationX/Y/Z · RotationX/Y/Z · Action · AI_Action · Stage · IsActive
userid · ip                                    ← ⚠️ IP de novo, ver §10.1
```

**Exemplo de base:**

```json
{ "Type": "PalBox", "Name": "新規生成拠点テンプレート名13(仮)",
  "GuildName": "Unnamed Guild", "GuildID": "0969E120...",
  "Class": "BP_BuildObject_PalBoxV2_C",
  "LocationX": -161912.7, "LocationY": -60986.3 }
```

#### O que isso destrava — sem depender de mais nada

1. **Mapa completo:** jogadores **+ bases + nome de guild**. É exatamente isso que os painéis de terceiro mostram.
2. **🔥 Ranking de guilds — conteúdo pronto, de graça.** Do PVE VIP, agora:

   ```
   18 bases  221 pals   Unnamed Guild
    2 bases   45 pals   Masters (M)
    2 bases   36 pals   Família Ponsoni
    2 bases   34 pals   Meu Legal Jaqueta Filho
    2 bases   33 pals   horda
    2 bases   25 pals   ☯️Rei das Bestas☯️
    2 bases   20 pals   PARABELLUM
   ```

3. **Estatísticas da comunidade:** espécie mais usada em base (Anubis 17, SnowTigerBeastman 16, FlowerPrince 13…), Pal mais popular, distribuição de level. Conteúdo que a galera adora e ninguém mais publica.
4. **Detalhe de base:** quais Pals trabalham em cada base, com espécie, nível e o que estão fazendo (`AI_Action`).
5. **FPS, hora e dia no jogo**, sem chamada extra.

#### ⚠️ Cuidados

- **362 KB por chamada, e os servidores estão em 340–584% de CPU.** Cache de no mínimo 60s, **nunca** uma chamada por visita de página. Cron busca, guarda no Redis, o site lê do cache.
- **Traz o `ip`** de novo — aplicar a §10.1 sem exceção.
- **Nome de base vem em japonês** (`新規生成拠点テンプレート名13(仮)`), que é o padrão de base sem nome. Traduzir para "Base sem nome".
- **`Class` é o nome interno** (`BP_Anubis_C`, `BP_Anubis_Skin001_C` para variante). Mapear para nome de exibição pelo catálogo (§7.4).
- **`GuildName` "Unnamed Guild"** é guild sem nome — traduzir também.

> 📌 **O que ainda exige PalDefender:** inventário do jogador, Pals da palbox com IV e passiva, e os comandos de entrega/retirada do marketplace. O `game-data` mostra o mundo, mas não abre a mochila de ninguém.

#### 🟢 Bases de guild: CONFIRMADO que o dado existe e é acessível de fora

Verificado em 21/08/2026 num painel de terceiro configurado apenas com `enx-cirion-30:10056`. Clicando num marcador aparece:

```
PARABELLUM
Base: 新規生成拠点テンプレート名25(仮)
Location: -184907.91, 256065.41
```

**Nome de guild + nome de base + coordenada de mundo.** São bases reais de jogador, não pontos fixos do mapa.

> 📌 O nome da base vem **cru, em japonês** (`新規生成拠点テンプレート名25(仮)` = "nome de template de base recém-criada 25 (provisório)"). É a chave interna do Palworld para base sem nome. **O site tem que traduzir isso** — mostrar "Base sem nome" em vez de despejar japonês na tela. O mesmo vale para "Unnamed Guild".

**O que isso significa:** o PalDefender **está acessível de fora**, apesar de a varredura anônima não achar. Provavelmente ele registra as rotas no próprio servidor HTTP do jogo (porta 10056) e devolve o **404 genérico do Unreal** para requisição sem token — em vez de 401 — o que esconde a existência da rota.

**Pendente para confirmar:** a **API Key** correta (a senha de admin não funciona como Bearer) e o `RESTConfig.json` do **PVE VIP**, que pode diferir do PVE FREE (aquele estava em 17993).

➡️ **Se confirmar, é a melhor notícia do projeto:** não falta porta, não precisa de chamado no ENX, e inventário, Pals, bases e entrega automática destravam todos de uma vez.

#### 🔎 Truque de diagnóstico: identificar quem responde na porta

O servidor HTTP embutido no Palworld (Unreal/Epic) tem assinatura própria no 404:

```
404  {"errorCode": "errors.com.epicgames.httpserver.route_handler_not_found"}
401  WWW-Authenticate: Basic realm="Pal"
```

Se `/v1/pdapi/qualquercoisa` devolve **o mesmo 404 de uma rota inventada**, quem está atendendo é a REST oficial — **o PalDefender não está naquela porta.** Vale para conferir configuração de painel de terceiro, que costuma falhar em silêncio: tenta, toma 404 e segue sem os dados, sem avisar ninguém.

**Endpoints da REST oficial — lista fechada e testada (v1.0.3.101283):**

```
✅ GET  /v1/api/info · /players · /metrics · /settings
✅ POST /v1/api/announce · /kick · /ban · /unban · /save · /shutdown · /stop
❌ tudo mais → 404
```

⚠️ **O PVE FREE roda a 49 FPS contra 61 do VIP** — combina com a CPU em 584% que apareceu no painel. Decidir se o FPS aparece publicamente `[?]`: é transparência boa, mas 49 num card ao lado de 61 convida comparação. Alternativa: mostrar um indicador simples (ótimo / bom / instável) e deixar o número cru para o painel admin.

#### 🟡 PVP em standby — decisão de 21/08/2026

**Construir com os dois PVE.** O PVP fica cadastrado no banco com `enabled = false`: não aparece na lista de servidores, não aceita importação nem resgate, e o cron nem consulta. **Ligar depois é trocar uma flag no painel admin** — zero código, zero deploy.

Isso é o desenho certo de qualquer jeito: servidor entra e sai da rotação sem release. Serve para manutenção, wipe e servidor novo.

**Quando for ligar o PVP, o caminho é:**

1. `RCONEnabled=True` no `.ini` (com o servidor desligado) → RCON na porta **10056**
2. Ligar o servidor e conferir de fora
3. Marcar `enabled = true` no painel

> ⚠️ **Checar antes:** no meu teste, a porta **10056 do `enx-cirion-16` já respondia**, mesmo com o RCON desativado. Como o nó é compartilhado, isso pode ser serviço de outro cliente. **Confirme no painel que a 10056 está alocada ao SEU servidor** — se não estiver, o RCON não vai conseguir subir nela e você precisa apontar para uma alocação sua.

**Configurações relevantes (mostrar na página "Como jogar"):**

| | PVE FREE | PVE VIP | PVP FREE NEW |
|---|---|---|---|
| XP | 0,2x | 0,4x | 0,2x |
| Captura | 0,5x | 0,6x | 0,6x |
| Drop de inimigo | **2x** | 1x | 1x |
| Penalidade de morte | nenhuma | item | item |
| Peso de item | 0 (sem peso) | 0 (sem peso) | 0,25x |
| Construções | 1500 | **2000** | 1500 |
| Trabalhadores na base | 20 | **25** | 20 |
| Guild | 6 | 6 | 7 |
| Dano PvP | não | não | **sim** |
| Vagas | 32 | 32 | 32 |

**Painel:** ENX / Enxada Host, nos moldes do Pterodactyl — console, gerenciador de arquivos, backups e configurações. Caminho do container: `/home/container/`.

##### API do painel — o único caminho para LIGAR um servidor

`https://painel.enxadahost.com` · API de cliente do Pterodactyl em `/api/client` (confirmada em 22/08/2026).

A REST do Palworld **só desliga**: ela é servida pelo próprio processo do servidor, morre junto com ele, e por isso não existe — nem pode existir — um endpoint `start`. Ligar e reiniciar passam obrigatoriamente pelo painel:
`POST /api/client/servers/{id}/power` com `{"signal": "start" | "restart" | "stop" | "kill"}` → 204.

| Servidor | `panelId` |
|---|---|
| [BR] Palleira PVE FREE | `0c079595` |
| [BR] Palleira PVE VIP | `6eb8d521` |
| [BR] Palleira PVP FREE NEW | `59ec87fa` |

Os IDs não são segredo e moram em `lib/servers.ts`. A **chave** (`ENX_API_KEY`, formato `ptlc_…`) é criada em **painel → Configurações da conta → Credenciais de API**, com o campo de IPs **em branco** — função serverless da Vercel não tem IP fixo. Ela vive só em `.env.local` (ignorado pelo git) e no `vercel env` como *sensitive*.

⚠️ Essa chave é **mais poderosa que a senha de admin do jogo**: dá acesso a arquivos, backups e energia dos três servidores de uma vez. Nunca commitar, nunca colar em chat, nunca mandar para o navegador.

⚠️ **O painel mente sobre o estado do servidor.** O egg de Palworld da ENX procura no log uma frase que o servidor não escreve mais, então os três aparecem como **"INICIANDO" para sempre** — verificado em 22/08/2026 com jogador dentro e 1h45m / 2h55m / 44m de uptime. **Nunca usar o painel para saber se o servidor está no ar**; quem responde isso é o `getMetrics` da REST oficial. (Corrigir de vez é chamado na ENX pedindo ajuste da linha de detecção do egg.)

⚠️ **O PVE FREE estava com CPU em 584% de 600%** no momento da checagem. Praticamente no teto. Isso pesa no projeto: o portal precisa ser **leve com o servidor** — cache agressivo (30–60s), polling espaçado, nunca uma chamada à API do jogo por visita de página. Se o servidor engasgar, a culpa não pode ser do site.

#### 🔴 Pendências dos servidores

1. **RCON desativado no PVP FREE** (`RCONEnabled=False`). A REST oficial **não** tem `giveitems`/`givepal` — então, sem RCON e sem a API do PalDefender, **o marketplace não funciona nesse servidor**. → Ligar `RCONEnabled=True` no `.ini` e reiniciar.
2. **PalDefender não aparece nesses `.ini`** — ele tem config próprio (`RESTConfig.json`). Confirmar que está instalado **nos três** e pegar porta + token de cada um.
3. **`bIsPvP=False` no servidor PVP**, mesmo com `bEnablePlayerToPlayerDamage=True`. O dano entre jogadores funciona, mas vale conferir se é isso mesmo que você quer.
4. **`bAllowGlobalPalboxExport=True` / `Import=False`** nos três: o jogador consegue exportar Pal para a palbox global, mas não importar. Isso conversa com a decisão de mercado cross-server (§7.2).

### 3.5 PalDefender — o motor do marketplace ✅

Confirmado que o servidor roda **[PalDefender](https://ultimeit.github.io/PalDefender/Commands/)**. Ele adiciona ao RCON exatamente os comandos que o marketplace precisa. **Todos funcionam por RCON.**

**Entregar ao comprador:**

| Comando | Uso |
|---|---|
| `giveitems <UserId> <ItemId>:<qtd> ...` | entrega vários itens de uma vez |
| `givepal <UserId> <PalId> [Level]` | entrega um Pal genérico (gênero aleatório) |
| **`givepal_j <UserId> <PalTemplate>`** | **entrega um Pal a partir de template JSON** — preserva o Pal exato |
| `giveegg <UserId> <EggId> <PalId> [Level]` | entrega ovo |
| `give_exp`, `givetechpoints`, `givebosstechpoints` | recompensas extras |

**Retirar do vendedor (custódia real):**

| Comando | Uso |
|---|---|
| `delitems <UserId> <ItemId>:<qtd> ...` | remove os itens anunciados do vendedor ✅ |
| `delitem <UserId> <ItemId> [qtd\|all]` | remoção unitária |
| **`deletepals <UserId> <PalFilter>`** | **remove o Pal do vendedor** ✅ — filtros `ID, Nick, Gender, Level, Rank, Lucky, Passives, Limit` com operadores `= != < > <= >=` |
| `clearinv` | ⛔ **nunca usar** — limpa inventário inteiro |

> 🎯 **`deletepals` é o que faltava.** Com ele o Pal sai de verdade da conta do vendedor, então **não tem clonagem** e a venda de Pals fica segura. Usar sempre com `Limit=1` e filtro específico para não apagar a coleção do cara por acidente.

**Ler os Pals do jogador:**

| Comando | Uso |
|---|---|
| **`exportpals [UserId]`** | **exporta TODOS os Pals do jogador como template JSON** — com level, passivas, IVs, apelido. Grava em `Pal/Binaries/Win64/PalDefender/pals/exported/` |

**Extras que abrem funcionalidades do site:**

`whitelist_add` / `whitelist_remove` / `whitelist_get` (whitelist pelo painel) · `getpos <UserId>` (mapa ao vivo) · `pgbroadcast` e `alert` (anúncio do site no jogo) · `send <tipo> <UserId> <msg>` (mensagem direta — avisar "sua venda saiu!" dentro do jogo) · `kick` / `ban` / `unban` / `banip` · `learntech` · `getip`.

#### 🔴 O UserId NÃO é só Steam — a comunidade é cross-platform

Puxando os jogadores online de verdade em 21/08/2026, apareceram **três formatos diferentes** no mesmo servidor:

```
steam_76561198852390930     ← Steam
gdk_2533274950674566        ← Xbox / Game Pass
ps5_6389933185299269738     ← PlayStation 5
```

**Isso corrige o que eu tinha escrito.** Eu disse que o `palworld_uid` era Steam64 — está errado, e se o site assumisse isso, **jogador de Xbox e de PS5 não conseguiria vincular a conta nem usar o marketplace.** Numa comunidade BR de Palworld isso é uma fatia grande de gente.

**Consequências:**

- `palworld_uid` guarda a **string inteira com o prefixo**, não só o número.
- Guardar também a **plataforma** (`steam` / `gdk` / `ps5`) como coluna separada — serve para estatística e para exibir ícone no perfil.
- Nunca validar com regex de Steam64. O identificador é opaco: trata como texto.
- O PalDefender aceita os três formatos nos comandos — confirmar no primeiro teste real com um jogador de cada plataforma `[?]`.
- A tela de vincular (§4.2) **não pode pedir "seu SteamID"**. Pede o nome no jogo e o sistema resolve o UID pelo `/players`.

> Os servidores estão com `CrossplayPlatforms=(Steam,Xbox,PS5,Mac)` — e os dados provam que tem gente das três. O site nasce cross-platform ou nasce quebrado.

### 3.6 PalDefender REST API — porta 17993 🎯

O PalDefender **tem API HTTP própria**, com **autenticação Bearer**, e é **muito melhor** que RCON: JSON de verdade, sem parsear texto.

✅ **Versão confirmada: PalDefender 1.8.3** (jul/2025, a última). É importante porque:

- `deletepals` existe desde a **v1.7.0**
- A REST API completa (endpoints separados de items/pals/template + **token com permissões**) chegou na **v1.8.0**

Ou seja: **você já tem tudo que o marketplace precisa instalado.** Nada de atualizar nada.

**Endpoints** (prefixo `/v1/pdapi/`, todos com `Authorization: Bearer <token>`):

| Método | Endpoint | Serve para |
|---|---|---|
| `GET` | `/v1/pdapi/players` | quem está online |
| `GET` | **`/v1/pdapi/items/{uid}`** | **ler o inventário do jogador** ✅ |
| `GET` | **`/v1/pdapi/pals/{uid}`** | **ler os Pals do jogador** ✅ |
| `GET` | `/v1/pdapi/guilds` · `/guild/{id}` | guilds — mapa e ranking |
| `POST` | `/v1/pdapi/give/items/{uid}` | entregar itens |
| `POST` | **`/v1/pdapi/give/paltemplate/{uid}`** | **entregar o Pal exato** por template |
| `POST` | `/v1/pdapi/give/pals/{uid}` | entregar Pal por ID |
| `POST` | `/v1/pdapi/deletebase/{id}` | remover base |
| `GET` | `/v1/pdapi/version` | health check |

**`GET /items/{uid}` e `GET /pals/{uid}` derrubam o problema de "não dá para ler o que o jogador tem"** — validação de posse vira uma consulta HTTP.

#### ✅ FUNCIONANDO — testado em 22/08/2026

O ENX liberou **uma alocação extra por servidor**, e é nela que a API sobe:

| Servidor | Porta | Estado | Jogadores | Guilds |
|---|---|---|---|---|
| PVE FREE | **10052** | ✅ | 278 | 216 |
| PVE VIP | **10064** | ✅ | 41 | 24 |
| PVP FREE | **10077** | ✅ | 103 | 67 |
| | | | **422** | **307** |

**Os três estão no ar**, cada um com token próprio e permissões estreitas.

⚠️ **Armadilha na configuração, aprendida na prática:** o PalDefender lê os
tokens **uma única vez, no boot**. Se o arquivo for criado com o servidor
ligado, o log mostra `Loaded 0 Bearer token(s)` e toda chamada volta
`INVALID_TOKEN`. É preciso **reiniciar depois** de criar o arquivo. O log
confirma quando dá certo: `[RESTAPI] Loaded 1 Bearer token(s)`.

⚠️ **O arquivo de token vai em `RESTAPI/Tokens/`**, não em `RESTAPI/`. Um
nível errado e o mod ignora em silêncio.

📌 **O servidor coleta o game-data a cada 60s** (`-collect-gamedata-interval=60`
na linha de comando). Cachear por 60s do nosso lado está casado com a origem:
pedir mais rápido não traz dado novo, só carga.

#### 🔴 PvP não entra no mapa — decisão de 22/08/2026

O PVP FREE **entra no placar e nas estatísticas**, mas **nunca no mapa**:
mostrar posição de jogador e de base ali é entregar alvo de raide.

No código isso virou duas listas separadas em `lib/servers.ts`:
`activeServers()` para placar, `mappableServers()` para o mapa — com
`mapVisible: false` no PVP. Assim não vaza por descuido: precisaria alguém
mudar a flag de propósito.

**O que a API entrega de verdade** (medido, não suposto):

| Endpoint | Resultado real | Precisa online? |
|---|---|---|
| `/v1/pdapi/players` | **278 jogadores, incluindo offline** — nome, guild, `Status`, posição de mundo **e de mapa** | ❌ não |
| `/v1/pdapi/guilds` | **216 guilds** — nome, **Level**, **líder**, bases com `map_pos` pronto, membros | ❌ não |
| `/v1/pdapi/pals/{uid}` | Pals do jogador | ✅ **sim** |
| `/v1/pdapi/items/{uid}` | Inventário do jogador | ✅ **sim** |

🔴 **`/pals` e `/items` só funcionam com o jogador conectado** — respondem `Failed to find APalPlayerController` quando ele está offline. O inventário só existe na memória enquanto ele joga.

**Isso não atrapalha: valida o modelo de cofre da §7.3.** O jogador importa para o cofre enquanto joga (quando o dado existe) e vende depois, a qualquer hora, sem precisar estar online.

> 📌 **Coordenada de mapa vem pronta.** O `map_pos` das bases e o `MapLocation` dos jogadores dispensam a conversão que eu tinha deixado pendente na §3.4. Um problema a menos.

⚠️ **Permissão faltando no token:** pus seis permissões e esqueci `REST.Version.Read` — o health check responde `MISSING_PERMISSION`. Acrescentar na próxima edição do arquivo de token.

#### Estado anterior (verificado em 21/08/2026)

`/home/container/Pal/Binaries/Win64/PalDefender/RESTAPI/RESTConfig.json` **já está ligado**:

```json
{
  "Version": 2,
  "Enabled": true,        ← já true ✅
  "LogConsole": false,
  "Address": "0.0.0.0",   ← escutando em todas as interfaces ✅
  "Port": 17993,          ← ⛔ ESTE é o problema
  "Cors": { "Allowed-Origins": "*", "Max-Age": 86400 }
}
```

🔴 **A porta 17993 não passa pelo host.** Testado nos três: TCP sem resposta. O painel do ENX (tipo Pterodactyl) só encaminha as **portas alocadas** para o container — 17993 não é uma delas, então o PalDefender escuta lá dentro e ninguém de fora alcança.

**A correção:** trocar `"Port"` para uma porta que **já esteja alocada ao seu servidor**.

Onde ver: painel → **Configurações / Rede → alocações**. Lá aparecem as portas que são suas (a do jogo, a de RCON, a de REST, e as extras). Se não sobrar nenhuma, abrir chamado no ENX pedindo **mais uma alocação**.

> ⚠️ Um scan externo mostrou outras portas TCP abertas nesses endereços, **mas os nós são compartilhados** — porta aberta ali pode ser de outro cliente. Só vale usar o que estiver listado como alocação **do seu servidor** no painel.

#### Texto pronto para o chamado no ENX

Se não houver alocação sobrando no painel, pedir **1 porta TCP adicional por servidor** (3 no total):

> **Assunto:** Solicitação de porta adicional (alocação) — 3 servidores Palworld
>
> Olá! Preciso de **1 porta TCP adicional** em cada um dos meus servidores Palworld, para expor a REST API do mod **PalDefender**, que roda dentro do container.
>
> **Servidores:**
> 1. [BR] Palleira PVE FREE — `enx-soc-20.enx.host:10084`
> 2. [BR] Palleira PVE VIP — `enx-cirion-30.enx.host:10086`
> 3. [BR] Palleira PVP FREE NEW — `enx-cirion-16.enx.host:11144`
>
> O mod já está instalado e configurado em `Pal/Binaries/Win64/PalDefender/RESTAPI/RESTConfig.json`, escutando em `0.0.0.0`. Falta apenas uma **alocação de porta encaminhada para o container**, para eu apontar o mod nela.
>
> **Não precisa ser um número específico** — qualquer porta que vocês alocarem serve, eu configuro o mod para usá-la. Só peço que me informem o número atribuído a cada servidor.
>
> Se já existir alguma alocação extra livre em algum deles, também resolve; basta me dizer qual é.
>
> Obrigado!

**Se já houver alocação livre no painel:** não precisa de chamado — é só apontar o `"Port"` do `RESTConfig.json` para ela.

#### Ordem correta de mexer (importante)

1. **Desligar o servidor** pelo painel.
2. Editar e **salvar** o `RESTConfig.json` e o arquivo de token.
3. **Ligar** o servidor.

Editar com o servidor de pé não adianta: a config só é lida no boot, e o PalDefender pode reescrever o arquivo ao desligar, desfazendo a alteração.

#### Passo a passo (repetir nos 3 servidores)

**1.** Com o servidor **desligado**, ajustar em `RESTConfig.json` o `"Port"` para uma alocação sua.

**2.** Criar `Pal/Binaries/Win64/PalDefender/RESTAPI/Tokens/PalleiraPortal.json`.
Todo `.json` nessa pasta vale como token, **menos** o `TokenExample.json`:

```json
{
  "Name": "PalleiraPortal",
  "Token": "<64 caracteres aleatórios — um por servidor>",
  "Permissions": [
    "REST.Players.Read",
    "REST.Pals.Read",
    "REST.Items.Read",
    "REST.Items.Give",
    "REST.Pals.Give",
    "REST.Guilds.Read"
  ]
}
```

> 🔒 **Usar permissões estreitas, não `REST.*`.** O token do site só precisa ler e entregar — não precisa de ban, shutdown nem deletebase. Se vazar, o estrago é limitado. Confirmar os nomes exatos das permissões na doc; o `REST.*` funciona, mas é canhão para matar mosca.

**3.** Ligar o servidor. O log confirma que a API subiu.

**4.** Validar de fora — tem que responder `401` (viva, pedindo token):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://SEU_HOST:PORTA_ALOCADA/v1/pdapi/version
```

`401` = funcionando. `000` = a porta ainda não passa pelo host.

**5.** Guardar os 3 tokens em `vercel env`, um por servidor.

⚠️ A doc do PalDefender recomenda não expor essa porta e usar proxy reverso — que num host alugado você não sobe. **Mas o [PalAPI](https://palapi.co/) (mesmo criador do Palbot) exige exatamente 8212 + 17993 abertos.** É prática corrente; com token de 64 caracteres e permissões estreitas, o risco é aceitável.

- **Se o host abrir a porta:** REST do PalDefender como caminho principal — JSON limpo, sem parsear texto.
- **Se não abrir:** RCON, que já está aberto e cobre a entrega (§3.5). O site deve funcionar dos dois jeitos.
- **Decisão:** `_____________________`

> 💡 **Prior art:** o [PalAPI](https://palapi.co/) já entrega mapa ao vivo, posição de jogador, métricas e moderação — de graça e pronto. **Vale não reconstruir isso.** O diferencial do palleira.com.br é o **marketplace com Paletas** e a identidade da comunidade; para status e mapa, dá para linkar o PalAPI ou embutir o essencial. `[?]` decidir o quanto reimplementar.

### 3.7 FTP — o que ele resolve

O acesso a arquivos entra no plano para:

- Ler os templates de Pal exportados em `Pal/Binaries/Win64/PalDefender/pals/exported/` — é de lá que sai a ficha do anúncio.
- Subir template de volta para a pasta que o `givepal_j` lê, quando a entrega for por RCON.
- Ler `Config.json` do PalDefender e o `PalWorldSettings.ini`.
- Baixar o `Level.sav` para estatísticas e ranking (opcional, arquivo pesado — fazer em cron, fora de hora de pico).

Biblioteca: `basic-ftp` (Node). Guardar as credenciais como segredo, e **nunca** deixar o FTP escrever fora das pastas previstas.

---

### 3.8 O save como fonte de dados — o caminho para o ranking de jogador

**O problema:** a API do jogo só enxerga quem está **online**. `/players` e `game-data` não sabem nada de quem está offline. Então ranking de jogador com level, horas e evolução **não sai da API** — precisa do save.

**O que já existe na máquina do dono:** [PalworldSaveTools](https://github.com/deafdudecomputers/PalworldSaveTools) v2.4.0, em `G:\Downloads\Servidor\PalworldSaveTools`, com atualização diária automática pelo Task Scheduler. É **GUI, sem linha de comando** (confirmado no changelog da v2.4.0), mas converte **SAV ↔ JSON**.

**O que o save entrega, e a API não:**

| Dado | API | Save |
|---|---|---|
| Jogadores **offline** | ❌ | ✅ |
| Level e tempo de jogo de todo mundo | ❌ | ✅ |
| **Pals com IV, passiva, alma, condensação** | só via PalDefender | ✅ |
| Inventário do jogador | só via PalDefender | ✅ |
| Membros de cada guild | ❌ (só o nome) | ✅ |

➡️ **Isso é um caminho alternativo para a ficha do Pal da §7.4, sem depender da porta do PalDefender** — que segue fechada. Para *exibir* e *validar* o que o jogador tem, o save resolve. Para *mover* item e Pal (a custódia da §7.3), continua sendo RCON.

#### Como levar o save para o site `[?]`

- **(A) Import manual — funciona esta semana.** Baixa o `Level.sav` por FTP → converte para JSON no PST → envia numa página de admin do site → o site processa e guarda. Nenhuma infraestrutura nova. Ranking atualiza quando você importa.
- **(B) Automático — o certo no médio prazo.** Um script no PC (Task Scheduler, igual ao updater que já roda ali): FTP baixa → converte com a **biblioteca `palworld-save-tools`, que tem CLI** → `POST` autenticado para o site. Roda de madrugada, sozinho.

**Recomendação:** começar em **(A)** e migrar para **(B)** quando provar que a comunidade usa. (A) custa zero e valida a ideia.

#### ✅ Medido por SFTP em 22/08/2026 — e é leve

Conectei nos dois servidores por **SFTP na porta 2022** e medi tudo:

| | PVE FREE | PVE VIP |
|---|---|---|
| `Level.sav` | **16,5 MB** | **9,3 MB** |
| Tempo de download | **0,6s** (25,6 MB/s) | **0,4s** (21,2 MB/s) |
| `Players/` — arquivos | **319** | **61** |
| `Players/` — tamanho total | 4,5 MB (média 14 KB) | ⚠️ **394 MB** (média 6,5 MB) |

**Três conclusões:**

1. **Baixar os dois `Level.sav` custa 26 MB e menos de 2 segundos.** O medo de "save gigante" não se confirmou — dá para importar bem mais que uma vez por dia se quiser.
2. **319 jogadores cadastrados no PVE FREE e 61 no VIP.** É o número real de gente que já entrou — bem mais concreto que estimativa de Discord (§13, pergunta 7). Serve para calibrar a economia da §7.12.
3. ⚠️ **Os saves individuais do VIP são 460x maiores que os do FREE** (6,5 MB contra 14 KB). Provavelmente palbox cheia. **Não baixar a pasta `Players/` do VIP inteira** — são 394 MB. O `Level.sav` já traz jogadores, guilds e Pals; o arquivo individual só entra se precisar de inventário de alguém específico.

#### Por que ainda não dá para fazer isso na Vercel

O `.sav` é comprimido: 16 MB viram **centenas de MB de JSON** depois de parseado. Não cabe na memória de uma função serverless, e o parser é Python. Por isso o robô vai para o **GitHub Actions**, que tem 16 GB de RAM e roda Python nativamente.

**Notas de conexão** (para o robô): protocolo **SFTP** (não FTP simples), porta **2022**, um usuário por servidor. ⚠️ O `curl` com libssh2 **não** negocia a criptografia desse servidor — usar `paramiko` (Python) ou cliente OpenSSH.

### 3.8 Editar o mundo: `Level.sav`, Oodle e o motor no GitHub Actions

> Tudo desta seção foi **medido em 22/08/2026**, não é suposição. Serve para
> ninguém repetir o caminho das pedras.

#### O que NÃO funciona (testado)

**1. Apagar `Players/{UID}.sav` não zera jogador.** O personagem mora no
`Level.sav`; a pasta `Players/` é derivada dele. Apagamos o arquivo do Gadl
com o servidor **desligado**, confirmamos que sumiu, religamos — e no primeiro
autosave o arquivo **voltou com o mesmo tamanho** (11.700 B, contra 11.701 B
antes). Os 319 arquivos da pasta foram regravados no mesmo segundo. O mundo é
a fonte da verdade.

**2. O PalDefender não tem comando de reset.** Sondados por RCON, todos
respondem `Unknown command`: `deleteplayer`, `resetplayer`, `removeplayer`,
`wipeplayer`, `deletecharacter`, `resetcharacter`, `delplayer`, `pgdelete`,
`deleteguild`, `removeguild`, `leaveguild`, `kickfromguild`, `unstuck`,
`teleport`. A sondagem é confiável: `getpos` respondeu com a forma de uso
correta, provando que comando existente responde diferente de inexistente.

**3. O `shutdown` da REST não desliga — a ENX religa sozinha.** No log do
painel: `REST API stopped` -> `Server marked as offline...` ->
`Server marked as starting...`, sem ninguém pedir. **Para parar de verdade é o
`stop` do painel** (parada intencional). Consequência: o botão "Desligar" do
site, que usa a REST, na prática é um reinício.

**4. Rodar isso na Vercel é impossível.** O mundo tem 339 MB descomprimidos;
o plano Hobby dá ~1 GB de RAM e 60s. Não cabe, e não adianta tentar.

#### O formato

| | |
|---|---|
| Magic | `PlM` (byte de tipo `0x31`) — **Oodle Kraken**, não zlib |
| `Level.sav` do PVE FREE | 16,6 MB -> **339 MB** descomprimidos |
| World GUID PVE FREE | `E99CD9CFE959478C865A90EF645786B7` |

⚠️ Saves antigos eram `PlZ` (zlib, dava para ler com a stdlib do Python).
**Os atuais são `PlM` e exigem biblioteca nativa** (`palooz`, extensão C++).

#### Correção importante ao que estava escrito na §3.7

Está registrado que o PalworldSaveTools é *"GUI, sem linha de comando"*. Isso
vale para o **aplicativo**, mas **a biblioteca por baixo dele é scriptável**:
`palsav` tem CLI (`palsav/commands/convert.py`, `diag.py` e console script
declarado no `pyproject`). **Automatizar é possível** — a anotação anterior
leva à conclusão errada.

API útil: `decompress_sav_to_gvas(bytes) -> (gvas, tipo)`,
`GvasFile.read(...)`, `compress_gvas_to_sav(gvas, tipo)`, e
`--custom-properties` para decodificar só o que interessa (corta RAM e tempo).
Cuidado: `palooz` é declarado via `tool.uv.sources`, que **o pip comum não
resolve** — instalar de `src/palsav/palooz` explicitamente. E não teste o
import de dentro de `src/palsav`: existe ali uma **pasta** `palooz/` que o
Python 3 aceita como namespace package e dá falso positivo.

#### O motor: GitHub Actions (medido, não estimado)

Runner padrão de repositório **privado** (`ubuntu-latest`):

| | |
|---|---|
| CPU | 2 núcleos |
| RAM | **7,8 GB** (+3 GB swap) — 7x a Vercel |
| Disco | 14 GB livres |
| gcc | 13.3.0 ✅ |
| Python | 3.12.3 |
| Cota | 2.000 min/mês grátis no plano Free |

⚠️ **Os 16 GB que se lê por aí são de repositório PÚBLICO.** Privado dá 7,8 GB.

Teste de ponta a ponta que passou: `palooz` **compila em 16,7s** com o gcc do
runner, e o Oodle faz ida e volta em 339 MB **byte a byte idêntico**, com
**pico de 1,07 GB de RAM**. Sobra folga larga.

Isso mata de uma vez os três bloqueios da máquina do dono: falta de compilador
C++, RAM insuficiente e a rede com TLS quebrado (proxy) que impede `pip` e
`uv` de baixar pacote.

**Desenho que isso libera:**

```
Site (Vercel)                      GitHub Actions
-------------                      --------------
admin clica a ação
  -> workflow_dispatch com o UID --> compila palooz
                                     baixa Level.sav por SFTP (porta 2022)
                                     edita o mundo
                                     sobe por SFTP e reinicia pelo painel
  <- lê o status pela API GitHub  <-- conclui
```

Melhor que agente local no PC do dono: **não depende do PC estar ligado.**

🔴 **Baixar pela API HTTP do painel NÃO funciona do runner: devolve 403.**
O painel está atrás do Cloudflare, que barra IP de datacenter — do PC do dono
funciona, do GitHub Actions não. **O caminho é SFTP na porta 2022**, que não
passa por CDN. É o que o `tools/import_save.py` já faz, com `paramiko` e as
credenciais no segredo `PALLEIRA_SERVERS` (JSON: `slug`, `host`, `user`,
`password`, `guid`).

#### Já existe infraestrutura pronta — não reinventar

| Peça | Onde | O que faz |
|---|---|---|
| `.github/workflows/import-save.yml` | repo | Roda de 2 em 2h, importa os três saves |
| `tools/import_save.py` | repo | SFTP + parse + grava no banco |
| Segredos | GitHub | `PALLEIRA_SERVERS`, `DATABASE_URL`, `ENX_API_KEY` |

⚠️ **Parsear o save inteiro estoura 20 minutos no runner.** O
`import_save.py` decodifica **só duas seções** (`NEEDED_SECTIONS`), e é por
isso que ele roda em menos de 1 minuto. Qualquer ferramenta nova deve fazer o
mesmo.

⚠️ **Pegadinha do caminho:** a chave é
`.worldSaveData.CharacterSaveParameterMap.Value.RawData` — apontar para
`.CharacterSaveParameterMap` **não casa com nada** e o level volta zerado.

Instalação que funciona no runner (mais limpa que clonar o repo):

```bash
REPO=https://github.com/deafdudecomputers/PalworldSaveTools.git
pip install "git+$REPO#subdirectory=src/palsav/palooz"
pip install "git+$REPO#subdirectory=src/palsav"
```

#### Anúncio no jogo: `alert`, não `/announce`

O `POST /v1/api/announce` da REST **não aparece de forma visível** para quem
está jogando — confirmado com o dono dentro do servidor. O que funciona é o
comando **`alert <mensagem>`** do PalDefender, por RCON, que mostra a mensagem
grande na tela. Testado: responde `Command execution succeeded.` e o log
registra `[BroadcastAlert] -> ...`. **Sem barra** no começo.

#### ✅ Como conferir que uma edição do mundo não perdeu nada

Editar o `Level.sav` reescreve o arquivo de **todos**. A conferência que dá
segurança, feita depois do reset do Gadl em 22/08:

1. **Nível de quem está online** contra o que a tabela `players` tinha antes
   (ela é do último import, anterior à edição). Todos bateram: DumpNLoads- 53,
   PLm 78, AndersonOXS666 39.
2. **Rodar o `import-save.yml` na mão** e comparar as linhas da tabela
   `imports`, que guarda `players`, `guilds` e `pals` de cada execução:

| | jogadores | guilds | pals |
|---|---|---|---|
| antes | 278 | 216 | 30.569 |
| depois | 277 | 215 | 30.585 |
| **diferença** | **−1** | **−1** | **+16** |

−1 jogador e −1 guild = exatamente o alvo e a guild vazia dele. Os Pals
**subiram** porque a comunidade continuou jogando entre os dois imports — a
série vinha 30.554 → 30.557 → 30.569 → 30.585, sem queda em momento nenhum.

> 📌 A tabela `imports` existe justamente para isso. Sem ela, "não perdeu
> nada" seria opinião; com ela, é número.

#### 🔧 Receita: consertar "carregamento infinito" de um jogador

**Sintoma:** o jogador não consegue entrar — fica na tela de carregamento
para sempre. **Mas o servidor loga ele sem erro nenhum** (`has logged in` no
log), ele aparece em `/players` com ping normal, e o `getpos` devolve
coordenada válida.

**Causa:** o `Players/{UID}.sav` dele está corrompido. O personagem em si
está íntegro — ele mora no `Level.sav`.

**Conserto (não perde progresso):**

1. Parar o servidor pelo painel (o `stop`, não o `shutdown` da REST)
2. Apagar `Pal/Saved/SaveGames/0/{guid}/Players/{UID}.sav`
3. Religar

O servidor **regenera o arquivo individual a partir do `Level.sav`** no
primeiro autosave, limpo. O jogador volta a entrar **com o personagem, o
nível e tudo no lugar**.

> 📌 Confirmado com o Gadl em 22/08: apagamos o arquivo achando que
> zeraríamos o personagem, ele voltou sozinho, e tratamos como fracasso.
> Não era: **o carregamento infinito acabou.** Ele voltou a jogar com o
> nível 40 intacto. Zerar é outra operação (mexer no `Level.sav`); isto
> aqui é **reparo**.

⚠️ Não confundir as duas coisas:
> **apagar `Players/{UID}.sav` = reparar o jogador**
> **editar o `Level.sav` = zerar o jogador**

#### Caso Gadl (22/08/2026) — não concluído

Pediu reset por não conseguir entrar: **carregamento infinito**. Descobertas:

- UID `F721F85B000000000000000000000000`, nível 40, sozinho na guild
  `AF356E5448E8E4B14F1AACA75EDD23B0` ("Unnamed Guild", 0 bases)
- **O servidor loga ele sem erro** (`has logged in`), e ele sai ~40s depois —
  o travamento é no cliente, não no servidor
- Apagar o save individual **não resolveu** (voltou pelo `Level.sav`)
- ⚠️ **Não confirmamos que a causa é o personagem no mundo.** Antes de operar
  o `Level.sav`, rodar `getpos <user_id>` com ele conectado: se a coordenada
  vier absurda, achamos a causa e talvez baste teleportar.

Backups guardados em `Downloads/palleira-backups/`:
`Gadl_F721F85B_pve-free_2026-08-22.sav` e `Level_pve-free_2026-08-22.sav`
(15,89 MB, sha256 `5299911fdf0cfa2e...`).

## 4. Integração com o Discord (Palleira BR + Palbot)

### 4.1 Login e identidade — **Discord é o único login**

Não existe cadastro por e-mail/senha, não existe "entrar como convidado". **A conta do Discord é a identidade mestre** do portal: é ela que carrega a carteira de Paletas, os anúncios e o ID do jogo vinculado.

- OAuth2 com Discord via Auth.js (escopos `identify`, `guilds`, `guilds.members.read`).
- Ao logar: verificar se o usuário é membro do guild **Palleira BR** (`GUILD_ID`). Se não for, a tela mostra o convite e o acesso para por aí.
- `discord_id` é a **chave primária de identidade** — nunca o nome de usuário, que o jogador pode trocar quando quiser.
- Ler os cargos do membro e mapear para permissões do portal:

| Cargo no Discord | Papel no portal |
|---|---|
| `[?] Dono / Admin` | `admin` — acesso total, ações destrutivas |
| `[?] Moderador` | `mod` — kick / ban / anúncio |
| `[?] VIP / Booster` | `vip` — benefícios `[?]` |
| `@everyone` | `member` — painel pessoal |

### 4.2 Vinculação do ID do jogo ↔ Discord

O login com Discord é o passo 1; **dentro dele** o jogador vincula o ID do Palworld. Sem vínculo, o cara entra e navega, mas **não vende, não compra e não tem perfil de jogador**.

**Fluxo:**

1. Logado, o jogador abre `/vincular` e o site gera um **código de 6 dígitos** com validade de 10 minutos.
2. Ele confirma o código no Discord (`/vincular <código>` com o Palbot) ou no chat do jogo `[?]`.
3. Palbot / agente coletor valida e chama o portal (`POST /api/bot/link-confirm`, assinado com HMAC).
4. O portal grava `discord_id ↔ palworld_uid` e marca a conta como verificada.

**Regras:**

- Um `palworld_uid` só pode estar vinculado a **um** `discord_id` por vez (e vice-versa).
- Desvincular é ação de admin ou tem **cooldown** `[?]` — senão vira porta para lavar item entre contas.
- Todo vínculo e desvínculo entra no log de auditoria.
- Conta recém-vinculada tem **carência** `[?]` antes de poder anunciar (anti-conta-descartável).

### 4.3 Comunicação site → Palbot

Escolher **um** canal principal `[?]`:

- **(A) Webhook do Discord** — o site posta embeds em `#status-servidor`, `#logs-admin`, `#anuncios`. Simples, unidirecional.
- **(B) API HTTP no Palbot** — o bot expõe endpoints autenticados (`Bearer`) e o site chama. Permite comandos de verdade.
- **(C) Fila (Upstash QStash / Redis pub-sub)** — o site enfileira, o Palbot consome. Mais robusto, mais peça móvel.

**Decisão:** `_____________________`

### 4.4 Comunicação Palbot → site

- Palbot chama Route Handlers do portal com `x-palbot-signature` (HMAC-SHA256 do corpo) + timestamp anti-replay.
- Endpoints: `POST /api/bot/link-confirm`, `POST /api/bot/event`, `GET /api/bot/player/:id`.

### 4.5 Slash commands que o site deve espelhar

```
/status     → status do servidor (mesma fonte de dados do site)
/online     → quem está online agora
/vincular   → vincula a conta
/perfil     → perfil do jogador (horas, level, guild)
/ranking    → top jogadores
[?] adicionar: ______________________
```

### 4.6 Dados do Discord a cadastrar

```
GUILD_ID (Palleira BR):   [?]
CLIENT_ID do Palbot:      1197954327642378352 (bot público)
Canal #status:            [?]
Canal #logs-admin:        [?]
Modo do Palbot:           HOSPEDADO ✅ (dashboard.palbot.xyz) — ver §4.7
```

### 4.7 O que o Palbot já faz — levantamento (21/08/2026)

Fontes: [docs oficiais](https://palbot-gg.github.io/docs/), [palbot.gg](https://palbot.gg/), [dashboard](https://dashboard.palbot.xyz/), [código no GitHub](https://github.com/dkoz/palworld-palbot).

**Economia (já existe, é a base das Paletas):**

| Comando | O que faz |
|---|---|
| `/daily` | recompensa diária de pontos |
| `/work` | trabalhar para ganhar pontos |
| `/balance` | consultar saldo |
| `/checkpoints` | admin — ver saldo de um usuário |
| `/givepoints` / `/removepoints` | admin — ajuste manual |

O nome da moeda é **customizável pelo dashboard** ("manage economy settings and currency") — é daí que sai "Paletas". ✅

**Kits — é o sistema de entrega, e é o achado mais importante:**

Um kit é um **array JSON de comandos RCON** executados no jogador. Criado com `/kits manage`, entregue com `/kits give <userid> <kit> <servidor>`. Exemplos reais da doc:

```
giveitems {userid} SFArmorWeight_5:1 Shield_SF:1 AssaultRifle_Default5:1
givepal {userid} Anubis 10
```

➡️ **Ou seja: entregar item e Pal para um jogador já é resolvido, via RCON.** Isso torna o escrow automático da §7.6 viável de verdade — não precisa de entrega combinada na mão. Exige o mod **PalDefender** (ou equivalente) no servidor, que é quem adiciona `giveitems`/`givepal` ao RCON.

**Servidor:** `/palcon <comando>` (RCON cru) · `/palapi kick|ban|unban|announce|save|shutdown|stop` · `/serverinfo` · `/playerlist` · `/livemap` · `/query setchannel` (status) · `/playermonitor addchannel` (join/leave).

**Vínculo de conta:** existe `/forcelink` (**admin**, força o vínculo Discord ↔ conta do jogo). **Não há comando documentado para o próprio jogador se vincular** — então o fluxo de código de 6 dígitos da §4.2 provavelmente vai ser **nosso**, não do Palbot.

**Duas pedras no caminho:**

1. 🔴 **Você usa o Palbot hospedado, e ele não tem API HTTP pública documentada.** Ou seja: o site **não consegue ler o saldo de Paletas** nem disparar kits programaticamente, e não há acesso ao banco. Isso praticamente derruba a opção (A) da §7.1.
   - **Antes de decidir:** entrar no `dashboard.palbot.xyz` e procurar seção de **API / Developer / Tokens / Webhooks**; se não achar, perguntar no Discord de suporte do Palbot. É uma pergunta de 5 minutos que decide a arquitetura da economia.
   - A "REST API" que o Palbot anuncia é ele **consumindo** a API do servidor Palworld — não é uma API que ele oferece para terceiros.
2. **O Palbot open source (`dkoz/palworld-palbot`, Python + Docker) foi arquivado em 29/01/2026**; o desenvolvimento migrou para o **[Project Sphere](https://github.com/projectsphere/sphere)**. O bot hospedado segue no ar, mas o projeto original está congelado. Vale decidir agora se a comunidade fica, faz self-host da versão arquivada, ou migra.

---

## 5. Funcionalidades do site

### 5.1 Público (sem login)

- [x] **Home** — hero com a identidade Palleira, status ao vivo (jogadores online / capacidade), CTA "Entrar no Discord" e "Como conectar".
- [x] **Status** — um card por servidor: online/offline, jogadores, uptime, FPS, versão, dias no mundo. ⚠️ Falta só o **gráfico das últimas 24h** — depende de guardar histórico no banco, que ainda não existe.
- [x] **Como jogar / Conectar** — IP, porta, senha `[?]`, passo a passo com imagens, requisitos, mods `[?]`.
- [ ] **Regras** — regras da comunidade e do servidor.
- [ ] **Mercado (vitrine)** — qualquer um vê os anúncios de Pals e itens e os preços em Paletas; para comprar ou vender, precisa logar com o Discord.
- [x] **Ranking** — top por horas jogadas / level / capturas `[?]`.
- [ ] **Notícias e wipes** — posts em MDX ou CMS `[?]`.
- [ ] **FAQ**.

### 5.2 Área do jogador (login com Discord)

- [x] **Meu perfil** — avatar do Discord, conta Palworld vinculada, horas, level, guild in-game, últimas sessões.
- [x] **Vincular conta** (§4.2).
- [ ] **Meus Pals e itens** — inventário que o jogador sobe para o site (§7.3), base para anunciar.
- [ ] **Anunciar** — wizard de venda em 3 passos.
- [ ] **Meus anúncios** — ativos, vendidos, expirados, cancelar.
- [x] **Carteira** — saldo de Paletas, extrato completo, compras e vendas.
- [ ] **Tickets / suporte** — abre thread no Discord através do bot.

### 5.3 Painel admin (cargo admin/mod)

- [x] Jogadores online com ações: **kick / ban / anunciar / salvar mundo / desligar** — e também **ligar / reiniciar**, que a REST do Palworld não faz e passam pelo painel da ENX.
- [x] Broadcast in-game com espelho automático no Discord. ⚠️ O espelho fica inerte até `DISCORD_WEBHOOK_STATUS` e `DISCORD_WEBHOOK_ADMIN_LOG` existirem no `vercel env` — no jogo o anúncio já sai.
- [x] Log de auditoria (quem fez o quê e quando), persistido no banco — tabela `admin_actions`, grava sucesso **e** falha.
- [ ] Editor de anúncios/notícias do site.
- [ ] Cadastro e configuração dos servidores.
- [x] **Economia**: ajustar saldo (com motivo obrigatório). ⚠️ Moderar anúncios e resolver disputas só existem depois do mercado.
- [x] **Painel de economia** — entrou × saiu por origem, Paletas em circulação, maiores saldos. ⚠️ Volume do mercado depende do mercado existir.
- [ ] **Configuração da economia** — taxa, preço de slot, preço mínimo e limites editáveis **sem deploy**, com log de alteração.

### 5.4 Ideias em aberto `[?]`

- [ ] Loja / doações (Pix, Mercado Pago, Stripe)
- [ ] Whitelist com aprovação
- [ ] Eventos e calendário
- [ ] Galeria de screenshots da comunidade
- [ ] Mapa interativo com as bases das guilds
- [ ] _______________________________

---

## 6. Design — moderno, clean e intuitivo

**Direção:** interface de produto, não de "site de servidor de game". Referências de acabamento: Linear, dashboard da Vercel, Raycast. Escuro, tipografia apertada, muito espaço negativo, zero poluição.

### 6.1 Princípios

- **Espaço antes de enfeite.** Respiro generoso entre blocos; se a tela parece cheia, tirar coisa, não diminuir fonte.
- **Uma ação primária por tela.** O resto é secundário ou fantasma.
- **Hierarquia por tipografia e peso**, não por caixinha colorida.
- **Sem gradiente berrante, sem glow, sem sombra pesada.** Profundidade vem de borda 1px sutil + variação de superfície.
- **Estado sempre visível**: loading = skeleton (nunca spinner solto), vazio = ilustração + CTA, erro = mensagem em português claro com o que fazer.
- **Intuitivo = previsível.** Mesmo componente, mesmo comportamento em todo lugar.

### 6.2 Sistema visual

**Paleta definida a partir da arte da comunidade: ouro sobre preto quente.** ✅

```css
/* Superfícies — preto quente, nunca #000 puro */
--bg:         #0B0A09;
--surface:    #14120F;
--surface-2:  #1E1A15;

/* Ouro — o acento, vindo da moeda */
--gold:       #E8B923;   /* acento principal, preço, CTA */
--gold-hi:    #F7DC7A;   /* hover, brilho, destaque */
--gold-deep:  #8B6914;   /* borda, sombra, estado inativo */

/* Texto */
--text:       #F2EFE9;
--muted:      #A39B8C;

/* Estado */
--success:    #6FA84A;
--danger:     #C8442E;
--line:       rgba(232, 185, 35, 0.14);   /* borda: ouro a 14%, não cinza */
```

| Token | Valor |
|---|---|
| Borda | 1px em `--line`, `radius` 12px (cards) / 8px (botões, inputs) |
| Espaçamento | escala de 4px (4/8/12/16/24/32/48/64) |
| Container | `max-w-6xl`, grid de 12 colunas |
| Tipografia display | condensada e pesada, para títulos e números grandes — o eco do cartaz |
| Tipografia texto | Inter ou Geist, `tabular-nums` obrigatório em preço e saldo |
| Movimento | 150–200ms `ease-out`, só `opacity` e `transform`; respeita `prefers-reduced-motion` |

#### ⚖️ A tensão que precisa ser resolvida com critério

A arte da comunidade é **maximalista**: grunge, raio, textura, guitarra, caveira. Você pediu um site **clean e intuitivo**. Os dois cabem — mas não na mesma camada:

| Camada | Tratamento |
|---|---|
| **Marca** — logo, moeda, hero da home, banner, estado vazio, tela de erro | 🎸 **Rock solto.** Textura, raio, ouro metálico, tipografia destruída |
| **Interface** — tabela, formulário, card de anúncio, painel, carteira | 🧊 **Limpa.** Superfície sólida, borda 1px, ouro só no que importa: preço, saldo, ação principal |

Regra prática: **o ouro é caro.** Se estiver em tudo, não vale nada. Um acento por tela.

- **Dark por padrão**, com toggle para light — os dois temas precisam estar corretos, não é o dark com as cores invertidas na marra.
- **Mobile-first de verdade**: a maioria vai entrar pelo link do Discord, no celular. Filtros viram drawer, tabelas viram cards, nav vira bottom bar.
- Acessibilidade: contraste AA, foco visível em tudo que é navegável por teclado.

### 6.3 Componentes-chave (biblioteca do projeto)

`StatusPill` (online/offline) · `ServerCard` · `PalCard` · `ItemCard` · `PriceTag` (Paletas) · `BalanceChip` (saldo no header) · `DataTable` (jogadores, extrato) · `FilterBar` · `EmptyState` · `Skeleton` · `ConfirmDialog` (ações destrutivas) · `Toast`.

### 6.4 Layout base

- **Header** slim e sticky com blur: logo · no máximo 5 links · `BalanceChip` · avatar do Discord.
- **Home**: hero curto com status ao vivo → destaques do marketplace → como conectar → Discord.
- **Marketplace**: grid responsivo 2 / 3 / 4 colunas, filtros à esquerda (drawer no mobile), busca no topo, ordenação à direita.
- **Footer** enxuto: regras, privacidade, Discord, status.

### 6.5 Identidade

- Logo / mascote `[?]` — já existe arte? Algum Pal como mascote da comunidade?
- Tom de voz: comunidade brasileira, acolhedora, direta. Sem gíria forçada, sem CAPS LOCK.

### 6.6 A marca — já existe, e é forte ✅

**Palleira → palheta → Paletas.** A moeda **é uma palheta de guitarra dourada com um "P"**, e a comunidade se posiciona como *"o servidor mais rock and roll de Palworld"*. Isso não é um detalhe bonitinho: é um sistema de marca completo, com trocadilho que fecha e que **ninguém consegue copiar**, porque nasce do nome.

**Ativos que já existem** (usar, não reinventar): logo **PALLEIRA BR** com caveira alada, guitarras cruzadas e chamas · moeda-palheta dourada · **mascote** (Pal roqueiro de jaqueta de couro, capacete e guitarra) · cartazes de servidor, VIP e evento · a assinatura *rock and roll*.

**A linguagem visual está estabelecida e é consistente:**

| Elemento | Como aparece |
|---|---|
| Cor | **ouro/âmbar** dominante, com laranja e vermelho de chama; **roxo/magenta** de luz de palco como secundária |
| Tipografia | display pesada, cromada, biselada, com contorno — cartaz de show |
| Símbolos | caveira alada · guitarras cruzadas · raio · chama · coroa · mão do rock 🤘 |
| Fundo | preto com faísca, brasa e textura |

➡️ **Isso confirma a paleta da §6.2** e resolve o `[?]` do mascote. O que muda: o **roxo/magenta** merece entrar como cor secundária (destaque, VIP, evento), com o ouro seguindo como acento principal.

⚠️ **A regra da §6.2 fica ainda mais importante.** Os cartazes são deliberadamente carregados — e funcionam, porque cartaz se olha por 3 segundos. **Interface se olha por 30 minutos.** Manter o rock na marca e no hero; tabela, formulário e card seguem limpos. O erro fácil aqui é transformar o site num cartaz gigante.

**Como isso vira interface:**

- **A palheta é o símbolo da moeda em todo lugar** — `BalanceChip` no header, `PriceTag` nos anúncios, extrato da carteira, mensagem do Palbot no Discord. Um símbolo só, reconhecível de longe. **Nada de emoji de moeda genérico.**
- **O ouro é o acento** e vem direto dela (§6.2).
- **O vocabulário do site é de rock, com moderação.** "Palco" para o hero, "setlist" para a lista, "bis" para o resgate — se soar natural. Se soar forçado, usar a palavra normal. Trocadilho ruim envelhece rápido.
- **Um mascote seria bom** `[?]` — algum Pal com guitarra? A caveira de fone que já aparece na arte também funciona.

> 📌 Pedir ao designer da comunidade os **arquivos vetoriais** (logo e moeda) e um **PNG da palheta em fundo transparente**, em pelo menos 512px. É o único ativo que o site realmente precisa e não dá para recriar.

---

## 7. Economia e Marketplace (Paletas)

O coração do site: jogador **sobe seus Pals e itens** e **vende por Paletas**, a moeda do Discord Palleira BR.

### 7.1 A moeda — Paletas

- Símbolo/ícone `[?]`. Sempre **inteiro**, nunca decimal/float no banco.
- As Paletas **já existem**: são os *points* do Palbot, com o nome trocado no dashboard (§4.7).

#### De onde vem Paleta hoje (as torneiras)

#### ✅ Configuração real, lida no dashboard do Palbot (22/08/2026)

| Sistema | Estado |
|---|---|
| **Economy** | ✅ ligado — moeda com o nome **Paletas** |
| **Pal Game** | ⛔ **desligado** |
| **Kit Shop** | ✅ ligado — já existe onde gastar |

**Por que o Pal Game desligado importa:** se estivesse ligado, ele pagaria **30 a 80 Paletas por aventura (a cada 4 min)** e **20 a 60 por batalha (a cada 3 min)** — mais de 1.500/hora para quem farmasse. Isso tornaria a doação de R$100 (250 Paletas) irrelevante e derrubaria toda a tabela de preços desta seção. **Se algum dia for ligado, esta calibração precisa ser refeita do zero.**

⚠️ **`/work` está configurado com recompensa negativa (−2 a −1) e cooldown de 31 anos** — na prática, desligado. Confirmar se foi intencional.

**Três torneiras, confirmadas:**

| Fonte | Como | Perfil |
|---|---|---|
| **Doação** | Pix / cartão / Mercado Pago, tabela da §7.13 | 💰 alto e instantâneo — R$100 vira 250 na hora |
| **Daily** | `/daily` no Discord, 1x por dia | 🕐 renda básica, constante — `[?]` **quanto dá por dia?** |
| **Eventos** | entrega de admin em evento, sorteio, premiação | 🎁 pontual — `[?]` com que frequência e valor? |

#### 🎸 O ciclo — modelo misto, e é o desenho certo

Todo mundo tem caminho, e os caminhos se alimentam:

```
        ┌──────────── DOA ────────────┐
        │   R$ ──▶ Paletas na hora    │
        ▼                             │
   ╔═════════════════════════════╗    │
   ║        MERCADO              ║    │
   ║  Paletas ⇄ Pals e itens     ║    │
   ╚═════════════════════════════╝    │
        ▲                             │
        │   farma ──▶ vende ──▶ 💰    │
        └──────────── JOGA ───────────┘

           daily = renda básica de todo mundo
```

- **Quem doa** troca dinheiro por tempo: compra o Pal bom em vez de farmar 40 horas.
- **Quem joga** farma, vende para quem doou e **ganha Paletas sem gastar um real** — e pode doar também, se quiser.
- **O daily** garante que ninguém fica em zero, mesmo sem doar e sem vender.

➡️ **Consequência para o roadmap:** o mercado é a **principal renda de quem não doa**. Sem ele, sobra só o daily e a economia vira "quem paga tem tudo". Isso reforça priorizar as Fases 5 e 6 (§12).

➡️ **Consequência para o balanço:** não precisa criar torneira nova. Precisa que o mercado **tenha movimento** — anúncio bom, gente comprando, preço justo. Torneira demais inflaciona; mercado ativo distribui.

#### 📐 A escala da moeda — `/daily` = 2 Paletas ✅

Com esse número, a economia fica calibrada:

| Referência | Valor |
|---|---|
| **1 Paleta** | ≈ **R$ 0,45** (R$0,50 no pacote de R$20, R$0,40 no de R$100) |
| **Daily** | 2/dia · **14 por semana** · **~60 por mês** |
| R$ 20 (40 Paletas) | = **20 dias** de daily |
| R$ 100 (250 Paletas) | = **125 dias** de daily |

**O free não fica de fora.** Um mês de daily rende 60 Paletas, mais que os 40 de uma doação de R$20. O doador ganha **velocidade**, não exclusividade — que é exatamente o equilíbrio certo.

#### 🔴 A consequência mais importante: **Paleta é moeda de número pequeno**

Um ano inteiro de daily dá 730 Paletas. A maior doação dá 250. Logo, **os preços do mercado têm que viver na casa das dezenas**, nunca dos milhares.

Se um Pal custar 5.000 Paletas, isso é R$2.000 ou 7 anos de daily. **Preço alto demais mata o mercado antes de ele nascer.**

**Faixas sugeridas para calibrar** `[?]` — ajustar depois de ver o mercado rodando:

| O quê | Preço sugerido | Equivale a |
|---|---|---|
| Item comum, recurso | 1 – 5 | 1 a 3 dias de daily |
| Item raro, bom equipamento | 10 – 30 | 1 a 2 semanas |
| Pal comum | 5 – 15 | poucos dias |
| **Pal bom** (IV alto, passivas boas) | 30 – 80 | 2 a 6 semanas |
| **Pal excepcional** (Alpha + 4 passivas rank alto + condensado + alma) | 100 – 250 | 2 a 4 meses, ou R$100 |
| Slot de cofre | 20 – 50 | o sink principal |
| Moldura de avatar | 15 – 40 | cosmético |

#### ⚠️ Número pequeno + inteiro quebra taxa percentual

A Paleta é **sempre inteira** (§7.1). Com preços na casa das dezenas, **5% de taxa some**: 5% de 10 Paletas é 0,5, que arredonda para 0 — o sink deixa de existir justo onde há mais volume.

**Como resolver:**

- **Arredondar a taxa para cima** (`ceil`), com **mínimo de 1 Paleta** por venda.
- Ou trocar por **taxa fixa em degraus** (1 Paleta até 20, 2 até 50, 5 acima disso) — mais previsível e mais fácil de explicar para a comunidade.
- **Nunca** deixar a taxa cair para zero. É o sink mais constante que existe.
- Cuidar do arredondamento também no repasse: o vendedor recebe `preço − taxa`, e a taxa **queima**. A soma tem que fechar no ledger, sempre.
- **Fonte da verdade do saldo** `[?]` — **a decisão mais importante do projeto**, porque o Palbot hospedado não tem API pública documentada:

| | Opção | Como funciona | Custo / risco |
|---|---|---|---|
| ~~**A**~~ | ~~Palbot continua dono~~ | — | ⛔ **DESCARTADA em 22/08/2026.** O dashboard foi vasculhado: a única coisa parecida com API é um "API Tester", que apenas testa as credenciais **do servidor Palworld** — não expõe nada do Palbot. Sem API, sem acesso a banco, sem caminho |
| **B** | **Self-host do Palbot** | Subir o [código arquivado](https://github.com/dkoz/palworld-palbot) (Python + Docker); o site lê e escreve **direto no banco do bot** | Controle total e saldo único. Assume um projeto congelado desde 29/01/2026 |
| **C** | **Site vira dono da economia** ✅ | Migra os saldos uma vez, desliga a economia do Palbot, e o site passa a mandar em `/daily`, ganhos e gastos | 🟢 **É o caminho.** Com a (A) descartada e a (B) presa a um projeto arquivado, sobra ela — e ela é a melhor de qualquer forma. **O site hospeda o bot por HTTP Interactions**, sem VPS: os comandos do Discord viram chamadas na Vercel, na mesma base de dados do portal. Uma economia só, sem sincronizar nada |
| **D** | Saldos separados | Duas moedas com transferência manual | ❌ **Evitar.** Diverge, confunde e vira suporte infinito |

- **Decisão:** `_____________________`
- Se for **C**: planejar a **migração dos saldos atuais** (exportar via `/checkpoints` ou banco) e comunicar a comunidade antes da virada. Ninguém pode perder Paleta.
- No site: `BalanceChip` no header, página **Carteira** com saldo + **extrato completo** (toda entrada e saída, com origem).

### 7.2 O que pode ser anunciado

- **Pals** — com ficha completa (espécie, level, passivas, IVs, variante).
- **Itens** — recursos, esferas, armas, munição, materiais de base, esquemas.
- `[?]` Outros: serviços (carry, base building), slots de VIP, coordenadas de base?

#### Mercado com 3 servidores — decisão `[?]`

Você tem **PVE FREE, PVE VIP e PVP FREE NEW** (§3.4), cada um com save próprio. Um Pal do PVE não existe no PVP. Como tratar:

- **(A) Um mercado por servidor.** Só compra e vende quem está no mesmo servidor. Simples, justo, e não bagunça o equilíbrio.

> 📌 **Com o PVP em standby (§3.4), essa decisão fica mais fácil.** Sobram os dois PVE, que têm taxas parecidas e público que se sobrepõe — dá para lançar com **mercado único entre os dois** e reavaliar quando o PVP entrar, que é onde o desequilíbrio realmente apareceria.
- **(B) Mercado único com entrega cross-server.** Tecnicamente dá — o template do Pal é entregue por comando em qualquer servidor. **Mas quebra o equilíbrio:** o PVE FREE tem **drop de inimigo 2x**, então vira fábrica de item barato para abastecer o PVP. Se for esse caminho, precisa de taxa maior ou lista de itens bloqueados no cross-server.
- **(C) Paletas globais, mercado por servidor.** Saldo único na comunidade, anúncios separados. **É o meio-termo que eu recomendo** — o jogador não perde Paleta ao trocar de servidor, e cada economia de item fica isolada.

**Decisão:** `_____________________`

> A carteira de Paletas é **do Discord**, não do servidor — então ela é global por natureza. O que precisa de decisão é só o anúncio.

### 7.3 Como o Pal/item chega ao site — ✅ **resolvido pelo PalDefender**

Com o PalDefender (§3.5 e §3.6), **o ciclo fecha inteiro** — não precisa parsear save, não precisa cadastro manual, não precisa combinar entrega. Tudo roda direto da Vercel.

| Etapa | Item | Pal |
|---|---|---|
| **1. Ler o que o jogador tem** | `GET /items/{uid}` ✅ | `GET /pals/{uid}` ou `exportpals <uid>` ✅ |
| **2. Retirar (custódia)** | `delitems <uid> <ItemId>:<qtd>` ✅ | **`deletepals <uid> <filtro> Limit=1`** ✅ |
| **3. Guardar** | item + quantidade no banco | template JSON no banco/Blob |
| **4. Entregar ao comprador** | `giveitems` / `POST /give/items/{uid}` ✅ | `givepal_j` / `POST /give/paltemplate/{uid}` ✅ — **o Pal exato**, não uma cópia genérica |
| **5. Devolver se cancelar** | mesmo comando de entrega | mesmo comando de entrega |

**Nenhum furo pendente:**

- ✅ **Clonagem resolvida.** O `deletepals` tira o Pal do vendedor de verdade. Sempre com **filtro específico + `Limit=1`**, e sempre **depois** de guardar o template — se o template não salvou, não deleta nada.
- ✅ **Leitura de inventário resolvida.** `GET /items/{uid}` e `GET /pals/{uid}` mostram exatamente o que o jogador tem. O site monta a tela de "escolher o que vender" a partir do inventário real — o jogador **seleciona**, não digita.
- ✅ **Fidelidade garantida.** A ficha do anúncio sai do template, então não tem como mentir em level, passiva ou IV.

**Ordem obrigatória das operações (nunca inverter):**

```
1. ler   → confirmar que o ativo existe
2. salvar → template/quantidade no banco  ← se falhar aqui, ABORTA
3. deletar → tirar do vendedor
4. publicar → anúncio no ar
```

Se o passo 3 falhar depois do 2, **cancelar o anúncio e não cobrar nada**. Se o passo 3 der certo mas o 4 falhar, o ativo já está em custódia — devolver com o comando de entrega.

#### 🏦 O modelo de cofre — adotar (ver §14)

Meu desenho anterior tinha um furo: exigia o jogador **online** para retirar e entregar, e resolvia isso com fila. Um **cofre na nuvem** desacopla tudo e resolve melhor:

```
JOGO  ──importar──▶  COFRE DO SITE  ──vender──▶  COMPRADOR
                          │                          │
                          └──────resgatar────────────┘──▶ JOGO
```

1. **Importar** — o jogador, conectado, manda Pal ou item do personagem para o **cofre do site**. Sai do jogo (`deletepals` / `delitems`), entra no inventário na nuvem.
2. **Anunciar** — vende **do cofre**, quando quiser. O ativo já está em custódia, então nada de reservar, congelar ou torcer.
3. **Comprar** — o ativo vai para o cofre do comprador na hora. **Ninguém precisa estar online.**
4. **Resgatar** — o comprador puxa para o jogo quando entrar (`givepal_j` / `giveitems`), no servidor que ele escolher.

**Por que é melhor:**

- ✅ Some a exigência de estar online — comprador e vendedor nunca precisam se cruzar.
- ✅ Some a fila de entrega e o risco de falha no meio da transação.
- ✅ O cofre vira **produto**: limite de slots que se compra com Paletas (§7.7).
- ✅ Permite escolher **em qual servidor resgatar** — é assim que o cross-server (§7.2) fica controlado, com flag por personagem.

**Controle por personagem** — quatro flags por personagem:

```json
{ "Name": "jonjon7D", "ServerName": "PVE FREE", "Online": true,
  "CanImportPals": true, "CanExportPals": true,
  "CanImportItems": true, "CanExportItems": true }
```

Quatro flags por personagem resolvem o equilíbrio dos 3 servidores: dá para deixar o PVE FREE **exportar** mas não **importar**, e assim o drop 2x dele não abastece o PVP.

⚠️ Continua valendo confirmar se `deletepals`/`giveitems` exigem o jogador online `[?]` — mas agora isso só afeta **importar e resgatar**, que são ações que o próprio jogador dispara estando no jogo. A compra e a venda ficam livres disso.

### 7.4 Ficha do Pal

**Origem: `GET /v1/pdapi/pals/{uid}` do PalDefender** — nada é digitado pelo jogador, então não dá para mentir na ficha.

#### ✅ Campos reais da API, verificados em 22/08/2026

Os Pals vêm separados em três grupos: **`Team`** (os 5 do time), **`Palbox`**
(no caso testado, 183) e **`BaseCamps`** (os que trabalham nas bases).

```json
{
  "PalID": "GhostDragon_Fire",     "Nickname": "",  "SkinId": "",
  "Gender": "Male",                "Level": 80,     "Exp": 144829235,
  "Shiny": false,                  "IsAwakening": false,
  "CondensedPals": 0,              "PartnerSkillLevel": 1,
  "PhysicalHealth": "Healthful",   "WorkerSick": "None",
  "HP": 11622,  "SP": 130,  "SAN": 100,  "CraftSpeed": 70,
  "IVs":      { "Health": 25, "AttackMelee": 0, "AttackShot": 23, "Defense": 67 },
  "PalSouls": { "Health": 20, "Attack": 20, "Defense": 20, "CraftSpeed": 0 },
  "Passives": ["MoveSpeed_up_3", "WorldTree_MoveSpeed", "Stamina_Up_3"],
  "ActiveSkills": [...],  "LearntSkills": [...],
  "team_slot_index": 0
}
```

Confirma o que a §14.3 tinha corrigido: **são 4 IVs** (Vida, Ataque corpo a
corpo, Ataque à distância, Defesa) e **Almas são eixo separado**.

#### Inventário — `GET /v1/pdapi/items/{uid}`

```json
"Inventory": { "Items": {
  "ContainerID": "0C6C278D-…",
  "UsedSlots": 14, "MaxSlots": 54, "FreeSlots": 40,
  "Slots": { "0": { "ItemID": "Money", "Count": 15909576 },
             "1": { "ItemID": "PalSphere_Ancient_1", "Count": 391 } }
}}
```

➡️ **A tela de "escolher o que vender" está resolvida:** o jogador vê o que
tem de verdade e clica, em vez de digitar e torcer.

⚠️ **Os dois exigem o jogador ONLINE.** É a única restrição — e é justamente
o que o modelo de cofre da §7.3 contorna.

```
PalId (ex.: BOSS_KabukiMan — o prefixo BOSS_ marca Alpha)  ·  nº da Paldeck
nome  ·  apelido  ·  gênero  ·  level
condensação (0–4 estrelas)  ·  consumo de comida (0–10)
Lucky (shiny)  ·  desperto (awakening)

IVs (4):    Vida · Ataque corpo a corpo · Ataque à distância · Defesa
Almas (4):  Vida · Ataque · Defesa · Velocidade de trabalho

elementos (1 ou 2)  ·  trabalhos (tipo + nível)  ·  passivas (nome + rank 1–5)
saúde física  ·  doença de trabalho
```

> ⚠️ **Correção de duas coisas que eu tinha escrito errado:** são **4 IVs**, não 3 — Vida, Ataque corpo a corpo, Ataque à distância e Defesa. E **Almas** (condensação de alma) são um **eixo separado dos IVs**: um Pal com alma investida vale bem mais, e isso precisa aparecer no card.

Complementos do site: arte do Pal por espécie (do nosso catálogo, servida do nosso Blob), print opcional do vendedor, descrição livre com limite de tamanho, dono atual e `source_hash` do template (anti-duplicação).

**Catálogo de referência (PalId → nome PT-BR, arte, tipo; ItemId → nome, ícone, raridade):**

São ~288 Pals e ~2.400 itens. Semear de **dataset open source**: [paldex](https://github.com/blaynem/paldex) (já traduzido), [PalworldDataExtractor](https://github.com/PalworldDataTools/PalworldDataExtractor) (extrai do `.pak` do próprio jogo) ou [PalworldApi](https://github.com/PalworldDataTools/PalworldApi).

**Regras do catálogo:**

- **Importar uma vez** para o nosso banco. Nunca consultar serviço de terceiro a cada page view.
- **Servir as imagens do nosso Vercel Blob.** Nada de hotlink em CDN alheio — é frágil, é indelicado e some sem aviso.
- Respeitar licença e atribuição da fonte.
- Prever chave sem tradução: em dataset de fã é comum aparecer item com o rótulo cru no lugar do nome. O site tem que cair para o `ItemId` em vez de mostrar lixo na tela.

**Decisão:** `_____________________`

### 7.5 Ficha do Item

```
item · categoria · quantidade · raridade · durabilidade (quando aplicável) · imagem
```

### 7.6 Fluxo de venda (com custódia)

Tudo automático, via RCON. O jogador **não combina nada com ninguém**.

1. **Anunciar** — vendedor escolhe o ativo e o preço.
   - Item: agente roda `delitems <uid> <item>:<qtd>`. **Deu erro = não tinha o item** → anúncio recusado.
   - Pal: agente roda `exportpals <uid>`, guarda o template, e o Pal entra em custódia.
2. **Publicar** — anúncio vai ao ar e é espelhado em `#mercado` no Discord.
3. **Comprar** — comprador clica; as Paletas são **congeladas** na carteira dele na hora.
4. **Entregar** — agente roda `giveitems` ou `givepal_j` no comprador.
   - Comprador **offline**? A entrega fica na fila e sai no próximo login (o agente vê pelo `playerlist`).
5. **Liquidar** — Paletas caem para o vendedor **menos a taxa**; tudo no ledger; `send msg` avisa os dois dentro do jogo e o Palbot notifica no Discord.
6. **Falhou a entrega?** Reverter tudo: descongela as Paletas do comprador e devolve o ativo ao vendedor. **Nunca deixar pela metade.**
7. **Cancelamento / expiração** devolve ativo e Paletas ao estado original — sempre.
8. **Disputa** abre ticket marcando os mods; admin resolve pelo painel, com log de auditoria.

### 7.7 Taxas e sinks (anti-inflação)

- Taxa de venda **queimada** — sai da economia, não vai para ninguém. ⚠️ **Não pode ser 5% puro**: com preços na casa das dezenas a taxa arredonda para zero. Usar `ceil` com mínimo de 1 Paleta, ou degraus fixos — ver a escala da moeda na §7.1.
- Taxa fixa de anúncio `[?]` para evitar spam de listagem.
- Limite de anúncios ativos por jogador `[?]`.
- **Preço mínimo por ativo** — piso anti-dumping, calculado pela raridade (Alpha, Lucky, passivas de rank alto, alma investida). Máximo por categoria `[?]`.

**Os sinks que realmente seguram a inflação** (§14.2) — sem eles a economia vira papel:

| Sink | Como funciona | Por que é bom |
|---|---|---|
| **Slots de cofre** | o cofre (§7.3) começa com poucos slots; slot extra custa Paletas | 🔥 o jogador **quer** gastar, e não entra item novo na economia |
| **Temporada com reset** | ranking zera de tempos em tempos; top da temporada fica registrado num hall | 🔥 dá motivo para voltar e limpa o acúmulo |
| **Queima por pontos** | jogador destrói Pal/item em troca de pontuação sazonal | 🔥 **tira ativo de circulação** com a comunidade participando de bom grado |
| **Cosmético de perfil** | moldura de avatar por raridade, comprada com Paletas | 🔥 sink puro, custo zero de economia |
| **Taxa de venda queimada** | 5% some | ✅ constante e silencioso |

> A regra: **toda Paleta que entra precisa ter para onde sair.** Se só existe `/daily` e `/work` entrando, em três meses tudo custa milhão.

### 7.8 Integridade da economia (não negociável)

- **Ledger de dupla entrada**: saldo é sempre `SUM(deltas)`, nunca um campo editado direto.
- **Toda** operação de moeda carrega `idempotency_key` — clique duplo, retry ou webhook repetido não pode gerar duas transações.
- Transação de banco atômica para debitar comprador + creditar vendedor + transferir ativo. Nada de operação pela metade.
- Rate limit e cooldown após vincular conta (evita conta descartável farmando).
- Auditoria imutável de tudo: anúncio, compra, cancelamento, ajuste manual de admin.
- Admin só ajusta saldo com **motivo obrigatório** registrado.

### 7.9 Schema (esboço)

```
users(id, discord_id, palworld_uid, created_at)
wallets(user_id, balance_int, updated_at)
ledger(id, user_id, delta, balance_after, kind, ref_id, idempotency_key, created_at)
listings(id, seller_id, kind, status, price, fee, created_at, expires_at)
pal_assets(id, listing_id, species, nickname, level, gender, variant, passives[], iv_hp, iv_atk, iv_def, source_hash)
item_assets(id, listing_id, item_key, qty, rarity)
orders(id, listing_id, buyer_id, price, fee, status, created_at)
escrow_holds(id, order_id, asset_ref, held_at, released_at)
audit_log(id, actor_id, action, target, payload, created_at)
```

### 7.10 Telas

- `/mercado` — grid com busca, filtros (tipo, espécie, level, passivas, faixa de preço), ordenação.
- `/mercado/[id]` — ficha completa + histórico de preço daquela espécie `[?]` + botão comprar.
- `/mercado/vender` — wizard de 3 passos: escolher ativo → definir preço → confirmar.
- `/painel/anuncios` — meus anúncios ativos, vendidos, expirados.
- `/painel/carteira` — saldo, extrato, transferir Paletas `[?]`.
- `/admin/economia` — ajuste de saldo, moderar anúncios, resolver disputas, ver inflação/circulação.

### 7.11 Upload de imagens

- **Vercel Blob** para prints de Pals e itens.
- Limite de tamanho e tipo (jpg/png/webp), conversão para WebP, thumbnail gerado no upload.
- Moderação: imagem de anúncio passa por aprovação `[?]` ou é liberada direto com denúncia.

### 7.12 Calibração recomendada — os números para começar

Proposta fechada, para ajustar depois de ver o mercado rodando. Tudo em Paleta inteira.

#### O daily fica em 2. Não mexer.

Parece pouco olhando um jogador, mas **o daily é a maior torneira da economia quando você soma todo mundo**:

```
100 pessoas pegando daily  →  100 × 2 × 30  =  6.000 Paletas/mês
                                             ≈ R$ 2.700 em moeda criada
```

Nenhuma doação chega perto disso. Ou seja: **o daily é o que dita a inflação**, não a doação. Subir para 5/dia multiplicaria a criação de moeda por 2,5 e derrubaria o valor da Paleta de todo mundo — inclusive de quem doou.

**Regra de ouro:** os sinks precisam absorver **70–80% do que entra por mês**. Abaixo disso, o preço de tudo sobe sozinho.

#### 🎛️ Não sabemos o tamanho da torneira ainda — e tudo bem

Quantas pessoas pegam daily por dia? Ninguém sabe hoje. **A solução não é adivinhar melhor: é fazer o site medir e deixar os números ajustáveis.**

**1. Nenhum número de economia fica no código.** Todos vivem numa tabela `economy_config`, editável no painel admin, com log de quem mudou o quê e quando:

```
daily_amount · fee_tiers · slot_prices · min_prices
max_active_listings · link_cooldown_hours · listing_fee
```

Mudar a taxa vira **um clique**, não um deploy. Sem isso, cada ajuste de balanço custa uma release — e balanço se ajusta muito.

**2. O painel de economia responde sozinho.** O ledger de dupla entrada (§7.8) já grava toda movimentação com o motivo, então o gráfico sai de graça:

| Painel mostra | Para quê |
|---|---|
| **Entrou vs. saiu** na semana, por origem | ver se os sinks estão absorvendo os 70–80% |
| **Paletas em circulação** (soma dos saldos) | o número mais importante: se sobe sem parar, é inflação |
| Quantos pegaram daily hoje | 🎯 **o número que falta** — o próprio site descobre |
| Volume e preço médio do mercado | ver se o preço de Pal está subindo |
| Top saldos | quem acumulou e pode desequilibrar |
| Doações do mês | quanto entra por fora |

**3. O plano de calibração:**

```
Semana 1–2   →  no ar com os números desta seção como padrão
Semana 3–4   →  olhar o painel: entrou × saiu, circulação
Mês 2        →  ajustar taxa e preço de slot pelo painel, sem deploy
```

➡️ **Nenhuma pergunta de número trava o começo.** Os valores propostos aqui são chute educado suficiente para as primeiras semanas, e depois disso você decide com dado real em vez de opinião.

#### Taxa de venda — degraus, não percentual

| Preço do anúncio | Taxa | Na prática |
|---|---|---|
| até 20 | **1** | 5–100% nos baratinhos, e tudo bem: desestimula anúncio de lixo |
| 21 – 50 | **2** | ~4–10% |
| 51 – 100 | **4** | ~4–8% |
| acima de 100 | **5%**, arredondado para cima | proporcional nos caros |

Sempre **queimada**. Fácil de explicar no Discord: *"até 20 Paletas custa 1"*.

#### Slots de cofre — preço dobrando (o sink principal)

| Slot | Preço | Acumulado |
|---|---|---|
| 1–3 | **grátis** | — |
| 4º | 15 | 15 |
| 5º | 30 | 45 |
| 6º | 60 | 105 |
| 7º | 120 | 225 |
| 8º+ | dobra sempre | — |

Preço que dobra é o melhor sink que existe: quem tem muita Paleta gasta muito, e ninguém é obrigado a comprar. VIP do Discord começa com 5 grátis `[?]`.

#### Preço mínimo por anúncio (anti-dumping)

| Ativo | Mínimo |
|---|---|
| Item comum | 1 |
| Item raro / equipamento bom | 5 |
| Pal comum | 3 |
| Pal Alpha ou Lucky | 20 |
| Pal com 3+ passivas rank 4–5 | 40 |
| Pal condensado (4 estrelas) | 40 |

#### Cosmético e temporada

- Moldura de avatar: **20 a 50**, algumas só por conquista, não por Paleta.
- Queima sazonal: Pal ou item destruído vira ponto de ranking. **Sem devolver Paleta** — o valor sai de vez.

#### Transferir Paleta direto entre jogadores? **Eu não faria** `[?]`

Como a Paleta se compra com dinheiro (§7.13), transferência livre vira porta para revenda por fora: alguém compra R$100, passa para outro e recebe Pix. Você perde o controle e ganha dor de cabeça.

- **Recomendado:** sem transferência direta. Quem quer passar valor, **vende algo no mercado** — que é rastreado, taxado e auditado.
- Se for permitir mesmo assim: taxa alta (20%+), limite mensal e log de auditoria.

#### A tabela de doação está boa

R$20→40 até R$100→250 escalona de 2,0 a 2,5 Paletas por real. Premia o pacote maior sem distorcer. **Manteria como está.**

---

### 7.13 O que a comunidade JÁ tem — levantado da arte oficial (21/08/2026)

A Palleira não é um servidor sem estrutura esperando um site. **Já existe uma camada de jogo inteira**, e o portal precisa refletir isso, não competir com isso.

#### VIP mensal — receita recorrente, diferente da doação avulsa

| Plano | Valor/mês | Paletas | Destaques |
|---|---|---|---|
| **VIP HARD METAL** | R$ 20 | 30 | whitelist do PVE VIP · dobro de prêmio em evento · 3 Paletas de desconto em kit e Pal Monster · 1.000 moedas cachorro · 50 cristais de prata · 30 esferas soraliticas · 20 esferas antigas · 20 núcleos de IA · 1 booster |
| **VIP NEW METAL** | R$ 40 | 60 | tudo acima · 4 de desconto · 2.000 moedas · 200 bilhetes de batalha · 200 provas de recompensa · 80 cristais · 50 soraliticas · 30 antigas · 30 núcleos · 2 boosters |
| **VIP PALLEIRA** | R$ 60 | 90 | tudo acima · 5 de desconto · 2.500 moedas · 350 bilhetes · 350 provas · 120 cristais · 80 soraliticas · 50 antigas · 50 núcleos · 4 boosters |

➡️ **Assinatura mensal muda o desenho do §7.13.** Não é só cobrança avulsa: precisa de recorrência, controle de vigência, renovação, expiração e **entrega mensal automática** do pacote. O Mercado Pago faz assinatura — e o site pode aplicar o cargo VIP no Discord e a whitelist no servidor sozinho, no dia da renovação.

#### Lojas e espaços que já existem

- **`/shop`** — comando de loja
- **Mercado Black Metal** — onde se gasta Paleta hoje
- **Galeria Palleira** — onde ficam os **Pal Monsters** (Pals especiais)
- Kits (via Palbot, §4.7)

➡️ O marketplace do site **não substitui** isso: ele é o mercado **entre jogadores**, ao lado da loja da casa. Definir se o Mercado Black Metal migra para o site ou continua no Discord `[?]`.

#### Moedas e recursos além da Paleta

`moedas cachorro` · `bilhetes de batalha` · `provas de recompensa` · `cristais de prata` · `esferas soraliticas` · `esferas antigas` · `núcleos de IA` · `boosters`

➡️ **A economia é multi-moeda.** O modelo da §7.9 precisa suportar **N moedas**, não só Paleta: `wallets(user_id, currency, balance)` em vez de um campo `balance`. Mudança pequena agora, refatoração dolorosa depois. `[?]` quais dessas o site precisa exibir e movimentar?

#### 🔴 Cartaz x realidade — divergência encontrada em 21/08/2026

Comparei o cartaz do VIP com o que o servidor devolve em `/v1/api/settings`:

| Anunciado no cartaz | Servidor de verdade |
|---|---|
| XP **0.5** | **0.4** ❌ |
| Drop de itens **1.5** | **1.0** ❌ |
| **SEM FÔLEGO** | `PlayerStaminaDecreaceRate: 1` (drena normal) ❌ |
| 25 Pals na base | 25 ✅ |
| 2000 construções | 2000 ✅ |
| 2 bases | 2 ✅ |
| Sem peso | `ItemWeightRate: 0` ✅ |

São pessoas pagando R$20–60/mês por isso. Ou o `.ini` sobe para cumprir o anúncio, ou o anúncio desce para a realidade. ("Sem fôlego" pode estar em mod, não no `.ini` — conferir no jogo antes de mexer.)

➡️ **Regra que nasce daí: o site NUNCA escreve taxa na mão.** Toda página de "Como jogar" e todo card de servidor lê de `/v1/api/settings` ao vivo. Cartaz envelhece, `.ini` muda, ninguém lembra de atualizar — **a API não mente**. Isso vira uma vantagem real do portal sobre qualquer imagem no Discord.

#### Guitarras Elementais — sistema de evento já rodando

- 9 guitarras de elementos diferentes; juntando as 9, troca por **+10 IV** em qualquer Pal (menos Pal Monster da Galeria)
- ⚠️ **IV acima de 150 castra o Pal** — regra própria da comunidade
- Distribuídas aos **3 finalistas de todo evento**, somadas à tabela **todo sábado**
- **Líder de ginásio da semana** ganha 3 (uma do seu elemento + 2 à escolha)
- **Top 1 do pódio semanal** ganha 1
- **Uso individual: não pode ser repassada nem vendida** ← precisa virar trava no marketplace

➡️ Isso dá ao site: **coleção de guitarras** no perfil (9 slots, visual ótimo), **ginásio** e **pódio semanal**, e **calendário de eventos**. Também exige `is_tradeable: false` por tipo de ativo desde o começo.

---

### 7.14 Doações — as Paletas já são vendidas por dinheiro real 💰

**Fato novo e importante:** a comunidade já vende Paletas por doação, com tabela publicada.

| Doação | Paletas | Paleta por real |
|---|---|---|
| R$ 20 | 40 | 2,00 |
| R$ 40 | 90 | 2,25 |
| R$ 60 | 140 | 2,33 |
| R$ 100 | 250 | 2,50 |

Meios: **Pix, cartão e Mercado Pago**. Fluxo de hoje: doar → **mandar o comprovante para um administrador no Discord** → receber as Paletas na mão.

#### 🔥 A maior oportunidade de automação do projeto

Esse "manda o comprovante para o admin" é trabalho manual, lento, sujeito a erro e a golpe de comprovante falso — e depende de alguém estar acordado. **O site resolve isso sozinho:**

1. Jogador logado escolhe o pacote em `/doar`.
2. Site gera a cobrança via **Mercado Pago** (Pix ou cartão) já vinculada ao `discord_id`.
3. **Webhook do Mercado Pago** confirma o pagamento.
4. Site credita as Paletas **na hora, automaticamente**, com `idempotency_key` — webhook repetido não credita duas vezes.
5. Palbot agradece no Discord e o extrato registra a origem.

Ganho: **zero trabalho de admin, crédito instantâneo 24h, comprovante falso deixa de existir** (o site não olha imagem, olha o webhook) e cada doação fica auditada no ledger.

- Conta Mercado Pago com credenciais de produção `[?]`
- Assinatura do webhook conferida sempre (nunca confiar no corpo puro)
- Manter o fluxo manual como plano B enquanto o automático não estiver validado

#### ⚠️ Duas coisas que mudam por causa disso

**1. Corrigindo o que eu escrevi antes sobre caixa de recompensa.** Eu disse que lootbox era tranquilo porque a moeda "não tem valor real". **Isso está errado** — a Paleta tem preço de tabela, entre R$ 0,40 e R$ 0,50. Uma caixa de prêmio aleatório comprada com moeda que se compra com dinheiro é **outra categoria de coisa**, e no Brasil é assunto sensível. Se for fazer:

- **Taxa de drop pública e visível na própria tela**, não enterrada numa regra.
- **Nunca** vender caixa direto por dinheiro — só por Paletas ganhas no jogo, se quiser ser conservador.
- Restrição por idade `[?]` e sem mecânica de "quase ganhou".
- **Alternativa mais segura:** vitrine com preço fixo, onde o jogador vê o que está comprando. Dá quase o mesmo resultado de engajamento sem a parte problemática.

**2. A economia tem entrada de dinheiro real, então os sinks importam mais.** Doação injeta Paletas sem nenhum esforço de jogo. Sem os sinks da §7.7, quem doa domina o mercado e quem joga desiste. O equilíbrio é: **doação compra conveniência e cosmético; jogo compra poder.**

- Manter as Paletas **não-sacáveis** — entram, circulam, mas não viram dinheiro de volta. Isso mantém a economia fechada e é o que a distingue de mercado de item por dinheiro real.
- Deixar claro nas regras que é **doação de apoio ao servidor**, com a Paleta como agradecimento — não venda de item de jogo.
- Rodapé de projeto de fã, sem vínculo com a Pocketpair (§14.4).

---

## 8. Estrutura de pastas alvo

```
palleira-portal/
├─ app/
│  ├─ (public)/       page.tsx, status/, conectar/, regras/, ranking/, faq/
│  ├─ (auth)/         login/, vincular/
│  ├─ painel/         perfil/, tickets/
│  ├─ admin/          jogadores/, broadcast/, logs/, servidores/
│  └─ api/
│     ├─ auth/[...nextauth]/route.ts
│     ├─ palworld/status/route.ts          (runtime nodejs)
│     ├─ palworld/players/route.ts
│     ├─ palworld/admin/[action]/route.ts
│     ├─ bot/[...]/route.ts                (webhooks do Palbot, HMAC)
│     └─ cron/collect/route.ts             (Vercel Cron)
├─ components/   ui/ + server-status/ + player-table/
├─ lib/          palworld/(rest.ts, rcon.ts), discord/(api.ts, webhook.ts), db/, auth.ts, rbac.ts
├─ db/           schema.ts, migrations/
└─ vercel.json   crons, headers, redirects
```

---

## 9. Variáveis de ambiente

```env
# Site
NEXT_PUBLIC_SITE_URL=https://palleira.com.br
AUTH_SECRET=
AUTH_URL=https://palleira.com.br

# Discord
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_WEBHOOK_STATUS=
DISCORD_WEBHOOK_ADMIN_LOG=
DISCORD_ROLE_ADMIN=
DISCORD_ROLE_MOD=
DISCORD_ROLE_VIP=

# Palworld — os 3 servidores (§3.4). Host e portas podem ficar no banco;
# SENHAS E TOKENS ficam sempre aqui, nunca no banco e nunca no código.

# PVE FREE — enx-soc-20.enx.host  (RCON 10055 / REST 10056)
SRV1_ADMIN_PASSWORD=
SRV1_RCON_PASSWORD=
SRV1_PALDEFENDER_TOKEN=

# PVE VIP — enx-cirion-30.enx.host  (RCON 10055 / REST 10056)
SRV2_ADMIN_PASSWORD=
SRV2_RCON_PASSWORD=
SRV2_PALDEFENDER_TOKEN=

# PVP FREE NEW — enx-cirion-16.enx.host  (RCON 10056 ⛔ desativado / REST 10058)
SRV3_ADMIN_PASSWORD=
SRV3_RCON_PASSWORD=
SRV3_PALDEFENDER_TOKEN=

# Porta do PalDefender (§3.6) — confirmar por servidor
PALDEFENDER_PORT=17993

# FTP do host (§3.7)
FTP_HOST=
FTP_PORT=21
FTP_USER=
FTP_PASSWORD=
FTP_PALDEFENDER_PATH=Pal/Binaries/Win64/PalDefender

# Palbot <-> site
PALBOT_SHARED_SECRET=
PALBOT_API_URL=

# Economia / Marketplace
PALETAS_SOURCE=palbot            # palbot | site  (ver §7.1)
MARKET_FEE_BPS=500               # 5% em basis points
MARKET_LISTING_FEE=0
MARKET_MAX_ACTIVE_LISTINGS=10
MARKET_LINK_COOLDOWN_HOURS=24

# Dados e arquivos
DATABASE_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
BLOB_READ_WRITE_TOKEN=
```

Cadastrar tudo com `vercel env add <NOME> production|preview|development`. **Nenhum segredo em `NEXT_PUBLIC_*`.**

---

## 10. Segurança (não negociável)

### 10.0 Credenciais — decisão registrada

**Decisão do dono (21/08/2026): as senhas de admin atuais ficam como estão.** Registrado; o projeto segue com elas.

Contexto para quando for reavaliar: a REST API dos três está aberta na internet (`HTTP 401` confirmado em `10056`, `10056`, `10058`) e usa Basic Auth sobre HTTP puro, então a senha de admin é o único obstáculo entre um estranho e um `shutdown`/`ban`. Trocar leva 5 minutos: `openssl rand -base64 32`, colar no `.ini`, reiniciar.

**Como o portal reduz o risco do próprio lado, já que as senhas ficam:**

1. **Token do PalDefender com permissões estreitas** (§3.6) — o site usa `REST.Items.Give`, `REST.Pals.Read` e afins, **nunca `REST.*`**. O token do portal não consegue banir nem desligar servidor.
2. **Token novo e exclusivo por servidor**, 64 caracteres aleatórios, gerado agora e nunca reaproveitado de nada.
3. **Nenhuma credencial sai do servidor** — só Route Handlers falam com o jogo; o navegador nunca vê senha nem token.
4. **Rate limit** em todo endpoint que dispara comando no jogo.
5. **Auditoria** de toda ação que toca o servidor: quem, quando, o quê.
6. **Não espalhar mais** — as senhas atuais não entram em commit, print, canal do Discord nem neste documento.

> ⚠️ **Este documento não guarda credencial.** Tudo vive em variável de ambiente (§9). Se o `PROMPT.md` for para um repositório, ele continua sem nenhuma senha dentro.

- Credenciais de RCON/REST ficam **só** no servidor (Route Handlers), nunca chegam ao cliente.
- Toda ação admin revalida sessão **e** cargo no Discord no momento da ação — não confiar em JWT antigo.
- Rate limit nos endpoints de ação (Upstash Ratelimit).
- Webhooks do Palbot: HMAC-SHA256 + timestamp com janela de 5 minutos.
- Log de auditoria imutável para kick / ban / shutdown **e para toda movimentação de Paletas**.
- Economia: ledger de dupla entrada, idempotência e transação atômica — regras completas na §7.8.
- Upload de imagem: validar tipo real do arquivo (não confiar na extensão), limitar tamanho, servir do Blob e nunca do domínio principal.
- Headers de segurança: CSP, HSTS, `X-Frame-Options`, `Referrer-Policy` via `next.config` / `vercel.json`.
- LGPD: armazenar apenas ID e nome do Discord + ID do Palworld; publicar página de privacidade.

### 🔴 10.1 A API devolve o IP dos jogadores — nunca deixar vazar

`GET /v1/api/players` retorna, para **cada jogador online**, um campo `iP` com o **endereço IP real** dele:

```json
{ "name": "...", "userId": "steam_765...", "iP": "177.140.14.190", "ping": 39.3, "level": 38 }
```

Endereço IP é **dado pessoal sob a LGPD**, e num servidor de jogo é vetor de ataque: dá para geolocalizar, e dá para derrubar a internet de alguém. Já vi comunidade rachar por menos.

**Regras, sem exceção:**

1. **Descartar o `iP` no servidor**, na mesma função que consome a API. Ele **nunca** entra num payload que vai para o navegador — nem no painel do jogador, nem no do admin.
2. **Não persistir IP no banco.** Nada de "log de conexões com IP".
3. Cuidado redobrado com **cache**: se a resposta crua da API for parar no Redis ou num JSON público, o vazamento acontece sem ninguém perceber.
4. O mesmo vale para `getip` do PalDefender (§3.5) — comando de emergência, só admin, nunca exposto em tela.
5. Filtrar antes de logar. `console.log` da resposta inteira num serviço de log já é vazamento.

> **Regra prática:** a função que fala com a API do jogo devolve um objeto **já limpo** — nome, userId, level, ping. O `iP` morre ali dentro e não sai. Assim ninguém precisa lembrar de filtrar depois.

---

## 11. Passos de deploy (Vercel CLI)

```bash
npm i -g vercel
npx create-next-app@latest palleira-portal --ts --tailwind --app --eslint
cd palleira-portal
vercel login
vercel link                  # cria/associa o projeto
vercel env add <variável>    # repetir para cada uma da §9
vercel                       # deploy de preview
vercel --prod                # produção
vercel domains add palleira.com.br
```

**DNS do `.com.br` (Registro.br):** apontar `A @ → 76.76.21.21` e `CNAME www → cname.vercel-dns.com`, ou trocar os nameservers para os da Vercel. `[?]` Onde o `palleira.com.br` está registrado hoje?

---

## 12. Fases de entrega

| Fase | Escopo | Pronto quando |
|---|---|---|
| **0** | Setup: Next.js + Tailwind + shadcn + **design system da §6** + primeiro deploy + domínio | `palleira.com.br` no ar com a landing e os componentes base |
| **1** | **Login com Discord** + checagem de guild + mapeamento de cargos | membro do Palleira BR entra e vê o painel; não-membro é barrado |
| **2** | Status do Palworld em tempo real (REST + cache + cron) | a home mostra jogadores online de verdade — ✅ **API já validada, §3.4** |
| **3** | **Vinculação do ID do jogo** + perfil do jogador | `/vincular` funciona ponta a ponta com o Palbot |
| **4** | **Carteira de Paletas** — ledger, extrato, migração/sincronia conforme a decisão da §7.1 | saldo do site bate com o do Discord, sempre |
| **5** | **Marketplace v1 — itens**: anunciar, comprar, custódia, taxa, **entrega por RCON (`giveitems`)** | duas pessoas fecham uma venda de item ponta a ponta, com entrega automática |
| **6** | **Marketplace v2 — Pals**: `deletepals` + `givepal_j` + catálogo Paldeck | Pal entregue idêntico ao anunciado, e some da conta do vendedor ✅ |
| **7** | Painel admin: kick/ban/anúncio/save, auditoria, disputas, ajuste de saldo | mod resolve uma disputa pelo site e o log aparece no Discord |
| **8** | Ranking, notícias, FAQ, SEO, polimento visual | site completo |
| **9** | Extras `[?]` (doações reais, whitelist, eventos, mapa) | — |

---

## 13. Perguntas em aberto (responder antes da Fase 1)

### ✅ Já respondidas

| | Resposta |
|---|---|
| Palbot existe? | Sim, o **hospedado** — capacidades mapeadas na §4.7 |
| Onde roda o servidor? | **ENX Host**; acesso por RCON, FTP e painel. Sem SSH → sem agente próprio (§3.3) |
| Quantos servidores? | **3** — PVE FREE, PVE VIP, PVP FREE NEW. Portas mapeadas e **testadas** (§3.4) |
| A Vercel alcança os servidores? | **Alcança** ✅ — REST respondeu `HTTP 401` nos três |
| Tem PalDefender? | **Tem, v1.8.3** ✅ (a última) — já inclui `deletepals` e a REST API completa (§3.5, §3.6) |
| Trocar as senhas de admin? | **Não** — decisão do dono, registrada na §10.0 com as mitigações do lado do portal |
| Dá para remover Pal do jogador? | **Dá:** `deletepals <uid> <filtro>` — clonagem resolvida (§3.5) |
| Dá para ler o inventário? | **Dá:** `GET /items/{uid}` e `GET /pals/{uid}` na API do PalDefender (§3.6) |
| O Palbot tem economia? | Tem — `/daily`, `/work`, `/balance` (§4.7) |

### 🔴 Travando o começo

1. ~~RCON no PVP FREE NEW~~ 🟡 **standby** — sobe com os 2 PVE, PVP entra depois com uma flag (§3.4).
2. 🔧 **Ligar a REST API do PalDefender nos 2 PVE** — `RESTConfig.json` + arquivo de token, passo a passo na §3.6. O PVP fica para depois.
3. 🔧 **Pedir ao ENX Host para liberar a porta da API do PalDefender** (17993 ou a alocação que eles derem).
4. **O dashboard do Palbot tem seção de API / token / webhook?** Define a fonte da verdade das Paletas (§7.1). Se não tiver, vamos de opção C.
5. **Credenciais de FTP** dos 2 PVE (§3.7) — direto no `vercel env`, não em chat.
6. **O jogador precisa estar online** para `deletepals` e `giveitems` funcionarem? Muda o desenho da fila de entrega (§7.3).
7. **Mercado por servidor ou cross-server?** (§7.2) — recomendo Paletas globais + anúncio por servidor.

### 🟡 Para definir antes de codar

5. 🔴 **`palleira.com.br`: registrado e no seu nome ✅ — mas o dev anterior, que abandonou o projeto, ainda tem acesso à conta.** Resolver **antes** de mexer em DNS:
   1. Trocar a senha do Registro.br
   2. **Conferir e-mail e telefone da conta** — se o e-mail for dele, trocar a senha não adianta (ele recupera por "esqueci a senha"). É o item mais importante
   3. Ativar verificação em duas etapas
   4. Revisar contatos administrativo e técnico do domínio
   5. Conferir data de expiração e renovação
   6. Anotar os servidores DNS atuais antes de alterar
   > O domínio é o único ativo do projeto que **não se reconstrói**.
6. ~~Quantos servidores?~~ ✅ **3**, mapeados e testados (§3.4).
7. Quantos membros o Discord tem hoje? *(não trava nada — o painel de economia da §7.12 descobre sozinho depois que estiver no ar)*
8. ~~Identidade visual?~~ ✅ **Existe e é forte** — palheta dourada, rock and roll (§6.6). Falta: **os vetores do logo e da moeda**.
9. Quem mais vai administrar o site além de você?
10. ~~Como se ganha Paletas?~~ ✅ **Doação + daily (2/dia) + eventos** — economia calibrada na §7.1. Falta: com que frequência e valor saem as Paletas de **evento**?
11. Quanta Paleta já circula? Tem gente com saldo alto que se irritaria com uma migração?
12. Qual **taxa de venda** cobrar? ⚠️ Ler a escala da moeda na §7.1 antes de decidir — percentual puro arredonda para zero.
13. Começar **só com itens** (mais simples) ou já entrar com Pals?
14. Jogador pode **transferir Paletas** direto para outro, ou só via venda?
15. Você já usa os **kits** do Palbot? O marketplace substitui ou convive?
16. ~~Vai ter monetização real?~~ ✅ **Já tem** — doações com tabela de Paletas (§7.13). Falta: **credenciais do Mercado Pago** para automatizar o crédito.
17. Quanto do que o **PalAPI** já faz (mapa, métricas) vale reimplementar no site? (§3.6)

---

## 14. Benchmark de mercado — portal concorrente (BR)

> ⚠️ **Regra do projeto: não citar nome, marca, URL nem autor de terceiros** — nem aqui, nem no código, nem no site. Esta seção descreve **mecânicas de produto** observadas no mercado, que é o que se estuda em qualquer projeto. Nada de asset, código, texto ou identidade de ninguém. Ver as travas da §14.4.

Existe outro portal brasileiro de Palworld já rodando, com marketplace, ranking e economia própria. Serve como prova de que o que planejamos funciona — e como régua.

**Stack observada:** ASP.NET Core / Razor + Bootstrap. Rodando em **máquina própria**, HTTP puro em porta alta, atrás de IP dinâmico.

### 14.1 Por que eles não têm o problema de porta que a gente tem

Rodam **na própria máquina**: controlam todas as portas, sobem processo 24/7, leem save direto. A gente está em **host alugado + Vercel**, então depende de alocação do host (§3.6).

Isso **não é limitação do nosso plano** — é do host. E a liberdade deles custa caro: URL com porta alta, **sem HTTPS** (senha de login trafega em texto puro) e site que cai junto com a internet e a luz da casa. `palleira.com.br` na Vercel nasce com TLS, domínio de verdade e uptime que não depende de ninguém.

### 14.2 Mecânicas observadas — o que vale ter

| Mecânica | O que é | Veredito |
|---|---|---|
| **Cofre na nuvem** | jogador importa Pal/item do jogo para um inventário no site; vende e resgata de lá | 🔥🔥 **já adotado** (§7.3) — é o que elimina a exigência de estar online |
| **Slots de cofre pagos** | limite de Pals/itens guardados, com slot extra comprado na moeda | 🔥🔥 **sink perfeito** — o jogador *quer* gastar, e não injeta item na economia |
| **Flags por personagem** | `CanImport/CanExport` de Pal e item, por personagem e servidor | 🔥 **essencial com 3 servidores** — é o que controla o cross-server (§7.2) |
| **Leilão** | lance com prazo | 🔥 formato certo para Pal raro; vira evento na comunidade |
| **Mercado rotativo** | vitrine com estoque limitado e preço alto | 🔥 cria urgência e queima moeda |
| **Caixa de recompensa** | prêmio aleatório por raridade | 🔴 **cuidado redobrado** — a Paleta **tem** preço em reais (§7.13). Ver as travas lá antes de considerar |
| **Temporada com reset + hall dos campeões** | ranking zera, top da temporada fica registrado | 🔥🔥 dá motivo para voltar e é o maior sink de todos |
| **Queima de ativos por pontos** | jogador destrói Pals/itens em troca de pontuação sazonal | 🔥🔥 tira ativo de circulação com a comunidade **querendo** participar |
| **Preço mínimo por anúncio** | piso de preço por ativo | ✅ anti-dumping, entra na §7.7 |
| **Recompensa diária com contador** | botão de daily com tempo até o próximo | ✅ já existe no Palbot (`/daily`) |
| **Níveis de VIP** | conta free vs. VIP | ✅ conversa com o cargo VIP do Discord e com o servidor PVE VIP |
| **Avatar com moldura por raridade** | cosmético de perfil | 🔥 sink puro, custo zero de economia |
| **Descrição escrita pelo vendedor** | texto livre no anúncio | ✅ com limite de tamanho e moderação |
| **Busca dentro do inventário e da vitrine** | campo de busca client-side | ✅ básico, mas faz falta quando passa de 50 itens |

### 14.3 Ficha de Pal — campos que faltavam no nosso modelo

O modelo deles carrega mais coisa do que eu tinha previsto na §7.4. Corrigido:

```
PalId (ex.: BOSS_KabukiMan)   ← o prefixo BOSS_ marca Alpha
Paldex #  ·  nome  ·  apelido  ·  gênero  ·  level
Stars (condensação 0–4)  ·  ConsumptionFood (0–10)
Shiny (Lucky)  ·  IsAwakening
IVs: Vida · Ataque corpo a corpo · Ataque à distância · Defesa   ← são 4, eu tinha 3
Almas: Vida · Ataque · Defesa · Velocidade de trabalho
Elementos (1 ou 2)  ·  Trabalhos (tipo + nível)  ·  Passivas (nome + rank 1–5)
Saúde física  ·  doença de trabalho
```

⚠️ **Dois detalhes que eu tinha errado:** são **4 IVs**, não 3, e **Almas** (condensação de alma) são um eixo separado dos IVs — Pal com alma investida vale mais e precisa aparecer no card.

### 14.4 Travas de diferenciação — obrigatórias

Ideia e mecânica de jogo não são exclusividade de ninguém: marketplace, leilão e temporada existem em dezenas de jogos. O que **não** se copia é a **expressão** — e é aí que mora o risco. Regras do projeto:

1. **Nome e marca:** nunca citar o portal concorrente, o autor, o domínio ou a moeda deles. Nossa moeda é **Paletas**, nossa marca é **Palleira**.
2. **Zero código de terceiros.** Nada de copiar HTML, CSS, classe, animação ou estrutura de página. Nossa stack (Next.js + Tailwind + shadcn) já garante que nem sai parecido.
3. **Zero asset de terceiros.** Nenhuma imagem, ícone, banner ou avatar vindo do site deles. Arte da comunidade Palleira, ou biblioteca com licença clara.
4. **Visual próprio.** Eles são Bootstrap escuro com cartão de vidro, borda brilhante e cartão que vira. A gente segue a §6: superfície sólida, borda 1px discreta, muito espaço, **sem flip card, sem glow, sem gradiente forte**. Tem que dar para bater o olho e ver que é outro produto.
5. **Texto nosso.** Nenhum título, descrição ou microcópia copiada. Escrever tudo do zero, na voz da Palleira.
6. **Nomes de funcionalidade diferentes.** Mesma mecânica, nome nosso — e de preferência com a cara da comunidade.
7. **Imagens de Pal:** não puxar do CDN de terceiro nem hotlinkear. Usar dataset com licença (§7.4) e **servir do nosso próprio Blob**.

> Vale lembrar que a arte e os nomes dos Pals são da **Pocketpair** — todo portal de fã opera sob tolerância. Manter o rodapé com "projeto de fã, sem vínculo com a Pocketpair" e não vender nada por dinheiro real que envolva material do jogo. Isso protege bem mais do que se preocupar com o concorrente.
---

## 15. O site anterior — não reaproveitar

Existe um site antigo no ar em `palleira.com.br`, deixado pelo dev que abandonou o projeto.

> 💬 **Decisão do dono (21/08/2026):** *"não copia nada dele. Não tenho acesso, e quero criar algo independente."*

**Regra do projeto: nada dele entra aqui.** Nem nome de seção, nem estrutura, nem funcionalidade, nem texto. O portal nasce do zero, com a identidade da §6 e o escopo das §5 e §7. A única coisa em comum é o **login pelo Discord** — e essa já era a decisão da §4.1 por mérito próprio: a comunidade vive no Discord, os cargos já existem, e ninguém precisa criar senha nova.

### 15.1 🔴 O que importa: o DNS

O domínio **resolve e serve aquele site hoje**, e você não tem acesso à hospedagem dele.

A boa notícia: **você não precisa.** O domínio está no seu nome no Registro.br (§13), então é de lá que se resolve — apontando o DNS para a Vercel, o site antigo simplesmente deixa de ser alcançável pelo domínio. Não precisa desligar nada, nem pedir nada para ninguém.

**Ordem correta:**

1. Fechar o acesso do dev anterior no Registro.br (checklist da §13)
2. Anotar os registros de DNS atuais antes de mexer — só para ter o histórico
3. Apontar A e CNAME para a Vercel
4. Conferir que `palleira.com.br` e `www` chegam no portal novo

---

## 16. Anotações livres

<!-- ESPAÇO PARA VOCÊ ADICIONAR — cole aqui qualquer ideia, print, link ou requisito novo -->

-
-
-
