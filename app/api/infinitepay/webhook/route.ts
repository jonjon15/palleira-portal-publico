import { NextResponse } from "next/server";
import { confirmarPagamento } from "@/lib/vip";

/**
 * Aviso de pagamento da InfinitePay (checkout das doações VIP).
 *
 * ⚠️ O webhook deles não tem assinatura: o corpo aqui é só uma pista de qual
 * doação olhar. Quem decide se está pago é `confirmarPagamento`, perguntando
 * à própria InfinitePay (`payment_check`). Um POST forjado, no máximo, faz o
 * site perguntar à toa.
 *
 * 200 = recebido; 400 = a InfinitePay tenta de novo — só quando não deu para
 * confirmar por um problema de momento (rede, InfinitePay fora).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: "corpo inválido" }, { status: 200 });
  }

  const texto = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
  const r = await confirmarPagamento({
    orderNsu: texto(corpo.order_nsu),
    transactionNsu: texto(corpo.transaction_nsu),
    slug: texto(corpo.invoice_slug ?? corpo.slug),
    receiptUrl: texto(corpo.receipt_url) || undefined,
    captureMethod: texto(corpo.capture_method) || undefined,
  });

  if (r.transitorio) {
    return NextResponse.json({ success: false, message: r.motivo }, { status: 400 });
  }
  return NextResponse.json({ success: true, message: null });
}
