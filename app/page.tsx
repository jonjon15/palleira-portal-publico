import Link from "next/link";
import { Pick } from "@/components/pick";
import { ServerCard, type ServerCardData } from "@/components/server-card";
import { activeServers } from "@/lib/servers";
import { getMetrics, getRates } from "@/lib/palworld/rest";
import { communityStats, topPlayers } from "@/lib/db";

// Status ao vivo, com cache — os servidores não aguentam uma chamada por
// visita de página (§3.3).
export const revalidate = 60;

async function loadServers(): Promise<ServerCardData[]> {
  return Promise.all(
    activeServers().map(async (server) => {
      const [metrics, rates] = await Promise.all([
        getMetrics(server).catch(() => null),
        getRates(server).catch(() => null),
      ]);
      return { server, metrics, rates };
    }),
  );
}

export default async function Home() {
  const [servers, stats, best] = await Promise.all([
    loadServers(),
    communityStats().catch(() => null),
    topPlayers(5).catch(() => []),
  ]);
  const online = servers.reduce(
    (n, s) => n + (s.metrics?.currentplayernum ?? 0),
    0,
  );
  const capacity = servers.reduce(
    (n, s) => n + (s.metrics?.maxplayernum ?? 0),
    0,
  );
  const anyUp = servers.some((s) => s.metrics !== null);

  return (
    <>
      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-line">
        {/* Identidade própria: brasa dourada sobre preto quente. Sem arte de
            terceiro — §14.4. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 50% -10%, rgb(232 185 35 / 0.18), transparent 65%)," +
              "radial-gradient(50% 40% at 85% 20%, rgb(200 68 46 / 0.10), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-gold uppercase">
            <Pick className="size-4" withLetter={false} />
            Comunidade brasileira de Palworld
          </p>

          <h1 className="font-display mt-4 text-6xl tracking-tight sm:text-8xl">
            PALLEIRA<span className="text-gold">.</span>
          </h1>

          <p className="mt-4 max-w-xl text-lg text-muted">
            O servidor mais rock and roll de Palworld. Status ao vivo, mercado
            de Pals e itens em Paletas, ranking de guilds e eventos — tudo num
            lugar só.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/conectar"
              className="rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
            >
              Como entrar no servidor
            </Link>
            <Link
              href="/mercado"
              className="rounded-[var(--radius-control)] border border-line-strong px-5 py-2.5 font-semibold transition-colors hover:bg-surface"
            >
              Ver o mercado
            </Link>
          </div>

          {anyUp && (
            <p className="tabular mt-8 text-sm text-muted">
              <span className="font-semibold text-text">{online}</span> de{" "}
              {capacity} vagas ocupadas agora
            </p>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ servidores */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Servidores</h2>
            <p className="mt-1 text-sm text-muted">
              Taxas lidas direto do servidor — sempre o valor real, nunca um
              cartaz desatualizado.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {servers.map((s) => (
            <ServerCard key={s.server.slug} {...s} />
          ))}
        </div>
      </section>

      {/* Prova de que a comunidade é viva, visível antes de qualquer login */}
      {stats && (
        <section className="border-t border-line bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-bold tracking-tight">
              A comunidade em números
            </h2>
            <p className="mt-1 text-sm text-muted">
              Somando os dois mundos, contado direto do save.
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Jogadores" value={stats.players} />
              <Stat label="Pals capturados" value={stats.pals} />
              <Stat label="Guilds" value={stats.guilds} />
              <Stat label="Bases construídas" value={stats.bases} />
            </dl>

            {best.length > 0 && (
              <>
                <h3 className="mt-12 text-lg font-semibold">
                  Os melhores da Palleira
                </h3>
                <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {best.map((p, i) => (
                    <li
                      key={`${p.server_slug}-${p.palworld_uid}`}
                      className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3"
                    >
                      <span
                        className={`tabular w-6 text-center text-lg font-bold ${
                          ["text-gold", "text-[#c9c9c9]", "text-[#c08457]"][i] ??
                          "text-muted"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {p.name}
                        </span>
                        <span className="tabular block text-sm text-muted">
                          Level {p.level} ·{" "}
                          {p.pal_count.toLocaleString("pt-BR")} Pals
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>

                <Link
                  href="/ranking"
                  className="mt-6 inline-block text-sm font-semibold text-gold hover:text-gold-hi"
                >
                  Ver o placar completo →
                </Link>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-4">
      <dd className="tabular text-3xl font-bold text-gold">
        {value.toLocaleString("pt-BR")}
      </dd>
      <dt className="mt-1 text-sm text-muted">{label}</dt>
    </div>
  );
}
