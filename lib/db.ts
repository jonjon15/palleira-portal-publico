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
  /**
   * O último poder de palbox visto desta pessoa, e quando.
   *
   * Nulo para quem nunca foi lido online desde 12/09/2026 — a palbox só
   * pode ser lida com o jogador no jogo, então este é o jeito de a tabela
   * mostrar número para quem está offline agora. Ver a migração 017.
   */
  /**
   * ⚠️ `bigint` no Postgres chega como STRING no driver, não como número —
   * `.toLocaleString()` numa string não formata nada e o placar mostrava
   * "134644" no lugar de "134.644". Quem lê converte com `Number()`.
   */
  poder_hp: string | number | null;
  poder_level: number | null;
  poder_ivs: number | null;
  /**
   * Quantos Pals shiny tinha na última leitura. Medido junto com o poder,
   * e por isso carimbado pelo mesmo `poder_em`. Ver a migração 019.
   */
  poder_shiny: number | null;
  poder_em: string | null;
  /**
   * A conta de Discord dona deste personagem, quando existe vínculo.
   *
   * É o elo entre o placar (que mostra personagem do jogo) e tudo que é
   * declarado no Discord — hoje, a raça registrada no fórum do Dominantes.
   * Nulo para quem nunca vinculou no site.
   */
  discord_id: string | null;
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
  serverSlug?: string | string[],
): Promise<PlayerRow[]> {
  // Um slug ou vários: a home soma só os servidores que estão no ar.
  const slugs = serverSlug === undefined ? null : [serverSlug].flat();
  return (await sql`
    select p.server_slug, p.palworld_uid, p.name, p.level, p.pal_count,
           p.poder_hp, p.poder_level, p.poder_ivs, p.poder_shiny, p.poder_em,
           a.discord_id
    from players p
    left join account_links a on a.palworld_uid = p.palworld_uid
    where p.name <> ''
      and p.name !~* 'adm'
      and (${slugs}::text[] is null or p.server_slug = any(${slugs}::text[]))
    order by p.level desc, p.pal_count desc
    limit ${limit}
  `) as PlayerRow[];
}

/**
 * Guarda o poder de palbox de quem acabou de ser lido no jogo.
 *
 * Chamado pelo ranking, que já lê a palbox de todo mundo que está online
 * para montar a tabela — aqui esse número apenas deixa de ser jogado fora
 * quando a pessoa desconecta.
 *
 * Escreve só em quem já existe na `players` (o import do save é quem cria a
 * linha), e nunca derruba o placar: falha de escrita é engolida por quem
 * chama. Uma consulta só para o lote inteiro, em vez de uma por jogador.
 */
export async function guardarPoder(
  serverSlug: string,
  medidas: { uid: string; hp: number; level: number; ivs: number; shiny: number }[],
): Promise<void> {
  if (medidas.length === 0) return;

  await sql`
    update players as p
       set poder_hp      = v.hp,
           poder_level   = v.level,
           poder_ivs     = v.ivs,
           poder_shiny   = v.shiny,
           -- Só sobe: vender ou abater um shiny derruba poder_shiny, mas
           -- não apaga que a pessoa já chegou àquele número.
           shiny_recorde = greatest(coalesce(p.shiny_recorde, 0), v.shiny),
           poder_em      = now()
      from (
        select
          unnest(${medidas.map((m) => m.uid)}::text[])   as uid,
          unnest(${medidas.map((m) => m.hp)}::bigint[])  as hp,
          unnest(${medidas.map((m) => m.level)}::int[])  as level,
          unnest(${medidas.map((m) => m.ivs)}::int[])    as ivs,
          unnest(${medidas.map((m) => m.shiny)}::int[])  as shiny
      ) as v
     where p.server_slug = ${serverSlug}
       and p.palworld_uid = v.uid
  `;

  // A série histórica (§7.9, migração 019): uma linha por jogador por dia.
  //
  // 🔴 `greatest` e não o último valor lido: o ranking relê a cada 2
  // minutos enquanto a pessoa joga, então gravar o último faria o dia
  // registrar a queda de quem vendeu um shiny à noite, em vez do pico que
  // ela realmente alcançou. Mesmo critério que o `level` já usa aqui.
  //
  // 📌 Só escreve para quem o import do save já criou na `players` — igual
  // ao update acima, e por isso nunca inventa linha de jogador fantasma.
  await sql`
    insert into player_daily (server_slug, palworld_uid, day, level, pal_count, shiny)
    select ${serverSlug}, v.uid, current_date, p.level, p.pal_count, v.shiny
      from (
        select
          unnest(${medidas.map((m) => m.uid)}::text[])  as uid,
          unnest(${medidas.map((m) => m.shiny)}::int[]) as shiny
      ) as v
      join players p
        on p.server_slug = ${serverSlug}
       and p.palworld_uid = v.uid
    on conflict (server_slug, palworld_uid, day) do update
      set shiny = greatest(coalesce(player_daily.shiny, 0), excluded.shiny)
  `;
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
 *
 * `slugs` limita aos servidores no ar: o save de um servidor desligado fica
 * parado no banco, e somá-lo mostraria números de um mundo que não existe
 * mais (o PVE VIP, desligado em 20/09/2026).
 */
export async function communityStats(slugs?: string[]): Promise<CommunityStats | null> {
  const s = slugs ?? null;
  const rows = (await sql`
    select
      (select count(*) from players
        where ${s}::text[] is null or server_slug = any(${s}::text[]))       as players,
      (select coalesce(sum(pal_count), 0) from players
        where ${s}::text[] is null or server_slug = any(${s}::text[]))       as pals,
      (select count(*) from guilds
        where (pal_count > 0 or base_count > 0)
          and (${s}::text[] is null or server_slug = any(${s}::text[])))     as guilds,
      (select coalesce(sum(base_count), 0) from guilds
        where ${s}::text[] is null or server_slug = any(${s}::text[]))       as bases
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
