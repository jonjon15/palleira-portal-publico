import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { planosVip, infiniteTag, reais, DIAS_DE_VIP } from "@/lib/vip";
import { Doar } from "./formularios";

export const metadata: Metadata = { title: "VIP" };
// Planos editáveis no admin: cache aqui mostraria valor antigo.
export const dynamic = "force-dynamic";

/**
 * VIP por doação (§7.13 do PROMPT.md, refeito em 23/09/2026).
 *
 * O conteúdo dos planos vem de `vip_planos`, editado em /admin/vip. Daily e
 * slots do cofre continuam regra fixa do site (`PLANOS` em `lib/roles.ts`).
 * O texto deixa explícito, mais de uma vez, que é doação — pedido do dono.
 */
export default async function Vip() {
  const [planos, tag, session] = await Promise.all([planosVip(), infiniteTag(), auth()]);
  const ligado = Boolean(tag);

  return (
    <>
      <PageHeader
        kicker="Doação"
        title="Apoie a Palleira"
        description="Os servidores são mantidos por doações da comunidade. Quem doa ganha um cargo VIP no Discord por 30 dias como agradecimento — daily maior e mais espaço no cofre saem na hora."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 max-w-3xl rounded-[var(--radius-card)] border border-gold/40 bg-gold/[0.06] p-5 text-sm">
          <p className="font-semibold text-gold">Isto é uma doação, não uma compra.</p>
          <p className="mt-1.5 text-muted">
            O valor é uma contribuição voluntária para pagar os servidores. Os
            benefícios abaixo são um <b className="text-text">agradecimento</b>{" "}
            da comunidade, por {DIAS_DE_VIP} dias — não um produto ou serviço
            vendido.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {planos.map((plano) => (
            <div
              key={plano.key}
              className={`flex flex-col rounded-[var(--radius-card)] border p-6 ${
                plano.destaque ? "border-gold bg-gold/[0.06]" : "border-line bg-surface"
              }`}
            >
              {plano.destaque && (
                <span className="mb-3 w-fit rounded-full bg-gold px-2.5 py-0.5 text-[0.65rem] font-bold tracking-wider text-[#14120f] uppercase">
                  Maior apoio
                </span>
              )}

              <h2 className="text-xl font-bold">VIP {plano.nome}</h2>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="text-sm text-muted">Doação de</span>
                <span className="tabular text-3xl font-bold tracking-tight">
                  {reais(plano.precoCentavos)}
                </span>
              </p>
              <p className="text-xs text-muted">
                Agradecimento válido por {DIAS_DE_VIP} dias
              </p>

              {plano.paletasNoMes > 0 && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted">
                  <Pick className="size-4" withLetter={false} />
                  <span className="tabular font-semibold text-text">+{plano.paletasNoMes}</span>
                  Paletas de agradecimento
                </p>
              )}

              <div className="mt-4 rounded-[var(--radius-control)] border border-dashed border-line-strong p-3 text-sm text-muted">
                No site, automático: daily de{" "}
                <b className="tabular text-text">{plano.dailyPaletas}</b> por dia e{" "}
                <b className="tabular text-text">{plano.slotsCofre}</b> slots grátis no
                cofre (item e Pal).
              </div>

              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plano.beneficios.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-gold">✓</span>
                    <span className="text-muted">{b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {!ligado ? (
                  <span className="flex w-full items-center justify-center rounded-[var(--radius-control)] border border-line-strong px-5 py-2.5 text-sm font-semibold text-muted">
                    Doações em breve
                  </span>
                ) : session ? (
                  <Doar plano={plano.key} valor={reais(plano.precoCentavos)} />
                ) : (
                  <Link
                    href="/entrar"
                    className="block w-full rounded-[var(--radius-control)] border border-line-strong px-4 py-2.5 text-center text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
                  >
                    Entrar com o Discord para doar
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        <section className="mt-10 max-w-3xl space-y-2 text-xs text-muted">
          <h2 className="text-sm font-semibold text-text">Como funciona a doação</h2>
          <p>
            O pagamento é por Pix (ou cartão), processado pela InfinitePay. Assim
            que ele é confirmado, o cargo VIP entra no seu Discord e as Paletas na
            sua carteira, sozinhos. O cargo dura {DIAS_DE_VIP} dias; doar de novo
            antes de acabar soma mais {DIAS_DE_VIP}.
          </p>
          <p>
            <b className="text-text">Doações são voluntárias e não reembolsáveis.</b>{" "}
            Os agradecimentos (cargo, Paletas e itens no jogo) podem mudar ou deixar
            de existir — por exemplo, se um servidor for desligado — e não dão
            direito a nenhum serviço contínuo. Os itens do jogo são entregues pela
            administração.
          </p>
          <p>
            A Palleira é uma comunidade independente, sem vínculo com a Pocketpair.
            Palworld é marca da Pocketpair. Menores de 18 anos só devem doar com
            autorização do responsável.
          </p>
        </section>
      </div>
    </>
  );
}
