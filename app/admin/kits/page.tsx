import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canPowerServer } from "@/lib/roles";
import { catalogoDeItens } from "@/lib/itens";
import { todosOsKits } from "@/lib/kits";
import { FormularioDeKit, LinhaDeKit } from "./formularios";

export const metadata: Metadata = { title: "Kits" };
export const dynamic = "force-dynamic";

export default async function Kits() {
  const session = await auth();
  if (!session) redirect("/entrar");

  // Quem não é da cúpula nem descobre que a página existe — mesmo critério
  // de `/admin/moderacao`.
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const [kits, catalogo] = await Promise.all([
    todosOsKits(),
    Promise.resolve(catalogoDeItens()),
  ]);

  const ativos = kits.filter((k) => k.ativo).length;

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="Kits da loja"
        description="Lotes de itens que os jogadores compram com Paletas e recebem na hora, dentro do jogo."
      />

      <div className="mx-auto max-w-4xl px-4 py-12">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Montar um kit novo</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Os itens nascem do nada e as Paletas pagas são{" "}
            <b className="text-text">queimadas</b> — o kit tira moeda de
            circulação em vez de passá-la para alguém. Por isso o preço é a
            única trava: escolha com isso em mente.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-muted">
            A entrega é na hora, por RCON, dentro do jogo. Quem estiver
            offline não consegue comprar — o comando do jogo precisa achar a
            pessoa no mundo.
          </p>
          <div className="mt-5">
            <FormularioDeKit catalogo={catalogo} />
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Kits cadastrados</h2>
            <span className="text-sm text-muted">
              {ativos} na vitrine · {kits.length} no total
            </span>
          </div>

          {kits.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nenhum kit ainda. Monte o primeiro acima.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {kits.map((k) => (
                <LinhaDeKit key={k.id} kit={k} catalogo={catalogo} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
