import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { EventoSelo } from "@/components/evento-selo";
import { listarEventosPublicados, proximosEventos, type Evento } from "@/lib/eventos";

export const metadata: Metadata = { title: "Eventos" };
export const revalidate = 60;

function quando(e: Evento): string {
  const data = e.startsAt ?? e.createdAt;
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(e.startsAt ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export default async function Eventos() {
  const [eventos, proximos] = await Promise.all([
    listarEventosPublicados(),
    proximosEventos(),
  ]);

  return (
    <>
      <PageHeader
        kicker="Comunidade"
        title="Eventos"
        description="Guerra de guild, manutenção, caça coletiva — tudo que acontece na Palleira passa por aqui."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {eventos.length === 0 ? (
          <p className="text-muted">Nenhum evento publicado ainda.</p>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
            <div className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {eventos.map((e) => (
                <Link
                  key={e.id}
                  href={`/eventos/${e.slug}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2/60"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-gradient-to-br from-gold/30 to-gold-deep/40 text-xl">
                    {e.pinned ? "📌" : e.coverEmoji || "📣"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {e.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      por {e.createdByName || "Palleira"} · {quando(e)}
                    </span>
                  </span>
                  <EventoSelo evento={e} />
                </Link>
              ))}
            </div>

            <aside className="h-fit rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <h2 className="text-xs font-bold tracking-[0.1em] text-muted uppercase">
                Próximos eventos
              </h2>
              {proximos.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  Nada marcado por enquanto.
                </p>
              ) : (
                <ul className="mt-3">
                  {proximos.map((e) => (
                    <li
                      key={e.id}
                      className="flex gap-2.5 border-b border-dashed border-line py-2 text-sm last:border-b-0"
                    >
                      <span className="tabular w-16 shrink-0 font-mono text-xs text-gold-hi">
                        {quando(e)}
                      </span>
                      <Link
                        href={`/eventos/${e.slug}`}
                        className="min-w-0 flex-1 truncate font-semibold hover:text-gold"
                      >
                        {e.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
