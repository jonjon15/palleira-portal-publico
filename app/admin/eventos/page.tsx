import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canManageEvents } from "@/lib/roles";
import { activeServers } from "@/lib/servers";
import { listarTodosOsEventos } from "@/lib/eventos";
import { NovoEvento, LinhaEvento } from "./formularios";

export const metadata: Metadata = { title: "Eventos" };
export const dynamic = "force-dynamic";

export default async function AdminEventos() {
  const session = await auth();
  if (!session) redirect("/entrar");

  // Quem não pode escrever no mural nem descobre que a página existe.
  if (!canManageEvents(levelOf(session.user.roles, session.user.isMember), session.user.roles)) {
    notFound();
  }

  const eventos = await listarTodosOsEventos();

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="Eventos"
        description="O mural que aparece em /eventos e, quando fixado, na home. Rascunho só aparece aqui."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Novo evento</h2>
          <div className="mt-4">
            <NovoEvento servidores={activeServers()} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">No mural</h2>
          {eventos.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhum evento ainda.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {eventos.map((e) => (
                <LinhaEvento key={e.id} evento={e} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
