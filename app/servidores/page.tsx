import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ServerCard, type ServerCardData } from "@/components/server-card";
import { activeServers } from "@/lib/servers";
import { getMetrics, getRates } from "@/lib/palworld/rest";

export const metadata: Metadata = {
  title: "Servidores",
  description:
    "Status ao vivo dos servidores da Palleira BR: jogadores online, bases construídas e taxas de cada mundo.",
};

export const revalidate = 60;

function uptimeLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default async function Servidores() {
  const data: (ServerCardData & { uptime: number | null })[] =
    await Promise.all(
      activeServers().map(async (server) => {
        const [metrics, rates] = await Promise.all([
          getMetrics(server).catch(() => null),
          getRates(server).catch(() => null),
        ]);
        return { server, metrics, rates, uptime: metrics?.uptime ?? null };
      }),
    );

  const totalOnline = data.reduce(
    (n, d) => n + (d.metrics?.currentplayernum ?? 0),
    0,
  );
  const totalBases = data.reduce((n, d) => n + (d.metrics?.basecampnum ?? 0), 0);

  return (
    <>
      <PageHeader
        kicker="Servidores"
        title="Status ao vivo"
        description="Direto da API do jogo, com cache de 1 minuto para não pesar nos servidores."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="Jogadores online" value={String(totalOnline)} />
          <Summary label="Bases no mundo" value={String(totalBases)} />
          <Summary label="Servidores" value={String(data.length)} />
          <Summary
            label="Maior uptime"
            value={
              data.some((d) => d.uptime)
                ? uptimeLabel(Math.max(...data.map((d) => d.uptime ?? 0)))
                : "—"
            }
          />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {data.map((d) => (
            <ServerCard
              key={d.server.slug}
              server={d.server}
              metrics={d.metrics}
              rates={d.rates}
            />
          ))}
        </div>

        <p className="mt-8 text-sm text-muted">
          Para entrar, busque por <strong className="text-text">Palleira</strong>{" "}
          na lista de servidores dedicados do jogo — passo a passo em{" "}
          <a href="/conectar" className="text-gold hover:text-gold-hi">
            Como jogar
          </a>
          .
        </p>
      </div>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3.5">
      <div className="text-[0.7rem] tracking-wide text-muted uppercase">
        {label}
      </div>
      <div className="tabular mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
