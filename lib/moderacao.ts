/**
 * Auditoria do painel de moderação (§5.3 do PROMPT.md).
 *
 * Toda ação que mexe no servidor de verdade — kick, ban, unban, salvar,
 * desligar, anunciar — passa por `registrar` antes de contar como feita.
 * Sem isso, um ban indevido não tem como ser rastreado até quem apertou.
 */

import { sql } from "@/lib/db";

export type AcaoModeracao =
  | "broadcast"
  | "kick"
  | "ban"
  | "unban"
  | "save"
  | "shutdown";

export const ACAO_LABEL: Record<AcaoModeracao, string> = {
  broadcast: "Anúncio",
  kick: "Kick",
  ban: "Ban",
  unban: "Unban",
  save: "Salvar mundo",
  shutdown: "Desligamento",
};

export interface AcaoRow {
  id: number;
  actor_id: string;
  server_slug: string;
  action: AcaoModeracao;
  target: string | null;
  detail: string;
  ok: boolean;
  error: string | null;
  created_at: string;
}

/** Grava uma linha no log de auditoria. Nunca lança — auditoria não pode derrubar a ação. */
export async function registrar(args: {
  actorId: string;
  serverSlug: string;
  action: AcaoModeracao;
  target?: string | null;
  detail?: string;
  ok: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    await sql`
      insert into admin_actions (actor_id, server_slug, action, target, detail, ok, error)
      values (
        ${args.actorId},
        ${args.serverSlug},
        ${args.action},
        ${args.target ?? null},
        ${args.detail ?? ""},
        ${args.ok},
        ${args.error ?? null}
      )
    `;
  } catch {
    // Banco fora do ar não pode impedir moderação de acontecer; só perde o
    // registro dessa vez.
  }
}

/** Últimas ações, mais recente primeiro. */
export async function recentes(limit = 30): Promise<AcaoRow[]> {
  return (await sql`
    select id, actor_id, server_slug, action, target, detail, ok, error, created_at
    from admin_actions
    order by created_at desc
    limit ${limit}
  `) as AcaoRow[];
}
