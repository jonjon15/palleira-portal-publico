import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canModerate } from "@/lib/roles";
import { resgatesRecentes } from "@/lib/resgates-pal";
import { nomesDe } from "@/lib/discord";
import { AutoRefresh } from "./auto-refresh";

export const metadata: Metadata = { title: "Resgates de Pal" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  aguardando_arquivo: "Aguardando arquivo",
  arquivo_pronto: "Arquivo pronto — entregando",
  concluido: "Concluído",
  falhou: "Falhou",
};

const STATUS_COR: Record<string, string> = {
  aguardando_arquivo: "border-warning/30 bg-warning/10 text-warning",
  arquivo_pronto: "border-gold/30 bg-gold/10 text-gold",
  concluido: "border-success/30 bg-success/10 text-success",
  falhou: "border-danger/30 bg-danger/10 text-danger",
};

function tempoDecorrido(desde: string): string {
  const ms = Date.now() - new Date(desde).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}min`;
}

export default async function Resgates() {
  const session = await auth();
  if (!session) redirect("/entrar");

  if (!canModerate(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const lista = await resgatesRecentes(50);
  const nomes = await nomesDe(lista.map((r) => r.discordId));

  const emAndamento = lista.filter((r) =>
    ["aguardando_arquivo", "arquivo_pronto"].includes(r.status),
  );
  const finalizados = lista.filter((r) => !emAndamento.includes(r));

  return (
    <>
      <AutoRefresh />
      <PageHeader
        kicker="Administração"
        title="Resgates de Pal"
        description="Acompanhamento ao vivo do resgate do cofre — da retirada do banco até o givepal_j confirmar no jogo."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-5">
          <h2 className="font-semibold">
            GitHub Actions bloqueado por billing (desde 17/09/2026)
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Enquanto isso não é resolvido em{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              github.com/settings/billing
            </code>
            , quem escreve o arquivo e chama o RCON é{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              tools/entregar_pals_local.py
            </code>{" "}
            rodando na máquina local — precisa dela ligada para os resgates
            saírem de &ldquo;Aguardando arquivo&rdquo;.
          </p>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">
            Em andamento
            {emAndamento.length > 0 && (
              <span className="ml-2 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-bold text-gold">
                {emAndamento.length}
              </span>
            )}
          </h2>
          {emAndamento.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nada esperando entrega agora.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {emAndamento.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm"
                >
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold tracking-wider uppercase ${STATUS_COR[r.status] ?? ""}`}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  <span className="text-muted">{r.serverNome}</span>
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                    {r.palId}
                  </code>
                  <span className="min-w-0 flex-1 truncate">
                    {nomes.get(r.discordId) ?? r.discordId}
                  </span>
                  <span className="text-xs text-muted">
                    #{r.id} · há {tempoDecorrido(r.criadoEm)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Histórico recente</h2>
          {finalizados.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhum resgate ainda.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {finalizados.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm"
                >
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold tracking-wider uppercase ${STATUS_COR[r.status] ?? ""}`}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  <span className="text-muted">{r.serverNome}</span>
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                    {r.palId}
                  </code>
                  <span className="min-w-0 flex-1 truncate">
                    {nomes.get(r.discordId) ?? r.discordId}
                  </span>
                  {r.detail && (
                    <span
                      className="max-w-xs truncate text-xs text-muted"
                      title={r.detail}
                    >
                      {r.detail}
                    </span>
                  )}
                  <span className="tabular text-xs text-muted">
                    {new Date(r.criadoEm).toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
