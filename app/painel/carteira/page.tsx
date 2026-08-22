import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { temVinculo } from "@/lib/linking";
import {
  saldo,
  extrato,
  jaPegouODaily,
  proximoDaily,
  DAILY_PALETAS,
  ORIGEM_LABEL,
  type Lancamento,
} from "@/lib/economia";
import { BotaoDaily } from "./daily";

export const metadata: Metadata = {
  title: "Carteira",
  description: "Seu saldo de Paletas e o extrato de tudo que entrou e saiu.",
};

// Saldo nunca pode vir de cache: é dinheiro na tela.
export const dynamic = "force-dynamic";

export default async function Carteira() {
  const session = await auth();
  if (!session) redirect("/entrar");

  const discordId = session.user.discordId;
  const [total, linhas, pegou, vinculado] = await Promise.all([
    saldo(discordId),
    extrato(discordId),
    jaPegouODaily(discordId),
    temVinculo(discordId),
  ]);

  return (
    <>
      <PageHeader
        kicker="Carteira"
        title="Suas Paletas"
        description="Todo lançamento fica registrado aqui, com a origem. Saldo é a soma do extrato — nada aparece do nada."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* ------------------------------------------------------- saldo */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">
              Saldo
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Pick className="size-9" />
              <span className="tabular text-5xl font-bold tracking-tight">
                {total}
              </span>
              <span className="self-end pb-1.5 text-lg text-muted">
                {total === 1 ? "Paleta" : "Paletas"}
              </span>
            </div>
            <p className="mt-4 max-w-md text-sm text-muted">
              A Paleta é sempre inteira. Ela entra pelo daily, por doação, por
              evento e — em breve — vendendo Pal e item no mercado.
            </p>
          </div>

          {/* ------------------------------------------------------- daily */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="font-semibold">Daily</h2>
            {!vinculado ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  Vincule seu personagem para liberar o daily. É o que impede
                  conta descartável de virar torneira de Paleta.
                </p>
                <Link
                  href="/vincular"
                  className="mt-4 inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
                >
                  Vincular personagem
                </Link>
              </>
            ) : pegou ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  Já pegou hoje. O próximo vira à meia-noite de Brasília.
                </p>
                <p className="tabular mt-4 text-sm text-success">
                  Próximo em{" "}
                  {proximoDaily().toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">
                  {DAILY_PALETAS} Paletas por dia, todo dia. Um mês rende{" "}
                  {DAILY_PALETAS * 30} — mais que uma doação de R$20.
                </p>
                <div className="mt-4">
                  <BotaoDaily quanto={DAILY_PALETAS} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ----------------------------------------------------- extrato */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Extrato</h2>
          {linhas.length === 0 ? (
            <p className="mt-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">
              Nada por aqui ainda. Pegue seu primeiro daily e a primeira linha
              aparece.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {linhas.map((l) => (
                <Linha key={l.id} lancamento={l} />
              ))}
            </ul>
          )}
        </section>

        <p className="mt-6 max-w-2xl text-xs text-muted">
          As Paletas do Palbot ainda não foram trazidas para cá. Quando forem,
          cada uma vai aparecer no seu extrato como uma linha de origem
          &ldquo;{ORIGEM_LABEL.migracao}&rdquo; — ninguém perde nada.
        </p>
      </div>
    </>
  );
}

function Linha({ lancamento }: { lancamento: Lancamento }) {
  const entrou = lancamento.delta > 0;

  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {ORIGEM_LABEL[lancamento.origem] ?? lancamento.origem}
        </p>
        <p className="truncate text-sm text-muted">
          {lancamento.descricao ||
            new Date(lancamento.em).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              dateStyle: "short",
              timeStyle: "short",
            })}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`tabular font-bold ${entrou ? "text-success" : "text-danger"}`}
        >
          {entrou ? "+" : "−"}
          {Math.abs(lancamento.delta)}
        </p>
        <p className="tabular text-xs text-muted">
          saldo {lancamento.saldoDepois}
        </p>
      </div>
    </li>
  );
}
