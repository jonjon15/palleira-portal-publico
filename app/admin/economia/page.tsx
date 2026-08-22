import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canManageEconomy } from "@/lib/roles";
import { temListaDeMembros, buscarMembro, listarCanais } from "@/lib/discord";
import { circulacao, maioresSaldos, ORIGEM_LABEL, type Origem } from "@/lib/economia";
import {
  MigrarEmLote,
  AjustarSaldo,
  ImportarDoCanal,
} from "./formularios";

export const metadata: Metadata = { title: "Economia" };
export const dynamic = "force-dynamic";

export default async function Economia() {
  const session = await auth();
  if (!session) redirect("/entrar");

  // Quem não pode mexer não descobre nem que a página existe.
  if (!canManageEconomy(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const [geral, topo, podeNome, canais] = await Promise.all([
    circulacao(),
    maioresSaldos(),
    temListaDeMembros(),
    listarCanais().catch(() => []),
  ]);

  // A lista é curta; buscar um a um é mais simples que montar índice.
  const comNome = await Promise.all(
    topo.map(async (t) => ({
      ...t,
      nome:
        (await buscarMembro(t.discord_id).catch(() => null))?.displayName ??
        t.discord_id,
    })),
  );

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="Economia"
        description="Quanta Paleta existe, de onde veio, e as duas ferramentas que mexem nisso: migração e ajuste."
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

        {!podeNome && (
          <div className="mt-6 rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-5">
            <h2 className="font-semibold">
              Falta um interruptor para migrar por nome
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              O bot está no servidor, mas o Discord não deixa ele ver a lista de
              membros. Em{" "}
              <b className="text-text">
                Developer Portal → seu app → Bot → Privileged Gateway Intents
              </b>
              , ligue o <b className="text-text">Server Members Intent</b> e
              salve. Sem isso a migração só aceita ID numérico.
            </p>
          </div>
        )}

        {/* ------------------------------------------------ importador */}
        <section className="mt-8 rounded-[var(--radius-card)] border border-gold/30 bg-gold/[0.04] p-6">
          <p className="text-xs font-bold tracking-[0.18em] text-gold uppercase">
            O jeito fácil
          </p>
          <h2 className="mt-2 text-lg font-semibold">
            Ler os saldos direto do Discord
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            O Palbot não exporta nada, mas ele responde em público. Peça para a
            comunidade rodar{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              /balance
            </code>{" "}
            num canal, e o site lê as respostas dele aqui. Quem digitou o
            comando vem carimbado pelo próprio Discord — o saldo cai na conta
            certa, sem ninguém transcrever nome nenhum.
          </p>
          <div className="mt-6 max-w-2xl">
            <ImportarDoCanal canais={canais} />
          </div>
        </section>

        {/* -------------------------------------------------- migração */}
        <section className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Ou na mão, colando a lista</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Para quem não apareceu no canal. Rode{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              /checkpoints
            </code>{" "}
            no Discord, anote o número e cole aqui. Rodar duas vezes não credita
            duas vezes — quem já foi migrado é ignorado.
          </p>
          <div className="mt-6 max-w-2xl">
            <MigrarEmLote podeNome={podeNome} />
          </div>
        </section>

        {/* ---------------------------------------------------- ajuste */}
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Ajuste manual</h2>
            <p className="mt-2 text-sm text-muted">
              Prêmio de evento, correção de erro, devolução. O motivo é
              obrigatório e fica visível no extrato da pessoa — é o que
              diferencia administração de mágica.
            </p>
            <div className="mt-6">
              <AjustarSaldo />
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
