import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canManageEconomy, PLANOS } from "@/lib/roles";
import { planosVip, infiniteTag, doacoesRecentes, reais } from "@/lib/vip";
import { nomesDe, botPodeDarCargos } from "@/lib/discord";
import { catalogoDeItens } from "@/lib/itens";
import {
  FormularioDaTag,
  FormularioDePlano,
  FormularioDoBooster,
  ConcederBooster,
  Reentregar,
} from "./formularios";
import { configBooster, boostersRecentes, servidoresComBooster, TIPOS } from "@/lib/booster";

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

  const [planos, tag, doacoes, botOk, boosterCfg, boosters] = await Promise.all([
    planosVip(false),
    infiniteTag(),
    doacoesRecentes(),
    botPodeDarCargos(PLANOS.map((p) => p.role)),
    configBooster(),
    boostersRecentes(),
  ]);
  const testado = doacoes.some((d) => d.status === "entregue");
  const catalogo = catalogoDeItens();
  const nomes = await nomesDe([
    ...new Set([...doacoes.map((d) => d.discordId), ...boosters.map((b) => b.discordId)]),
  ]);

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="VIP por doação"
        description="Os planos que aparecem em /vip, a conta da InfinitePay que recebe e as doações que chegaram."
      />

      <div className="mx-auto max-w-4xl space-y-10 px-4 py-12">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Passo a passo para ligar as doações</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            O Pix cai direto na conta InfinitePay do dono — o site só confirma o
            pagamento e entrega o cargo e as Paletas. Faça uma vez, na ordem.
          </p>

          <ol className="mt-5 space-y-4">
            <Passo n={1} titulo="Ligar o Checkout Integrado na InfinitePay" estado="manual">
              No app da InfinitePay: <b className="text-text">Vendas → Checkout → Configurações</b> →
              ativar <b className="text-text">Checkout Integrado</b>. Pelo computador, o mesmo fica em{" "}
              <a
                href="https://app.infinitepay.io/external-checkout#configuracoes?enabled=true"
                target="_blank"
                rel="noreferrer"
                className="text-gold underline"
              >
                app.infinitepay.io
              </a>
              . Sem isso, o botão de doar mostra erro. O site não consegue conferir este passo — confira no app.
            </Passo>

            <Passo n={2} titulo="Salvar a InfiniteTag aqui" estado={tag ? "ok" : "falta"}>
              A InfiniteTag é o nome de usuário na InfinitePay, o que começa com <b className="text-text">$</b>.
              Digite abaixo (com ou sem o $) e salve. É isso que faz o botão &ldquo;Doar via Pix&rdquo; aparecer
              em /vip. Para desligar as doações, apague e salve.
              <div className="mt-3">
                <FormularioDaTag tag={tag} />
              </div>
            </Passo>

            <Passo
              n={3}
              titulo="Dar ao bot do Discord a permissão de dar cargo"
              estado={botOk === null ? "manual" : botOk ? "ok" : "falta"}
            >
              No Discord: <b className="text-text">Configurações do servidor → Cargos</b>. Dê ao bot{" "}
              <b className="text-text">Palleira BR</b> um cargo com a permissão{" "}
              <b className="text-text">Gerenciar cargos</b>, e arraste esse cargo para{" "}
              <b className="text-text">acima</b> dos três V.i.p. (Hard Metal, New Metal e Palleira). Sem isso o Pix
              entra e as Paletas saem, mas o cargo fica esperando o botão &ldquo;Entregar de novo&rdquo;.
              {botOk === null && <> (Não consegui perguntar ao Discord agora — recarregue para conferir.)</>}
            </Passo>

            <Passo n={4} titulo="Fazer uma doação de teste" estado={testado ? "ok" : "falta"}>
              Em <b className="text-text">Planos</b>, abaixo, mude o valor de um plano para{" "}
              <b className="text-text">1,00</b> e salve. Doe esse plano em /vip com a sua conta, confira se o cargo e
              as Paletas chegaram e se a doação aparece como &ldquo;Entregue&rdquo; em Doações recentes. Depois volte
              o valor.
            </Passo>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Planos</h2>
          <p className="mt-1 text-sm text-muted">
            Mudar o valor vale para as próximas doações; quem já doou fica com o
            que pagou.
          </p>
          <div className="mt-4 space-y-4">
            {planos.map((p) => (
              <FormularioDePlano key={p.key} plano={p} catalogo={catalogo} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Booster da comunidade</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            O servidor aplica sozinho no restart: o script <code>vigia/booster_boot.py</code> roda antes do
            jogo abrir, multiplica as taxas do painel e grava. Os boosters do VIP de cada plano ficam no
            campo &ldquo;Boosters&rdquo; acima.
          </p>
          <div className="mt-4 space-y-4">
            <FormularioDoBooster cfg={boosterCfg} />
            <ConcederBooster
              servidores={servidoresComBooster().map((s) => ({ slug: s.slug, nome: s.shortName }))}
              tipos={Object.entries(TIPOS).map(([key, t]) => ({ key, rotulo: t.rotulo }))}
            />
          </div>
          {boosters.length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {boosters.map((b) => (
                <li key={b.id} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {nomes.get(b.discordId) ?? b.discordId} · {b.tipos.map((t) => TIPOS[t]?.rotulo ?? t).join(" + ")} ·{" "}
                      {b.servidor}
                    </p>
                    <p className="text-xs text-muted">
                      #{b.id} ·{" "}
                      {b.origem === "vip" ? "crédito VIP" : b.origem === "staff" ? "dado pela staff" : reais(b.valorCentavos)} ·{" "}
                      {new Date(b.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      {b.ativadoEm && (
                        <> · ligou {new Date(b.ativadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</>
                      )}
                    </p>
                    {b.detail && (
                      <p className={`mt-1 text-xs ${b.origem === "staff" ? "text-muted" : "text-danger"}`}>{b.detail}</p>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-muted">
                    {{ aguardando: "Aguardando Pix", na_fila: "Na fila", ativo: "Ligado", encerrado: "Já rodou", falhou: "Link não abriu" }[
                      b.status
                    ] ?? b.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
                      {d.itensStatus !== "entregue" && d.itensDetail && (
                        <p className="mt-1 text-xs text-warning">Itens do jogo: {d.itensDetail}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`text-xs font-semibold ${st.cor}`}>{st.rotulo}</span>
                      {(d.status === "pago" || d.status === "entregue") && d.itensStatus !== "sem" && (
                        <span className={`text-xs ${d.itensStatus === "entregue" ? "text-success" : "text-muted"}`}>
                          {d.itensStatus === "entregue" ? "Itens do jogo recebidos" : "Itens do jogo: falta resgatar"}
                        </span>
                      )}
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

const ESTADO_DO_PASSO = {
  ok: { rotulo: "Feito", cor: "border-success/40 bg-success/10 text-success" },
  falta: { rotulo: "Falta", cor: "border-warning/40 bg-warning/10 text-warning" },
  manual: { rotulo: "Confira", cor: "border-line-strong text-muted" },
} as const;

function Passo({
  n,
  titulo,
  estado,
  children,
}: {
  n: number;
  titulo: string;
  estado: keyof typeof ESTADO_DO_PASSO;
  children: React.ReactNode;
}) {
  const e = ESTADO_DO_PASSO[estado];
  return (
    <li className="rounded-[var(--radius-control)] border border-line bg-bg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular flex size-6 items-center justify-center rounded-full bg-gold text-xs font-bold text-[#14120f]">
          {n}
        </span>
        <h3 className="font-semibold">{titulo}</h3>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[0.65rem] font-bold tracking-wider uppercase ${e.cor}`}>
          {e.rotulo}
        </span>
      </div>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </li>
  );
}
