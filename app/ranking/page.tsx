import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { activeServers, SERVERS } from "@/lib/servers";
import { getWorldSnapshot, type SafePlayer } from "@/lib/palworld/rest";
import { topGuilds, topPlayers, lastImport } from "@/lib/db";

export const metadata: Metadata = {
  title: "Placar",
  description:
    "Ranking de jogadores e guilds da Palleira BR — todo mundo, inclusive quem está offline.",
};

export const revalidate = 300;

const SERVER_NAME = Object.fromEntries(SERVERS.map((s) => [s.slug, s.shortName]));

const PLATFORM: Record<string, string> = {
  steam: "Steam",
  gdk: "Xbox",
  ps5: "PS5",
  mac: "Mac",
};

const MEDAL = ["text-gold", "text-[#c9c9c9]", "text-[#c08457]"];

/** Quem está online agora — só a API do jogo sabe disso. */
const loadOnline = unstable_cache(
  async () => {
    const online: (SafePlayer & { server: string })[] = [];
    await Promise.all(
      activeServers().map(async (server) => {
        try {
          const snap = await getWorldSnapshot(server);
          for (const p of snap.players) {
            online.push({ ...p, server: server.shortName });
          }
        } catch {
          // servidor sem resposta: o resto da página continua de pé
        }
      }),
    );
    online.sort((a, b) => b.level - a.level);
    return online;
  },
  ["online"],
  { revalidate: 300, tags: ["ranking"] },
);

function Rank({ i }: { i: number }) {
  return (
    <td className={`tabular px-4 py-3 font-bold ${MEDAL[i] ?? "text-muted"}`}>
      {i + 1}
    </td>
  );
}

export default async function Ranking() {
  const [players, guilds, imported, online] = await Promise.all([
    topPlayers(25).catch(() => []),
    topGuilds(15).catch(() => []),
    lastImport().catch(() => null),
    loadOnline(),
  ]);

  const onlineNames = new Set(online.map((p) => p.name));

  return (
    <>
      <PageHeader
        kicker="Placar"
        title="Ranking da Palleira"
        description="Todo mundo que já jogou nos servidores — não só quem está online agora."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* ---------------------------------------------------- jogadores */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Jogadores</h2>
              <p className="mt-1 text-sm text-muted">
                Por level, depois por Pals capturados. Quem está online agora
                aparece marcado.
              </p>
            </div>
            {imported && (
              <p className="text-xs text-muted">
                Save lido em{" "}
                {new Date(imported.created_at).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "America/Sao_Paulo",
                })}
              </p>
            )}
          </div>

          {players.length === 0 ? (
            <Empty text="O ranking aparece assim que o save for lido pela primeira vez." />
          ) : (
            <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-line">
              <table className="w-full min-w-lg text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    <Th className="w-14">#</Th>
                    <Th>Jogador</Th>
                    <Th>Servidor</Th>
                    <Th align="right">Level</Th>
                    <Th align="right">Pals</Th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr
                      key={`${p.server_slug}-${p.palworld_uid}`}
                      className="border-b border-line/60 last:border-0 hover:bg-surface/60"
                    >
                      <Rank i={i} />
                      <td className="px-4 py-3 font-semibold">
                        {p.name}
                        {onlineNames.has(p.name) && (
                          <span
                            className="ml-2 inline-block size-1.5 rounded-full bg-success align-middle"
                            title="Online agora"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {SERVER_NAME[p.server_slug] ?? p.server_slug}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-semibold">
                        {p.level}
                      </td>
                      <td className="tabular px-4 py-3 text-right">
                        {p.pal_count.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* -------------------------------------------------------- guilds */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Guilds</h2>
          <p className="mt-1 text-sm text-muted">
            Por Pals trabalhando nas bases.
          </p>

          {guilds.length === 0 ? (
            <Empty text="O placar de guilds aparece junto com o primeiro import." />
          ) : (
            <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-line">
              <table className="w-full min-w-lg text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    <Th className="w-14">#</Th>
                    <Th>Guild</Th>
                    <Th>Servidor</Th>
                    <Th align="right">Membros</Th>
                    <Th align="right">Bases</Th>
                    <Th align="right">Pals</Th>
                  </tr>
                </thead>
                <tbody>
                  {guilds.map((g, i) => (
                    <tr
                      key={`${g.server_slug}-${g.guild_id}`}
                      className="border-b border-line/60 last:border-0 hover:bg-surface/60"
                    >
                      <Rank i={i} />
                      <td className="px-4 py-3 font-semibold">{g.name}</td>
                      <td className="px-4 py-3 text-muted">
                        {SERVER_NAME[g.server_slug] ?? g.server_slug}
                      </td>
                      <td className="tabular px-4 py-3 text-right">
                        {g.member_count}
                      </td>
                      <td className="tabular px-4 py-3 text-right">
                        {g.base_count}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-semibold">
                        {g.pal_count.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* -------------------------------------------------- online agora */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">No mundo agora</h2>
          <p className="mt-1 text-sm text-muted">
            Direto da API do jogo, atualizado a cada 5 minutos.
          </p>

          {online.length === 0 ? (
            <Empty text="Ninguém online no momento. Bora abrir o servidor." />
          ) : (
            <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {online.map((p) => (
                <li
                  key={`${p.server}-${p.playerId}`}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3"
                >
                  <span className="tabular flex size-11 shrink-0 flex-col items-center justify-center rounded-[var(--radius-control)] bg-gold/10 leading-none text-gold">
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

function Th({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 font-semibold text-muted ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </th>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-line-strong p-6 text-center text-sm text-muted">
      {text}
    </div>
  );
}
