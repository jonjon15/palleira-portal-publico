import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canManageEconomy } from "@/lib/roles";
import { planosVip, infiniteTag, doacoesRecentes, reais } from "@/lib/vip";
import { nomesDe } from "@/lib/discord";
import { FormularioDaTag, FormularioDePlano, Reentregar } from "./formularios";

export const metadata: Metadata = { title: "VIP — administração" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  aguardando: { rotulo: "Aguardando Pix", cor: "text-muted" },
  pago: { rotulo: "Pago · entrega pela metade", cor: "text-warning" },
  entregue: { rotulo: "Entregue", cor: "text-success" },
  falhou: { rotulo: "Link não abriu", cor: "text-danger" },
};

export default async function VipAdmin() {
  const session = await auth();
  if (!session) redirect("/entrar");
  if (!canManageEconomy(levelOf(session.user.roles, session.user.isMember))) notFound();

  const [planos, tag, doacoes] = await Promise.all([planosVip(false), infiniteTag(), doacoesRecentes()]);
  const nomes = await nomesDe([...new Set(doacoes.map((d) => d.discordId))]);

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="VIP por doação"
        description="Os planos que aparecem em /vip, a conta da InfinitePay que recebe e as doações que chegaram."
      />

      <div className="mx-auto max-w-4xl space-y-10 px-4 py-12">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Conta da InfinitePay</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            O Pix cai na conta desta InfiniteTag. Antes, ligue o{" "}
            <b className="text-text">Checkout Integrado</b> no app da InfinitePay
            (Vendas → Checkout → Configurações) — sem isso o botão de doar dá erro.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-muted">
            O cargo sai sozinho só se o bot do Discord tiver a permissão
            &ldquo;Gerenciar cargos&rdquo; num cargo acima dos três V.i.p. Sem
            isso, a doação fica &ldquo;entrega pela metade&rdquo; e o botão
            &ldquo;Entregar de novo&rdquo; abaixo resolve depois de ajustar.
          </p>
          <div className="mt-5">
            <FormularioDaTag tag={tag} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Planos</h2>
          <p className="mt-1 text-sm text-muted">
            Mudar o valor vale para as próximas doações; quem já doou fica com o
            que pagou.
          </p>
          <div className="mt-4 space-y-4">
            {planos.map((p) => (
              <FormularioDePlano key={p.key} plano={p} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Doações recentes</h2>
          {doacoes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhuma ainda.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {doacoes.map((d) => {
                const st = STATUS[d.status] ?? { rotulo: d.status, cor: "text-muted" };
                return (
                  <li key={d.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {nomes.get(d.discordId) ?? d.discordId} · VIP {d.planoNome} · {reais(d.valorCentavos)}
                      </p>
                      <p className="text-xs text-muted">
                        #{d.id} · {new Date(d.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        {d.vipAte && <> · vale até {new Date(d.vipAte).toLocaleDateString("pt-BR")}</>}
                        {d.receiptUrl && (
                          <>
                            {" · "}
                            <a href={d.receiptUrl} target="_blank" rel="noreferrer" className="text-gold underline">
                              comprovante
                            </a>
                          </>
                        )}
                      </p>
                      {d.detail && <p className="mt-1 text-xs text-danger">{d.detail}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`text-xs font-semibold ${st.cor}`}>{st.rotulo}</span>
                      {d.status === "pago" && <Reentregar id={d.id} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
