import { NextResponse } from "next/server";
import { aplicarNoBoot } from "@/lib/booster";
import { serverBySlug } from "@/lib/servers";

/**
 * Chamado pelo `vigia/booster_boot.py`, de dentro do container, no instante
 * em que o servidor liga — antes de o Palworld ler o `.ini`. Ver
 * `lib/booster.ts`.
 *
 * Corpo: `{ servidor: "pvp-free", base: { ExpRate: 0.2, ... } }`.
 * Resposta: `{ valores: { ExpRate: 0.4 } }` — o que gravar por cima.
 * Vazio = sem booster neste ciclo, fica a taxa normal.
 *
 * Mesmo segredo do vigia e dos crons (`CRON_SECRET`).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET ?? "";
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  let corpo: { servidor?: unknown; base?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const slug = typeof corpo.servidor === "string" ? corpo.servidor : "";
  if (!serverBySlug(slug)) return NextResponse.json({ erro: "servidor desconhecido" }, { status: 400 });

  const base: Record<string, number> = {};
  if (corpo.base && typeof corpo.base === "object") {
    for (const [k, v] of Object.entries(corpo.base as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1000) base[k] = v;
    }
  }

  const r = await aplicarNoBoot(slug, base);
  return NextResponse.json(r);
}
