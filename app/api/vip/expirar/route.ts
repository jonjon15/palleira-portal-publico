import { NextResponse } from "next/server";
import { expirarVips } from "@/lib/vip";
import { logarNoDiscord } from "@/lib/discord";

/**
 * Tira o cargo de quem teve o VIP por doação vencido. Chamado uma vez por
 * dia pelo GitHub Actions (`.github/workflows/vip-expirar.yml`) — cron no
 * `vercel.json` bloqueia o deploy (ver o comentário de eventos-do-discord).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET ?? "";
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const r = await expirarVips();
  if (r.removidos || r.falhas.length) {
    await logarNoDiscord(
      `⏳ VIP por doação vencido — ${r.removidos} cargo(s) retirado(s)` +
        (r.falhas.length ? `\n> ⚠️ ${r.falhas.join(" | ")}` : ""),
    );
  }
  return NextResponse.json(r);
}
