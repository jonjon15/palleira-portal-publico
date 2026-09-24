import { sql } from "@/lib/db";

/**
 * O pedaço da InfinitePay que as doações compartilham — VIP (`lib/vip.ts`)
 * e booster (`lib/booster.ts`). Cada uma tem a sua tabela; aqui mora só a
 * conversa com a InfinitePay.
 *
 * O `order_nsu` diz de quem é o pagamento: `vip-<id>` ou `boost-<id>`. O
 * webhook e as páginas de volta despacham por esse prefixo.
 */

const CHECKOUT = "https://api.checkout.infinitepay.io";
// Fixo de propósito: o webhook e a volta do checkout precisam do endereço
// público, e o `NEXT_PUBLIC_SITE_URL` local é localhost.
export const SITE = "https://palleira.com.br";

export async function infiniteTag(): Promise<string> {
  const [c] = (await sql`select infinite_tag from vip_config where id = 1`) as { infinite_tag: string }[];
  return (c?.infinite_tag ?? "").trim().replace(/^\$/, "");
}

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Abre um link de checkout. Devolve a URL, ou o motivo de não ter aberto. */
export async function criarCheckout(args: {
  tag: string;
  orderNsu: string;
  precoCentavos: number;
  descricao: string;
  redirectPath: string;
}): Promise<{ url: string; erro: string }> {
  try {
    const res = await fetch(`${CHECKOUT}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: args.tag,
        order_nsu: args.orderNsu,
        items: [{ quantity: 1, price: args.precoCentavos, description: args.descricao }],
        redirect_url: `${SITE}${args.redirectPath}`,
        webhook_url: `${SITE}/api/infinitepay/webhook`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (res.ok && corpo.url) return { url: corpo.url, erro: "" };
    return { url: "", erro: corpo.message ?? `InfinitePay respondeu ${res.status}` };
  } catch (e) {
    return { url: "", erro: e instanceof Error ? e.message : String(e) };
  }
}

export interface DadosDoPagamento {
  orderNsu: string;
  transactionNsu: string;
  slug: string;
  receiptUrl?: string;
  captureMethod?: string;
}

export type Checagem =
  | { pago: true; valor: number; captureMethod: string | null }
  | { pago: false; transitorio: boolean; motivo: string };

/**
 * Pergunta à própria InfinitePay se está pago. **O webhook deles não é
 * assinado** — qualquer um poderia mandar um POST dizendo "pagou". Só esta
 * resposta conta.
 */
export async function checarPagamento(d: DadosDoPagamento): Promise<Checagem> {
  const tag = await infiniteTag();
  let r: { success?: boolean; paid?: boolean; paid_amount?: number; amount?: number; capture_method?: string };
  try {
    const res = await fetch(`${CHECKOUT}/payment_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: tag,
        order_nsu: d.orderNsu,
        transaction_nsu: d.transactionNsu,
        slug: d.slug,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { pago: false, transitorio: true, motivo: `payment_check ${res.status}` };
    r = await res.json();
  } catch (e) {
    return { pago: false, transitorio: true, motivo: e instanceof Error ? e.message : String(e) };
  }
  if (!r.success || !r.paid) return { pago: false, transitorio: false, motivo: "não consta como pago" };
  return {
    pago: true,
    valor: Number(r.paid_amount ?? r.amount ?? 0),
    captureMethod: r.capture_method ?? d.captureMethod ?? null,
  };
}
