import { sql } from "@/lib/db";
import { serverBySlug } from "@/lib/servers";

/**
 * Leitura de `pal_transfers` para o painel `/admin/resgates` — acompanhar ao
 * vivo o resgate de Pal do cofre, sem abrir o log do script local
 * (`tools/entregar_pals_local.py`) que substitui o GitHub Actions enquanto o
 * billing da conta estiver bloqueado (17/09/2026).
 *
 * Só leitura: nenhuma função aqui muda `pal_transfers`. Destravar ou repetir
 * uma transferência continua em `lib/pal-cofre.ts` / `lib/admin-entregar-pal.ts`.
 */

export interface ResgateDePal {
  id: number;
  discordId: string;
  serverSlug: string;
  serverNome: string;
  palId: string;
  status: string;
  detail: string;
  arquivo: string | null;
  criadoEm: string;
  finalizadoEm: string | null;
}

interface Linha {
  id: number;
  discord_id: string;
  server_slug: string;
  pal_id: string;
  status: string;
  detail: string;
  arquivo: string | null;
  created_at: string;
  finished_at: string | null;
}

const paraResgate = (r: Linha): ResgateDePal => ({
  id: r.id,
  discordId: r.discord_id,
  serverSlug: r.server_slug,
  serverNome: serverBySlug(r.server_slug)?.shortName ?? r.server_slug,
  palId: r.pal_id,
  status: r.status,
  detail: r.detail,
  arquivo: r.arquivo,
  criadoEm: r.created_at,
  finalizadoEm: r.finished_at,
});

/** Os resgates mais recentes, independente do status — para o painel geral. */
export async function resgatesRecentes(limite = 50): Promise<ResgateDePal[]> {
  const rows = (await sql`
    select id, discord_id, server_slug, template->>'PalID' as pal_id,
           status, detail, arquivo, created_at, finished_at
    from pal_transfers
    where direction = 'resgatar'
    order by created_at desc
    limit ${limite}
  `) as Linha[];
  return rows.map(paraResgate);
}

/** Só os que ainda estão em andamento — o que o painel destaca no topo. */
export async function resgatesEmAndamento(): Promise<ResgateDePal[]> {
  const rows = (await sql`
    select id, discord_id, server_slug, template->>'PalID' as pal_id,
           status, detail, arquivo, created_at, finished_at
    from pal_transfers
    where direction = 'resgatar' and status in ('aguardando_arquivo', 'arquivo_pronto')
    order by created_at asc
  `) as Linha[];
  return rows.map(paraResgate);
}
