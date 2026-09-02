import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EventoSelo } from "@/components/evento-selo";
import { buscarEventoPorSlug } from "@/lib/eventos";
import { activeServers } from "@/lib/servers";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const evento = await buscarEventoPorSlug(slug).catch(() => null);
  return { title: evento?.title ?? "Evento" };
}

export default async function EventoPagina({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const evento = await buscarEventoPorSlug(slug);
  if (!evento) notFound();

  const servidor = evento.serverSlug
    ? activeServers().find((s) => s.slug === evento.serverSlug)
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/eventos"
        className="text-sm font-semibold text-muted hover:text-text"
      >
        ← Eventos
      </Link>

      <div className="mt-6 flex items-center gap-3">
        {evento.coverEmoji && (
          <span className="text-4xl" aria-hidden>
            {evento.coverEmoji}
          </span>
        )}
        <EventoSelo evento={evento} />
      </div>

      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        {evento.title}
      </h1>

      <p className="mt-2 text-sm text-muted">
        por {evento.createdByName || "Palleira"}
        {evento.startsAt &&
          ` · ${new Date(evento.startsAt).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}`}
        {servidor && ` · ${servidor.shortName}`}
      </p>

      {evento.body && (
        <div className="mt-6 space-y-4 text-[0.95rem] leading-relaxed text-text">
          {evento.body.split(/\n{2,}/).map((paragrafo, i) => (
            <p key={i} className="whitespace-pre-line">
              {paragrafo}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
