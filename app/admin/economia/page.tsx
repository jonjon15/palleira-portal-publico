import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canManageEconomy } from "@/lib/roles";
import { nomesDe } from "@/lib/discord";
import { todosOsVinculos } from "@/lib/linking";
import { circulacao, maioresSaldos, ORIGEM_LABEL, type Origem } from "@/lib/economia";
import { AjustarSaldo } from "./formularios";

export const metadata: Metadata = { title: "Economia" };
export const dynamic = "force-dynamic";

export default async function Economia() {
  const session = await auth();
  if (!session) redirect("/entrar");

  // Quem não pode mexer não descobre nem que a página existe.
  if (!canManageEconomy(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const [geral, topo, vinculos] = await Promise.all([
    circulacao(),
    maioresSaldos(),
    todosOsVinculos(),
  ]);

  // 🔴 Em série, e não uma chamada por pessoa de uma vez — o Discord dá 429
  // em rajada (ver o comentário maior de `nomesDe`, chamada em lote aqui
  // resolve os dois usos da página numa passada só).
  const idsParaNome = [...new Set([...topo.map((t) => t.discord_id), ...vinculos.map((v) => v.discordId)])];
  const nomes = await nomesDe(idsParaNome);

  const comNome = topo.map((t) => ({
    ...t,
    nome: nomes.get(t.discord_id) ?? t.discord_id,
  }));

  const jogadores = vinculos
    .map((v) => ({ discordId: v.discordId, nome: nomes.get(v.discordId) ?? v.playerName }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="Economia"
        description="Quanta Paleta existe, de onde veio, e o ajuste que mexe nisso."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* ------------------------------------------------- circulação */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Em circulação" valor={geral.total} />
          <Numero rotulo="Carteiras com saldo" valor={geral.carteiras} />
          {geral.porOrigem.slice(0, 2).map((o) => (
            <Numero
              key={o.origem}
              rotulo={`Entrou por ${(ORIGEM_LABEL[o.origem] ?? o.origem).toLowerCase()}`}
              valor={o.entrou}
            />
          ))}
        </div>

        {/* ---------------------------------------------------- ajuste */}
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Ajuste manual</h2>
            <p className="mt-2 text-sm text-muted">
              Prêmio de evento, correção de erro, devolução, ou saldo que a
              pessoa já tinha de algum outro lugar. O motivo é obrigatório e
              fica visível no extrato da pessoa — é o que diferencia
              administração de mágica.
            </p>
            <div className="mt-6">
              <AjustarSaldo jogadores={jogadores} />
            </div>
          </section>

          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Maiores saldos</h2>
            {comNome.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Nenhuma carteira com saldo ainda.
              </p>
            ) : (
              <ol className="mt-4 space-y-2">
                {comNome.map((t, i) => (
                  <li
                    key={t.discord_id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="tabular w-5 text-right text-muted">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{t.nome}</span>
                    <span className="tabular font-bold text-gold">
                      {t.total}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* --------------------------------------------- por onde anda */}
        {geral.porOrigem.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Por onde a Paleta anda</h2>
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {geral.porOrigem.map((o) => (
                <li
                  key={o.origem}
                  className="flex items-center gap-4 px-5 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {ORIGEM_LABEL[o.origem as Origem] ?? o.origem}
                  </span>
                  <span className="tabular text-success">+{o.entrou}</span>
                  <span className="tabular w-16 text-right text-danger">
                    {o.saiu > 0 ? `−${o.saiu}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 max-w-2xl text-xs text-muted">
              Enquanto só existir coluna de entrada, a economia infla. Os sinks
              da §7.7 — taxa de venda queimada, slot de cofre, cosmético —
              entram junto com o mercado.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">
        {rotulo}
      </p>
      <p className="tabular mt-2 text-3xl font-bold tracking-tight">{valor}</p>
    </div>
  );
}
