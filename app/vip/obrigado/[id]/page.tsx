import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { confirmarPagamento, minhaDoacao } from "@/lib/vip";
import { AcompanharDoacao } from "../../formularios";

export const metadata: Metadata = { title: "Obrigado" };
export const dynamic = "force-dynamic";

/**
 * Para onde a InfinitePay devolve quem pagou. Ela acrescenta `order_nsu`,
 * `transaction_nsu`, `slug` e `receipt_url` na URL — com eles, a página já
 * pede a confirmação (`confirmarPagamento`, que pergunta à InfinitePay e não
 * acredita na URL), sem esperar o webhook chegar.
 */
export default async function Obrigado({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/entrar");

  const [{ id: bruto }, q] = await Promise.all([params, searchParams]);
  const id = Number(bruto);

  if (q.order_nsu === `vip-${id}` && q.transaction_nsu && q.slug) {
    await confirmarPagamento({
      orderNsu: q.order_nsu,
      transactionNsu: q.transaction_nsu,
      slug: q.slug,
      receiptUrl: q.receipt_url,
      captureMethod: q.capture_method,
    });
  }

  const doacao = Number.isInteger(id) ? await minhaDoacao(id) : null;

  return (
    <>
      <PageHeader kicker="Doação" title="Obrigado pelo apoio" />
      <div className="mx-auto max-w-2xl px-4 py-12">
        {doacao ? (
          <AcompanharDoacao id={id} inicial={doacao} />
        ) : (
          <p className="text-sm text-muted">
            Não achei essa doação na sua conta. Se você doou, fale com a
            administração no Discord com o comprovante.
          </p>
        )}
        <Link href="/vip" className="mt-6 inline-block text-sm font-semibold text-gold hover:text-gold-hi">
          ← Voltar para o VIP
        </Link>
      </div>
    </>
  );
}
