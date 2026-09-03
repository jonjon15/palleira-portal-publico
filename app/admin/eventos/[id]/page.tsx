import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canManageEvents } from "@/lib/roles";
import { activeServers } from "@/lib/servers";
import { buscarEventoPorId, imagensDoEvento } from "@/lib/eventos";
import { EditarEvento, AdicionarFoto, FotoDoEvento } from "./formularios";

export const metadata: Metadata = { title: "Editar evento" };
export const dynamic = "force-dynamic";

export default async function FotosDoEvento({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/entrar");
  if (
    !canManageEvents(levelOf(session.user.roles, session.user.isMember), session.user.roles)
  ) {
    notFound();
  }

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const evento = await buscarEventoPorId(eventId);
  if (!evento) notFound();

  const imagens = await imagensDoEvento(eventId);

  return (
    <>
      <PageHeader
        kicker="Administração"
        title={evento.title}
        description="Editar título, texto e capa, e a galeria que cresce depois — tipo foto dos campeões."
      />

      <div className="mx-auto max-w-4xl px-4 py-12">
        <Link
          href="/admin/eventos"
          className="text-sm font-semibold text-muted hover:text-text"
        >
          ← Eventos
        </Link>

        <section className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Editar evento</h2>
          <div className="mt-4">
            <EditarEvento evento={evento} servidores={activeServers()} />
          </div>
        </section>

        <section className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Adicionar foto</h2>
          <div className="mt-4">
            <AdicionarFoto eventId={eventId} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">
            Galeria {imagens.length > 0 && `(${imagens.length})`}
          </h2>
          {imagens.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nenhuma foto ainda. Cole o primeiro link acima.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {imagens.map((img) => (
                <FotoDoEvento key={img.id} imagem={img} eventId={eventId} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
