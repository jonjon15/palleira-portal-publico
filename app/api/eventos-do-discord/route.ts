import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sincronizarEventosDoDiscord } from "@/lib/eventos-do-discord";

/**
 * Puxa o canal de eventos do Discord para o mural do site.
 *
 * Endpoint em vez de script no Actions porque quem escreve no banco aqui já
 * é o site: o runner precisaria da `DATABASE_URL` e do token do bot só para
 * fazer o que a aplicação faz com as credenciais que já tem.
 *
 * Chamado pelo cron da Vercel (ver `vercel.json`) e também por quem abre a
 * página de eventos no admin — assim o dono nunca espera a próxima janela
 * para ver o que acabou de postar.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function executar(req: Request) {
  // O cron da Vercel se identifica com o `CRON_SECRET`; a chamada de dentro
  // do admin passa pela sessão e não chega aqui.
  const segredo = process.env.CRON_SECRET ?? "";
  const autorizacao = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);

  if (
    segredo &&
    autorizacao !== `Bearer ${segredo}` &&
    url.searchParams.get("k") !== segredo
  ) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const r = await sincronizarEventosDoDiscord();

  if (r.criados > 0) {
    revalidatePath("/");
    revalidatePath("/eventos");
    revalidatePath("/admin/eventos");
  }

  return NextResponse.json(r, { status: r.erro ? 502 : 200 });
}

export const GET = executar;
export const POST = executar;
