import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * Recebe o "estou vivo" dos robôs que rodam fora do site.
 *
 * Quem bate ponto aqui não tem — e não deve ter — a `DATABASE_URL`: o
 * `vigia_relog.py` roda dentro do container do jogo, e mandar a chave de
 * escrita do banco para lá daria a quem tiver acesso ao servidor o controle
 * do site inteiro. Por isso o robô fala HTTP e quem escreve é a aplicação,
 * com as credenciais que ela já tem — o mesmo desenho de
 * `eventos-do-discord/route.ts`.
 *
 * O `CRON_SECRET` é a única credencial que precisa viajar, e o estrago de
 * vazar é registrar um ponto falso.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET ?? "";
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  let corpo: { nome?: string; server_slug?: string; detalhe?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "json inválido" }, { status: 400 });
  }

  // O `nome` é a chave primária da tabela: sem ele o ponto não tem dono.
  const nome = String(corpo.nome ?? "").trim().slice(0, 100);
  if (!nome) {
    return NextResponse.json({ erro: "falta o nome" }, { status: 400 });
  }

  const slug = corpo.server_slug ? String(corpo.server_slug).slice(0, 40) : null;
  const detalhe = JSON.stringify(corpo.detalhe ?? {});

  await sql`
    insert into heartbeats (nome, server_slug, visto_em, detalhe)
    values (${nome}, ${slug}, now(), ${detalhe}::jsonb)
    on conflict (nome) do update set
      server_slug = excluded.server_slug,
      visto_em    = now(),
      detalhe     = excluded.detalhe
  `;

  return NextResponse.json({ ok: true });
}
