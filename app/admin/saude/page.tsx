import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canModerate } from "@/lib/roles";
import { estadoGeral, type Nivel } from "@/lib/saude";

/**
 * Painel de saúde dos robôs (§ 18/09/2026).
 *
 * A pergunta é sempre "faz quanto tempo que isto deu sinal de vida?" — ver o
 * comentário de `lib/saude.ts` para os três apagões silenciosos que
 * motivaram a página.
 */

export const metadata: Metadata = { title: "Saúde dos robôs" };
export const dynamic = "force-dynamic";

const COR: Record<Nivel, string> = {
  ok: "border-success/30 bg-success/10 text-success",
  atencao: "border-warning/30 bg-warning/10 text-warning",
  ruim: "border-danger/30 bg-danger/10 text-danger",
};

const ROTULO: Record<Nivel, string> = {
  ok: "No ar",
  atencao: "Atrasado",
  ruim: "Parado",
};

export default async function Saude() {
  const session = await auth();
  if (!session) redirect("/entrar");
  if (!canModerate(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const sinais = await estadoGeral();
  const problemas = sinais.filter((s) => s.nivel !== "ok");

  return (
    <>
      <PageHeader
        kicker="Admin"
        title="Saúde dos robôs"
        description="O que roda fora do site — e faz quanto tempo deu sinal de vida."
      />

      <div className="mx-auto w-full max-w-3xl px-4 pb-16">
        <p
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            problemas.length ? COR.ruim : COR.ok
          }`}
        >
          {problemas.length === 0
            ? "Está tudo respondendo."
            : `${problemas.length} ${
                problemas.length === 1
                  ? "serviço precisa de atenção"
                  : "serviços precisam de atenção"
              }.`}
        </p>

        <ul className="space-y-2">
          {sinais.map((s) => (
            <li
              key={s.nome}
              className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
            >
              <span className="text-sm font-medium">{s.nome}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-white/50">{s.detalhe}</span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${COR[s.nivel]}`}
                >
                  {ROTULO[s.nivel]}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs leading-relaxed text-white/40">
          O import roda de 2 em 2 horas. O vigia de relog bate ponto a cada
          rodada, de dentro do container do jogo — se ele ficar em silêncio, ou
          o processo morreu, ou o servidor está fora do ar. A REST do
          PalDefender é consultada ao vivo: é dela que saem a lista de quem
          está online, o ranking e o cofre.
        </p>
      </div>
    </>
  );
}
