import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { activeServers } from "@/lib/servers";
import { getWorldSnapshot, type SafePlayer } from "@/lib/palworld/rest";

export const metadata: Metadata = {
  title: "Ranking",
  description:
    "As guilds da Palleira BR por bases e Pals, e quem está online agora — lido ao vivo dos servidores.",
};

// O snapshot cru pesa quase 1 MB somando os dois servidores, então ele não vai
// para a Data Cache do Next (estoura o limite e o cache falha em silêncio).
// Quem é cacheado é o resultado reduzido: umas 20 linhas.
export const revalidate = 300;

interface GuildRow {
  name: string;
  server: string;
  bases: number;
  pals: number;
}

interface OnlineRow extends SafePlayer {
  server: string;
}

const PLATFORM: Record<string, string> = {
  steam: "Steam",
  gdk: "Xbox",
  ps5: "PS5",
  mac: "Mac",
};

async function fetchRanking(): Promise<{
  guilds: GuildRow[];
  online: OnlineRow[];
  failed: string[];
}> {
  const guilds: GuildRow[] = [];
  const online: OnlineRow[] = [];
  const failed: string[] = [];

  await Promise.all(
    activeServers().map(async (server) => {
      try {
        const snap = await getWorldSnapshot(server);
        for (const g of snap.guilds) {
          guilds.push({
            name: g.name,
            server: server.shortName,
            bases: g.bases,
            pals: g.pals,
          });
        }
        for (const p of snap.players) {
          online.push({ ...p, server: server.shortName });
        }
      } catch {
        failed.push(server.shortName);
      }
    }),
  );

  guilds.sort((a, b) => b.pals - a.pals || b.bases - a.bases);
  online.sort((a, b) => b.level - a.level);
  return { guilds, online, failed };
}

const loadRanking = unstable_cache(fetchRanking, ["ranking"], {
  revalidate: 300,
  tags: ["ranking"],
});

const MEDAL = ["text-gold", "text-[#c9c9c9]", "text-[#c08457]"];

export default async function Ranking() {
  const { guilds, online, failed } = await loadRanking();

  return (
    <>
      <PageHeader
        kicker="Ranking"
        title="Placar da Palleira"
        description="Quem construiu mais, botou mais Pal para trabalhar, e quem está no mundo agora."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <section>
          <h2 className="text-2xl font-bold tracking-tight">Guilds</h2>
          <p className="mt-1 text-sm text-muted">
            Ordenado por Pals trabalhando nas bases. Atualiza a cada 5 minutos.
          </p>

          {guilds.length === 0 ? (
            <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-line-strong p-8 text-center">
              <p className="font-semibold">Placar indisponível agora</p>
              <p className="mt-1.5 text-sm text-muted">
                Não consegui falar com os servidores. Assim que responderem, o
                placar volta sozinho.
              </p>
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-line">
              <table className="w-full min-w-lg text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    <th className="w-14 px-4 py-3 text-left font-semibold text-muted">
                      #
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Guild
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Servidor
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted">
                      Bases
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted">
                      Pals
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {guilds.map((row, i) => (
                    <tr
                      key={`${row.server}-${row.name}-${i}`}
                      className="border-b border-line/60 last:border-0 hover:bg-surface/60"
                    >
                      <td
                        className={`tabular px-4 py-3 font-bold ${MEDAL[i] ?? "text-muted"}`}
                      >
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 font-semibold">{row.name}</td>
                      <td className="px-4 py-3 text-muted">{row.server}</td>
                      <td className="tabular px-4 py-3 text-right">
                        {row.bases}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-semibold">
                        {row.pals}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {failed.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              Sem dados de {failed.join(" e ")} no momento — o placar mostra só
              os servidores que responderam.
            </p>
          )}
        </section>

        {/* A API do jogo só enxerga quem está conectado. Ranking de jogador
            com level, horas e evolução exige histórico — vem com o banco. */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Jogadores online</h2>
          <p className="mt-1 text-sm text-muted">
            Por level, atualizado junto com o placar. Só quem está conectado
            agora — o ranking completo, com quem está offline, vem depois.
          </p>

          {online.length === 0 ? (
            <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-line-strong p-6 text-center text-sm text-muted">
              Ninguém online no momento. Bora abrir o servidor.
            </div>
          ) : (
            <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {online.map((p) => (
                <li
                  key={`${p.server}-${p.playerId}`}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3"
                >
                  <span
                    className="tabular flex size-11 shrink-0 flex-col items-center justify-center rounded-[var(--radius-control)] bg-gold/10 leading-none text-gold"
                    title={`Level ${p.level}`}
                  >
                    <span className="text-[0.6rem] tracking-wide">LV</span>
                    <span className="text-base font-bold">{p.level}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {p.name || "Jogador sem nome"}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {p.guild ?? "Sem guild"} · {p.server}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-[0.7rem] text-muted uppercase">
                    {PLATFORM[p.platform] ?? p.platform}
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
