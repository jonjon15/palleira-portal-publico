/**
 * Acesso ao Discord pelo bot da Palleira (§4.6 do PROMPT.md).
 *
 * Serve para o que o login do jogador não alcança: saber quem é membro,
 * traduzir apelido em ID e, mais para frente, mandar recado no canal.
 *
 * ⚠️ Só server-side. O token do bot é chave de casa — nunca chega ao
 * navegador.
 */

const API = "https://discord.com/api/v10";

const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";

export interface MembroDiscord {
  id: string;
  /** O @ atual, único no Discord inteiro */
  username: string;
  /** Como aparece no servidor (apelido), se tiver um */
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
  bot: boolean;
}

interface RawMember {
  user?: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
    bot?: boolean;
  };
  nick?: string | null;
  roles?: string[];
}

function traduz(m: RawMember): MembroDiscord | null {
  const u = m.user;
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: m.nick || u.global_name || u.username,
    avatarUrl: u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
      : null,
    roles: m.roles ?? [],
    bot: Boolean(u.bot),
  };
}

/**
 * Uma chamada à API do Discord, respeitando o rate limit.
 *
 * 🔴 **O Discord limita a 5 requisições por segundo por rota**, e devolve 429
 * com um `retry-after` em segundos. Sem esperar e tentar de novo, um pico de
 * navegação simultânea vira erro — e quem chama costuma tratar erro como
 * "não é membro", rebaixando gente que é staff (ver `fetchMembership` em
 * `auth.ts`, e a memória gotcha-discord-429-em-promise-all).
 *
 * Uma tentativa extra basta: o `retry-after` do Discord é quase sempre menos
 * de 1 segundo, e insistir mais seguraria a renderização da página.
 */
async function chamar(caminho: string): Promise<Response> {
  if (!BOT_TOKEN || !GUILD_ID) {
    throw new Error("DISCORD_BOT_TOKEN ou DISCORD_GUILD_ID não configurado");
  }

  const pedir = () =>
    fetch(`${API}${caminho}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

  const res = await pedir();
  if (res.status !== 429) return res;

  // Teto de 2s: acima disso é melhor devolver o 429 e deixar quem chamou
  // decidir, do que travar a página esperando.
  const espera = Math.min(Number(res.headers.get("retry-after") ?? 1) || 1, 2);
  await new Promise((r) => setTimeout(r, espera * 1000));
  return pedir();
}

export class SemIntentError extends Error {
  constructor() {
    super(
      "O bot não tem o Server Members Intent ligado no Developer Portal do Discord.",
    );
  }
}

/** Um membro específico. Devolve null se a pessoa não está no servidor. */
export async function buscarMembro(
  discordId: string,
): Promise<MembroDiscord | null> {
  const res = await chamar(`/guilds/${GUILD_ID}/members/${discordId}`);
  if (res.status === 404) return null;
  if (res.status === 403) throw new SemIntentError();
  if (!res.ok) throw new Error(`Discord respondeu ${res.status}`);
  return traduz((await res.json()) as RawMember);
}

/**
 * Todo mundo do servidor, paginado de mil em mil.
 *
 * Exige o **Server Members Intent** ligado no Developer Portal — sem ele o
 * Discord devolve 403, mesmo com o bot dentro do servidor.
 */
export async function listarMembros(): Promise<MembroDiscord[]> {
  const todos: MembroDiscord[] = [];
  let depois = "0";

  for (let pagina = 0; pagina < 20; pagina++) {
    const res = await chamar(
      `/guilds/${GUILD_ID}/members?limit=1000&after=${depois}`,
    );
    if (res.status === 403) throw new SemIntentError();
    if (!res.ok) throw new Error(`Discord respondeu ${res.status}`);

    const lote = (await res.json()) as RawMember[];
    if (!lote.length) break;

    for (const bruto of lote) {
      const m = traduz(bruto);
      if (m && !m.bot) todos.push(m);
    }
    depois = lote[lote.length - 1].user?.id ?? depois;
    if (lote.length < 1000) break;
  }

  return todos;
}

/**
 * O nome de exibição de várias pessoas, resolvido **em fila**.
 *
 * 🔴 Não trocar por `Promise.all` de `buscarMembro`. O Discord aceita umas
 * cinco chamadas por rajada e responde 429 no resto: medido em 12/09/2026,
 * 16 pedidos em paralelo viraram 11 recusas, e a tela de economia mostrou o
 * ID cru no lugar de 11 nomes sem sinal nenhum de erro.
 *
 * Com o **Server Members Intent** ligado, uma chamada paginada resolve a
 * comunidade inteira e o custo deixa de crescer com o tamanho da lista:
 * medido em 12/09/2026, 435 membros em 713ms contra 4,6s para resolver
 * apenas 16 em fila. É o caminho preferido.
 *
 * A fila fica como reserva para quando o intent estiver desligado — foi o
 * estado deste bot até 12/09/2026, e voltar a ser é questão de alguém
 * desmarcar a opção no Developer Portal. Sem esse degrau, a tela cairia
 * direto no ID cru de novo.
 *
 * Quem não for encontrado simplesmente não entra no mapa; cabe a quem
 * chamou decidir o que mostrar no lugar.
 */
export async function nomesDe(
  discordIds: string[],
): Promise<Map<string, string>> {
  const querida = new Set(discordIds);
  if (querida.size === 0) return new Map();

  try {
    const nomes = new Map<string, string>();
    for (const m of await listarMembros()) {
      if (querida.has(m.id)) nomes.set(m.id, m.displayName);
    }
    return nomes;
  } catch {
    // Sem o intent (403) ou Discord fora: cai na fila, abaixo.
  }

  const nomes = new Map<string, string>();

  for (const id of querida) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      let res: Response;
      try {
        res = await chamar(`/guilds/${GUILD_ID}/members/${id}`);
      } catch {
        break; // rede fora: desiste desta pessoa, segue para a próxima
      }

      if (res.status === 429) {
        // O corpo traz `retry_after` em segundos, com fração. A folga de
        // 100ms é para não bater no limite de novo por arredondamento.
        const corpo = (await res.json().catch(() => ({}))) as {
          retry_after?: number;
        };
        const espera = Math.ceil((corpo.retry_after ?? 1) * 1000) + 100;
        await new Promise((r) => setTimeout(r, espera));
        continue;
      }

      if (res.ok) {
        const m = traduz((await res.json()) as RawMember);
        if (m) nomes.set(id, m.displayName);
      }
      break; // 200, 404 ou 403: não adianta repetir
    }
  }

  return nomes;
}

/** Ainda dá para trabalhar sem a lista completa? Serve para avisar na tela. */
export async function temListaDeMembros(): Promise<boolean> {
  try {
    const res = await chamar(`/guilds/${GUILD_ID}/members?limit=1`);
    return res.ok;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------- canais */

export interface CanalDiscord {
  id: string;
  nome: string;
}

/** Canais de texto do servidor, na ordem em que aparecem no Discord. */
export async function listarCanais(): Promise<CanalDiscord[]> {
  const res = await chamar(`/guilds/${GUILD_ID}/channels`);
  if (!res.ok) throw new Error(`Discord respondeu ${res.status}`);

  const brutos = (await res.json()) as {
    id: string;
    name: string;
    type: number;
    position?: number;
  }[];

  // 0 = texto comum, 5 = anúncio. O canal de anúncio guarda mensagem igual
  // ao de texto e é lido pela mesma rota — deixá-lo de fora escondia metade
  // da Palleira da lista, inclusive os canais de evento e torneio.
  return brutos
    .filter((c) => c.type === 0 || c.type === 5)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({ id: c.id, nome: c.name }));
}

export interface MensagemDiscord {
  id: string;
  autorId: string;
  autorNome: string;
  autorEhBot: boolean;
  /** Vazio quando o bot não tem o Message Content Intent ligado */
  texto: string;
  /** Título + descrição + campos dos embeds, tudo junto e já achatado */
  textoDosEmbeds: string;
  /** Quem digitou o comando, quando a mensagem é resposta de slash command */
  comandoDe: { id: string; username: string; displayName: string } | null;
  comandoNome: string | null;
  /** A mensagem marcou @everyone ou @here */
  chamouTodos: boolean;
  /**
   * A primeira imagem da mensagem, se tiver.
   *
   * ⚠️ A URL do CDN do Discord **expira em ~24h** — tem `ex`, `is` e `hm` na
   * query, e sem assinatura válida responde 404. Guardar o link cru em
   * algum lugar que dure mais que um dia não funciona; ver `renovarImagens`.
   */
  imagemUrl: string | null;
  em: string;
}

interface RawEmbed {
  title?: string;
  description?: string;
  fields?: { name?: string; value?: string }[];
  footer?: { text?: string };
  image?: { url?: string };
  thumbnail?: { url?: string };
}

interface RawMessage {
  id: string;
  content?: string;
  embeds?: RawEmbed[];
  timestamp: string;
  author?: { id: string; username: string; global_name?: string | null; bot?: boolean };
  mention_everyone?: boolean;
  attachments?: { url: string; content_type?: string; filename?: string }[];
  interaction_metadata?: {
    name?: string;
    user?: { id: string; username: string; global_name?: string | null };
  };
  interaction?: {
    name?: string;
    user?: { id: string; username: string; global_name?: string | null };
  };
}

/** A primeira imagem da mensagem: anexo primeiro, depois imagem de embed. */
function primeiraImagem(m: RawMessage): string | null {
  const anexo = (m.attachments ?? []).find((a) =>
    (a.content_type ?? "").startsWith("image/"),
  );
  if (anexo) return anexo.url;

  for (const e of m.embeds ?? []) {
    const url = e.image?.url ?? e.thumbnail?.url;
    if (url) return url;
  }
  return null;
}

function achatarEmbeds(embeds: RawEmbed[] = []): string {
  const pedacos: string[] = [];
  for (const e of embeds) {
    if (e.title) pedacos.push(e.title);
    if (e.description) pedacos.push(e.description);
    for (const f of e.fields ?? []) {
      if (f.name) pedacos.push(f.name);
      if (f.value) pedacos.push(f.value);
    }
    if (e.footer?.text) pedacos.push(e.footer.text);
  }
  return pedacos.join("\n");
}

/**
 * Uma URL de anexo do Discord ainda é válida?
 *
 * O CDN assina o link com `ex` (expiração, epoch em hexadecimal), `is` e
 * `hm`. Passou de `ex`, ou mexeu na assinatura, o CDN responde 404 —
 * conferido em 12/09/2026 trocando o `hm` de uma URL boa.
 *
 * A folga de uma hora é para o link não vencer entre a checagem e a hora em
 * que alguém abre a página.
 */
export function urlDeAnexoValida(url: string, folgaMs = 60 * 60_000): boolean {
  try {
    const ex = new URL(url).searchParams.get("ex");
    if (!ex) return true; // sem assinatura: não é link de CDN do Discord
    return Number.parseInt(ex, 16) * 1000 - folgaMs > Date.now();
  } catch {
    return false;
  }
}

/**
 * Pede ao Discord links novos para anexos cujo link expirou.
 *
 * Devolve um mapa `url antiga → url nova`. O que o Discord não conseguir
 * renovar simplesmente não entra no mapa — anexo de mensagem apagada, por
 * exemplo.
 *
 * Aceita no máximo 50 por chamada, que é o limite da rota.
 */
export async function renovarImagens(
  urls: string[],
): Promise<Map<string, string>> {
  const novas = new Map<string, string>();
  const lista = [...new Set(urls)].filter(Boolean);

  for (let i = 0; i < lista.length; i += 50) {
    const lote = lista.slice(i, i + 50);
    try {
      const res = await fetch(`${API}/attachments/refresh-urls`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attachment_urls: lote }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;

      const corpo = (await res.json()) as {
        refreshed_urls?: { original: string; refreshed: string }[];
      };
      for (const r of corpo.refreshed_urls ?? []) {
        if (r.original && r.refreshed) novas.set(r.original, r.refreshed);
      }
    } catch {
      // Discord fora: quem chamou continua com a URL velha, que é o que há.
    }
  }

  return novas;
}

export class SemAcessoAoCanalError extends Error {
  constructor(public readonly canalId: string) {
    super("O bot não tem permissão de ver esse canal.");
  }
}

/**
 * Últimas mensagens de um canal, da mais nova para a mais velha.
 *
 * ⚠️ Duas coisas precisam estar ligadas para o texto vir preenchido:
 *
 * 1. **Message Content Intent**, no Developer Portal — sem ele o Discord
 *    devolve `content` e `embeds` vazios, mesmo com permissão no canal.
 * 2. **Ver canal + Ler histórico**, nas permissões do cargo do bot.
 */
export async function lerCanal(
  canalId: string,
  quantas = 200,
): Promise<MensagemDiscord[]> {
  const tudo: MensagemDiscord[] = [];
  let antesDe: string | null = null;

  while (tudo.length < quantas) {
    const lote = Math.min(100, quantas - tudo.length);
    const res = await chamar(
      `/channels/${canalId}/messages?limit=${lote}` +
        (antesDe ? `&before=${antesDe}` : ""),
    );
    if (res.status === 403) throw new SemAcessoAoCanalError(canalId);
    if (!res.ok) throw new Error(`Discord respondeu ${res.status}`);

    const brutas = (await res.json()) as RawMessage[];
    if (!brutas.length) break;

    for (const m of brutas) {
      const inter = m.interaction_metadata ?? m.interaction;
      const quem = inter?.user;
      tudo.push({
        id: m.id,
        autorId: m.author?.id ?? "",
        autorNome: m.author?.username ?? "",
        autorEhBot: Boolean(m.author?.bot),
        texto: m.content ?? "",
        textoDosEmbeds: achatarEmbeds(m.embeds),
        comandoDe: quem
          ? {
              id: quem.id,
              username: quem.username,
              displayName: quem.global_name || quem.username,
            }
          : null,
        comandoNome: inter?.name ?? null,
        chamouTodos: Boolean(m.mention_everyone),
        imagemUrl: primeiraImagem(m),
        em: m.timestamp,
      });
    }

    antesDe = brutas[brutas.length - 1].id;
    if (brutas.length < lote) break;
  }

  return tudo;
}

/**
 * O Message Content Intent está ligado?
 *
 * Não existe endpoint que responda isso. O jeito é olhar as mensagens: se
 * todas vierem com texto e embed vazios, o intent está desligado — mensagem
 * de verdade completamente vazia é raríssima, e nunca em série.
 */
export function pareceSemConteudo(mensagens: MensagemDiscord[]): boolean {
  if (mensagens.length === 0) return false;
  return mensagens.every((m) => !m.texto && !m.textoDosEmbeds);
}

/* --------------------------------------------------------------- webhooks */

/**
 * Dispara um webhook do Discord. Best-effort de propósito: espelho é bônus,
 * nunca pode derrubar a ação real (kick, ban, anúncio) por causa dele.
 */
async function avisar(url: string | undefined, content: string): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // silencioso — ver comentário acima
  }
}

/** Espelha um anúncio feito no jogo para o canal público de status (§5.3). */
export const espelharAnuncio = (servidor: string, mensagem: string) =>
  avisar(
    process.env.DISCORD_WEBHOOK_STATUS,
    `📢 **${servidor}** — ${mensagem}`,
  );

/** Log de ação administrativa (kick/ban/shutdown/…) no canal privado da staff. */
export const logarNoDiscord = (linha: string) =>
  avisar(process.env.DISCORD_WEBHOOK_ADMIN_LOG, linha);
