import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { confirmarPagamentoBooster, meuBooster, TIPOS } from "@/lib/booster";
import { AtualizarSozinho } from "../../formularios";

export const metadata: Metadata = { title: "Booster" };
export const dynamic = "force-dynamic";

/**
 * Para onde a InfinitePay devolve quem doou um booster. Como a página de
 * volta do VIP: com os dados da URL já pede a confirmação, sem esperar o
 * webhook — e a confirmação pergunta à InfinitePay, não acredita na URL.
 */
export default async function BoosterObrigado({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id: bruto }, q] = await Promise.all([params, searchParams]);
  const id = Number(bruto);

  if (q.order_nsu === `boost-${id}` && q.transaction_nsu && q.slug) {
    await confirmarPagamentoBooster({
      orderNsu: q.order_nsu,
      transactionNsu: q.transaction_nsu,
      slug: q.slug,
      receiptUrl: q.receipt_url,
      captureMethod: q.capture_method,
    });
  }

  const b = Number.isInteger(id) ? await meuBooster(id) : null;
  const rotulo = b?.tipos.map((t) => TIPOS[t]?.rotulo ?? t).join(" + ");

  return (
    <>
      <PageHeader kicker="Booster" title="Obrigado pelo apoio" />
      <div className="mx-auto max-w-2xl px-4 py-12">
        {!b ? (
          <p className="text-sm text-muted">
            Não achei esse booster na sua conta. Se você doou, fale com a administração no Discord com o
            comprovante.
          </p>
        ) : b.status === "aguardando" ? (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <AtualizarSozinho />
            <h2 className="text-lg font-semibold">Esperando a confirmação…</h2>
            <p className="mt-2 text-sm text-muted">
              Assim que a InfinitePay confirmar o Pix, o booster entra na fila do {b.servidor}. Pode fechar
              esta página, a fila não depende dela.
            </p>
          </div>
        ) : b.status === "falhou" ? (
          <div className="rounded-[var(--radius-card)] border border-danger/30 bg-danger/[0.08] p-6 text-sm">
            O pagamento não foi aberto. Volte para a página VIP e tente de novo.
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] border border-success/30 bg-success/[0.08] p-6">
            <h2 className="text-lg font-semibold text-success">Booster confirmado! 🚀</h2>
            <p className="mt-2 text-sm text-muted">
              {b.status === "ativo" ? (
                <>
                  O booster <b className="text-text">{rotulo}</b> já está ligado no{" "}
                  <b className="text-text">{b.servidor}</b>.
                </>
              ) : b.status === "encerrado" ? (
                <>
                  O booster <b className="text-text">{rotulo}</b> já rodou no{" "}
                  <b className="text-text">{b.servidor}</b>.
                </>
              ) : (
                <>
                  O booster <b className="text-text">{rotulo}</b> está na fila do{" "}
                  <b className="text-text">{b.servidor}</b> e liga no próximo restart do servidor (de 4 em 4
                  horas).
                </>
              )}
            </p>
          </div>
        )}
        <Link href="/vip#booster" className="mt-6 inline-block text-sm font-semibold text-gold hover:text-gold-hi">
          ← Ver os servidores com booster
        </Link>
      </div>
    </>
  );
}
