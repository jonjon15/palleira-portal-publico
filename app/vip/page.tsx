import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { ItemIcon } from "@/components/item-icon";
import { nomeDoItem } from "@/lib/itens";
import { planosVip, infiniteTag, reais, meusItensVip, DIAS_DE_VIP } from "@/lib/vip";
import { Doar, PedirBooster, ResgatarItens } from "./formularios";
import {
  configBooster,
  creditosVip,
  situacaoDosServidores,
  servidoresComBooster,
  TIPOS,
  DURACAO_HORAS,
} from "@/lib/booster";

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
  const [planos, tag, session, aResgatar, boosterCfg, situacao] = await Promise.all([
    planosVip(),
    infiniteTag(),
    auth(),
    meusItensVip(),
    configBooster(),
    situacaoDosServidores(),
  ]);
  const ligado = Boolean(tag);
  const creditos = session ? await creditosVip(session.user.discordId) : { disponiveis: 0, total: 0 };

  return (
    <>
      <PageHeader
        kicker="Doação"
        title="Apoie a Palleira"
        description="Os servidores são mantidos por doações da comunidade. Quem doa ganha um cargo VIP no Discord por 30 dias como agradecimento — daily maior e mais espaço no cofre saem na hora."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {aResgatar.length > 0 && (
          <section className="mb-8 max-w-3xl space-y-4 rounded-[var(--radius-card)] border border-success/40 bg-success/[0.06] p-5">
            <div>
              <h2 className="font-semibold text-success">Seus itens do VIP chegaram</h2>
              <p className="mt-1 text-sm text-muted">
                Entre em um dos servidores com o seu personagem e clique em
                &ldquo;Receber no jogo&rdquo; — os itens caem direto na mochila,
                no servidor em que você estiver.
              </p>
            </div>
            {aResgatar.map((d) => (
              <div key={d.id} className="rounded-[var(--radius-control)] border border-line bg-surface p-4">
                <p className="text-sm font-semibold">
                  VIP {d.planoNome}
                  <span className="ml-2 text-xs font-normal text-muted">
                    doação de {new Date(d.pagoEm).toLocaleDateString("pt-BR")}
                  </span>
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {d.itens.map((i) => (
                    <li
                      key={i.itemId}
                      className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface-2/60 py-1 pr-2.5 pl-1 text-xs"
                    >
                      <ItemIcon itemId={i.itemId} className="size-6" bare />
                      <span className="tabular font-semibold">{i.quantidade.toLocaleString("pt-BR")}</span>
                      <span className="text-muted">{nomeDoItem(i.itemId)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <ResgatarItens id={d.id} />
                </div>
              </div>
            ))}
          </section>
        )}

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
                {plano.boosters > 0 && (
                  <li className="flex gap-2">
                    <span className="text-gold">🚀</span>
                    <span className="text-muted">
                      <span className="tabular text-text">{plano.boosters}</span>{" "}
                      {plano.boosters === 1 ? "booster" : "boosters"} de servidor para ativar quando quiser
                    </span>
                  </li>
                )}
                {plano.itens.map((i) => (
                  <li key={i.itemId} className="flex items-center gap-2">
                    <ItemIcon itemId={i.itemId} className="size-5" bare />
                    <span className="text-muted">
                      <span className="tabular text-text">{i.quantidade.toLocaleString("pt-BR")}</span>{" "}
                      {nomeDoItem(i.itemId)}
                    </span>
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

        {boosterCfg.ativo && (
          <section id="booster" className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight">🚀 Booster da comunidade</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Turbina o servidor inteiro por {DURACAO_HORAS} horas: taxa{" "}
              {boosterCfg.multiplicador.toLocaleString("pt-BR")}x de XP, Drop de Pals (o que cai ao derrotar)
              e/ou Coleta (madeira, pedra, minério, plantas) para todo mundo que estiver jogando. Entra no próximo restart do servidor (de 4 em 4 horas). Se o tipo já estiver
              ligado, o seu pedido estende o tempo — a taxa nunca passa de{" "}
              {boosterCfg.multiplicador.toLocaleString("pt-BR")}x. Quem é VIP tem boosters para ativar;
              acabou, é só doar outro.
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
              <div className="grid content-start gap-3 sm:grid-cols-2">
                {situacao.map((s) => (
                  <div
                    key={s.slug}
                    className={`rounded-[var(--radius-card)] border p-5 ${
                      s.ativos.length ? "border-gold bg-gold/[0.06]" : "border-line bg-surface"
                    }`}
                  >
                    <p className="font-semibold">{s.nome}</p>
                    {s.ativos.length ? (
                      <>
                        <p className="mt-2 text-lg font-bold text-gold">
                          🔥 {s.ativos.map((t) => TIPOS[t].rotulo).join(" + ")}{" "}
                          {boosterCfg.multiplicador.toLocaleString("pt-BR")}x
                        </p>
                        {s.ate && (
                          <p className="text-xs text-muted">
                            até o próximo restart (~
                            {new Date(s.ate).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "America/Sao_Paulo",
                            })}
                            )
                          </p>
                        )}
                        {Object.keys(s.taxas).length > 0 && (
                          <p className="tabular mt-2 text-xs text-muted">
                            {Object.entries(s.taxas)
                              .map(([k, [a, n]]) => `${k.replace("Rate", "")} ${a}x → ${n}x`)
                              .join(" · ")}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted">Sem booster agora</p>
                    )}
                    {Object.keys(s.fila).length > 0 && (
                      <p className="mt-3 text-xs text-muted">
                        Na fila:{" "}
                        {(Object.entries(s.fila) as [keyof typeof TIPOS, number][])
                          .map(([t, n]) => `${TIPOS[t].rotulo} +${n * DURACAO_HORAS}h`)
                          .join(" · ")}{" "}
                        — entra nos próximos restarts
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                {!session ? (
                  <Link href="/entrar" className="text-sm font-semibold text-gold">
                    Entre com o Discord para ativar um booster →
                  </Link>
                ) : (
                  <>
                    {creditos.total > 0 && (
                      <p className="mb-4 text-sm text-muted">
                        Seus boosters do VIP:{" "}
                        <b className="tabular text-text">
                          {creditos.disponiveis} de {creditos.total}
                        </b>{" "}
                        disponíveis
                      </p>
                    )}
                    {creditos.disponiveis === 0 && !ligado ? (
                      <p className="text-sm text-muted">Doações de booster em breve.</p>
                    ) : (
                      <PedirBooster
                        servidores={servidoresComBooster().map((s) => ({ slug: s.slug, nome: s.shortName }))}
                        preco={reais(boosterCfg.precoCentavos)}
                        multiplicador={boosterCfg.multiplicador}
                        creditos={creditos.disponiveis}
                        pixLigado={ligado}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="mt-10 max-w-3xl space-y-2 text-xs text-muted">
          <h2 className="text-sm font-semibold text-text">Como funciona a doação</h2>
          <p>
            O pagamento é por Pix (ou cartão), processado pela InfinitePay. Assim
            que ele é confirmado, o cargo VIP entra no seu Discord e as Paletas na
            sua carteira, sozinhos. O cargo dura {DIAS_DE_VIP} dias; doar de novo
            antes de acabar soma mais {DIAS_DE_VIP}.
          </p>
          <p>
            Os itens do jogo vêm uma vez a cada doação. Eles ficam esperando
            nesta página até você entrar em um servidor e clicar em
            &ldquo;Receber no jogo&rdquo; — não expiram.
          </p>
          <p>
            <b className="text-text">Doações são voluntárias e não reembolsáveis.</b>{" "}
            Os agradecimentos (cargo, Paletas e itens no jogo) podem mudar ou deixar
            de existir — por exemplo, se um servidor for desligado — e não dão
            direito a nenhum serviço contínuo.
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
