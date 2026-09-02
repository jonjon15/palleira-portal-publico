import { sql } from "@/lib/db";

/**
 * O mural de eventos — a aba "Eventos" pedida como um fórum/WordPress
 * simples: quem tem o cargo Criador de Evento (ou é staff) escreve, o site
 * publica.
 *
 * `pinned` é o que decide o destaque na home: o evento fixado aparece lá
 * (e no topo do mural) até alguém desfixar ou arquivar. Sem nenhum fixado,
 * entra o publicado mais recente — a home nunca fica muda enquanto houver
 * pelo menos um evento no ar.
 */

export type StatusEvento = "rascunho" | "publicado" | "arquivado";

export interface Evento {
  id: number;
  title: string;
  slug: string;
  body: string;
  coverEmoji: string | null;
  serverSlug: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: StatusEvento;
  pinned: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

interface LinhaEvento {
  id: number;
  title: string;
  slug: string;
  body: string;
  cover_emoji: string | null;
  server_slug: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: StatusEvento;
  pinned: boolean;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

const paraEvento = (r: LinhaEvento): Evento => ({
  id: r.id,
  title: r.title,
  slug: r.slug,
  body: r.body,
  coverEmoji: r.cover_emoji,
  serverSlug: r.server_slug,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  status: r.status,
  pinned: r.pinned,
  createdBy: r.created_by,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
});

/* ----------------------------------------------------------------- leitura */

/** O evento em destaque — fixado, senão o publicado mais recente. Home e topo do mural. */
export async function eventoAtual(): Promise<Evento | null> {
  const rows = (await sql`
    select id, title, slug, body, cover_emoji, server_slug, starts_at, ends_at,
           status, pinned, created_by, created_by_name, created_at
    from events
    where status = 'publicado'
    order by pinned desc, coalesce(starts_at, created_at) desc
    limit 1
  `) as LinhaEvento[];
  return rows[0] ? paraEvento(rows[0]) : null;
}

/** O mural inteiro — fixado primeiro, depois do mais novo pro mais velho. */
export async function listarEventosPublicados(limite = 30): Promise<Evento[]> {
  const rows = (await sql`
    select id, title, slug, body, cover_emoji, server_slug, starts_at, ends_at,
           status, pinned, created_by, created_by_name, created_at
    from events
    where status = 'publicado'
    order by pinned desc, coalesce(starts_at, created_at) desc
    limit ${limite}
  `) as LinhaEvento[];
  return rows.map(paraEvento);
}

/** Barra lateral "próximos eventos" — só quem tem data futura marcada. */
export async function proximosEventos(limite = 5): Promise<Evento[]> {
  const rows = (await sql`
    select id, title, slug, body, cover_emoji, server_slug, starts_at, ends_at,
           status, pinned, created_by, created_by_name, created_at
    from events
    where status = 'publicado' and starts_at is not null and starts_at > now()
    order by starts_at asc
    limit ${limite}
  `) as LinhaEvento[];
  return rows.map(paraEvento);
}

export async function buscarEventoPorSlug(slug: string): Promise<Evento | null> {
  const rows = (await sql`
    select id, title, slug, body, cover_emoji, server_slug, starts_at, ends_at,
           status, pinned, created_by, created_by_name, created_at
    from events
    where slug = ${slug} and status = 'publicado'
  `) as LinhaEvento[];
  return rows[0] ? paraEvento(rows[0]) : null;
}

/** Para o /admin/eventos: todo mundo, inclusive rascunho, do mais novo pro mais velho. */
export async function listarTodosOsEventos(limite = 60): Promise<Evento[]> {
  const rows = (await sql`
    select id, title, slug, body, cover_emoji, server_slug, starts_at, ends_at,
           status, pinned, created_by, created_by_name, created_at
    from events
    order by created_at desc
    limit ${limite}
  `) as LinhaEvento[];
  return rows.map(paraEvento);
}

export type MomentoEvento = "em-breve" | "rolando" | "encerrado" | "aviso";

/**
 * Onde o evento está no tempo, pra render decidir o selo (Em breve / Rolando
 * agora / Encerrado). "Aviso" é o evento sem data marcada — nem todo evento
 * é uma partida com hora certa; manutenção e comunicado geral também moram
 * no mural.
 */
export function momentoDoEvento(e: Pick<Evento, "startsAt" | "endsAt">): MomentoEvento {
  const agora = Date.now();
  if (e.startsAt && new Date(e.startsAt).getTime() > agora) return "em-breve";
  if (e.endsAt && new Date(e.endsAt).getTime() < agora) return "encerrado";
  if (!e.startsAt && !e.endsAt) return "aviso";
  return "rolando";
}

/* --------------------------------------------------------------- escrita */

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

function slugify(titulo: string): string {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "evento";
}

async function slugUnico(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  // A lista de eventos é curta; um laço simples resolve sem precisar de
  // sequência nem de lock — colisão só acontece com título repetido.
  while (
    (await sql`select 1 from events where slug = ${slug} limit 1`).length
  ) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export interface NovoEvento {
  title: string;
  body: string;
  coverEmoji: string;
  serverSlug: string;
  startsAt: string;
  endsAt: string;
  pinned: boolean;
  publicar: boolean;
}

/** Cria o evento — como rascunho ou já publicado, conforme o formulário. */
export async function criarEvento(
  input: NovoEvento,
  autorId: string,
  autorNome: string,
): Promise<Resultado> {
  const title = input.title.trim();
  if (!title) return { ok: false, mensagem: "Dê um título ao evento." };

  const slug = await slugUnico(slugify(title));
  const status: StatusEvento = input.publicar ? "publicado" : "rascunho";

  // Fixar tira o fixado anterior — só existe um destaque de cada vez.
  if (input.pinned) {
    await sql`update events set pinned = false where pinned = true`;
  }

  await sql`
    insert into events (
      title, slug, body, cover_emoji, server_slug, starts_at, ends_at,
      status, pinned, created_by, created_by_name
    ) values (
      ${title}, ${slug}, ${input.body.trim()}, ${input.coverEmoji.trim() || null},
      ${input.serverSlug || null}, ${input.startsAt || null}, ${input.endsAt || null},
      ${status}, ${input.pinned}, ${autorId}, ${autorNome}
    )
  `;

  return {
    ok: true,
    mensagem:
      status === "publicado"
        ? `"${title}" publicado no mural.`
        : `"${title}" salvo como rascunho.`,
  };
}

/** Publica, arquiva ou republica — a mesma ação para as três transições. */
export async function mudarStatusEvento(
  id: number,
  status: StatusEvento,
): Promise<Resultado> {
  const rows = (await sql`
    update events set status = ${status}, updated_at = now()
    where id = ${id}
    returning title
  `) as { title: string }[];
  if (!rows.length) return { ok: false, mensagem: "Evento não encontrado." };

  const LABEL: Record<StatusEvento, string> = {
    rascunho: "voltou a rascunho",
    publicado: "publicado",
    arquivado: "arquivado",
  };
  return { ok: true, mensagem: `"${rows[0].title}" ${LABEL[status]}.` };
}

/** Fixa este evento e desfixa qualquer outro — só existe um destaque por vez. */
export async function fixarEvento(id: number): Promise<Resultado> {
  await sql`update events set pinned = false where pinned = true`;
  const rows = (await sql`
    update events set pinned = true, updated_at = now()
    where id = ${id}
    returning title
  `) as { title: string }[];
  if (!rows.length) return { ok: false, mensagem: "Evento não encontrado." };
  return { ok: true, mensagem: `"${rows[0].title}" fixado no topo.` };
}

export async function desfixarEvento(id: number): Promise<Resultado> {
  await sql`update events set pinned = false, updated_at = now() where id = ${id}`;
  return { ok: true, mensagem: "Desfixado." };
}

/** Só apaga rascunho — publicado e arquivado ficam no histórico (arquivar em vez de excluir). */
export async function excluirRascunho(id: number): Promise<Resultado> {
  const rows = (await sql`
    delete from events where id = ${id} and status = 'rascunho'
    returning title
  `) as { title: string }[];
  if (!rows.length) {
    return {
      ok: false,
      mensagem: "Só dá para excluir rascunho — publicado, arquive em vez de apagar.",
    };
  }
  return { ok: true, mensagem: `Rascunho "${rows[0].title}" excluído.` };
}
