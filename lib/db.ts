import { neon } from "@neondatabase/serverless";

/**
 * Conexão com o Neon (Postgres).
 *
 * `DATABASE_URL` é injetada pela integração Neon do próprio Vercel — não
 * precisa cadastrar nada à mão.
 */
export const sql = neon(process.env.DATABASE_URL ?? "");

export interface GuildRow {
  server_slug: string;
  guild_id: string;
  name: string;
  base_count: number;
  pal_count: number;
  member_count: number;
}

export interface PlayerRow {
  server_slug: string;
  palworld_uid: string;
  name: string;
  level: number;
  pal_count: number;
}

/**
 * Ranking de guilds por Pals trabalhando. Vem do import do save (§3.8).
 *
 * `serverSlug` filtra para um único servidor — usado pelo ranking dedicado
 * do Dominantes (§ 11/09/2026); sem ele, mistura os três como sempre.
 */
export async function topGuilds(
  limit = 25,
  serverSlug?: string,
): Promise<GuildRow[]> {
  return (await sql`
    select server_slug, guild_id, name, base_count, pal_count, member_count
    from guilds
    where (pal_count > 0 or base_count > 0)
      and (${serverSlug ?? null}::text is null or server_slug = ${serverSlug ?? null})
    order by pal_count desc, base_count desc
    limit ${limit}
  `) as GuildRow[];
}

/**
 * Ranking de jogadores — **inclusive quem está offline**.
 *
 * É o que a API do jogo não consegue entregar: ela só enxerga quem está
 * conectado. Estes números vêm do save.
 *
 * `serverSlug` filtra para um único servidor — mesmo motivo de `topGuilds`.
 */
export async function topPlayers(
  limit = 25,
  serverSlug?: string,
): Promise<PlayerRow[]> {
  return (await sql`
    select server_slug, palworld_uid, name, level, pal_count
    from players
    where name <> ''
      and name !~* 'adm'
      and (${serverSlug ?? null}::text is null or server_slug = ${serverSlug ?? null})
    order by level desc, pal_count desc
    limit ${limit}
  `) as PlayerRow[];
}

export interface CommunityStats {
  players: number;
  pals: number;
  guilds: number;
  bases: number;
}

/**
 * Números da comunidade para a home — prova de que o servidor é vivo, visível
 * antes de qualquer login.
 */
export async function communityStats(): Promise<CommunityStats | null> {
  const rows = (await sql`
    select
      (select count(*)                from players)          as players,
      (select coalesce(sum(pal_count), 0)  from players)     as pals,
      (select count(*)                from guilds
        where pal_count > 0 or base_count > 0)               as guilds,
      (select coalesce(sum(base_count), 0) from guilds)      as bases
  `) as { players: string; pals: string; guilds: string; bases: string }[];

  const row = rows[0];
  if (!row) return null;
  return {
    players: Number(row.players),
    pals: Number(row.pals),
    guilds: Number(row.guilds),
    bases: Number(row.bases),
  };
}

export interface ImportInfo {
  created_at: string;
  ok: boolean;
  players: number;
  guilds: number;
}

/** Quando o save foi lido pela última vez — para o site poder ser honesto. */
export async function lastImport(): Promise<ImportInfo | null> {
  const rows = (await sql`
    select created_at, ok,
           coalesce((stats->>'players')::int, 0) as players,
           coalesce((stats->>'guilds')::int, 0)  as guilds
    from imports
    where ok
    order by created_at desc
    limit 1
  `) as ImportInfo[];
  return rows[0] ?? null;
}
