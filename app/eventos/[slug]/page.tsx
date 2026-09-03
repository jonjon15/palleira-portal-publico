import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EventoSelo } from "@/components/evento-selo";
import { buscarEventoPorSlug, imagensDoEvento } from "@/lib/eventos";
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

  const [servidor, galeria] = await Promise.all([
    evento.serverSlug
      ? Promise.resolve(activeServers().find((s) => s.slug === evento.serverSlug))
      : Promise.resolve(null),
    imagensDoEvento(evento.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/eventos"
        className="text-sm font-semibold text-muted hover:text-text"
      >
        ← Eventos
      </Link>

      {evento.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- link colado de qualquer host, sem lista fixa de domínio pra otimizar
        <img
          src={evento.coverImageUrl}
          alt=""
          className="mt-6 aspect-video w-full rounded-[var(--radius-card)] border border-line object-cover"
        />
      )}

      <div className="mt-6 flex items-center gap-3">
        {!evento.coverImageUrl && evento.coverEmoji && (
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

      {galeria.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-bold tracking-[0.1em] text-muted uppercase">
            Fotos
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {galeria.map((img) => (
              <li key={img.id} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- link colado de qualquer host, sem lista fixa de domínio pra otimizar */}
                <img
                  src={img.url}
                  alt={img.caption || ""}
                  className="aspect-square w-full object-cover"
                />
                {img.caption && (
                  <p className="truncate px-2.5 py-2 text-xs text-muted">
                    {img.caption}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
