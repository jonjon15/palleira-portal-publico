import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { activeServers, SERVERS } from "@/lib/servers";
import { getPlayers, getGuilds } from "@/lib/palworld/paldefender";
import { getPlayers as getLivePlayers } from "@/lib/palworld/rest";
import { topPlayers } from "@/lib/db";

export const metadata: Metadata = {
  title: "Placar",
  description:
    "Ranking de jogadores e guilds da Palleira BR — todos os servidores, inclusive quem está offline.",
};

export const revalidate = 120;

const SERVER_NAME = Object.fromEntries(
  SERVERS.map((s) => [s.slug, s.shortName]),
);

const MEDAL = ["text-gold", "text-[#c9c9c9]", "text-[#c08457]"];

/** O mesmo UID aparece com e sem hífen dependendo da API. */
const normUid = (v: string) => v.replace(/-/g, "").toUpperCase();

interface GuildRow {
  id: string;
  server: string;
  name: string;
  level: number;
  leader: string;
  members: number;
  bases: number;
}

/**
 * Dados ao vivo dos três servidores, via PalDefender (§3.6).
 *
 * Substituiu o import do save como fonte do placar: aqui é agora, lá era
 * uma vez por dia. O save segue alimentando level e contagem de Pal, que
 * esta API não entrega.
 */
const loadLive = unstable_cache(
  async () => {
    const guilds: GuildRow[] = [];
    const online: { name: string; guild: string; server: string; level: number }[] = [];
    // uid → level de quem está conectado agora. A REST oficial devolve o
    // level ao vivo; o PalDefender não. Assim o placar mostra o número certo
    // para quem está jogando, em vez do valor do último save.
    const liveLevel = new Map<string, number>();
    let totalPlayers = 0;
    const failed: string[] = [];

    await Promise.all(
      activeServers().map(async (server) => {
        try {
          const [players, gs, live] = await Promise.all([
            getPlayers(server),
            getGuilds(server),
            // Falha aqui não pode derrubar o placar: se a REST oficial não
            // responder, o level do save continua servindo.
            getLivePlayers(server).catch(() => []),
          ]);

          for (const p of live) {
            liveLevel.set(normUid(p.playerId), p.level);
          }

          totalPlayers += players.length;
          for (const p of players) {
            if (!p.online) continue;
            online.push({
              name: p.name || "Jogador sem nome",
              guild: p.guildName,
              server: server.shortName,
              level: liveLevel.get(normUid(p.playerUid)) ?? 0,
            });
          }

          for (const g of gs) {
            if (g.memberCount === 0 && g.bases.length === 0) continue;
            guilds.push({
              id: g.id,
              server: server.shortName,
              name: g.name,
              level: g.level,
              leader: g.leaderName,
              members: g.memberCount,
              bases: g.bases.length,
            });
          }
        } catch {
          failed.push(server.shortName);
        }
      }),
    );

    guilds.sort(
      (a, b) => b.level - a.level || b.bases - a.bases || b.members - a.members,
    );
    online.sort((a, b) => b.level - a.level);
    return {
      guilds,
      online,
      totalPlayers,
      failed,
      liveLevel: Object.fromEntries(liveLevel),
    };
  },
  ["placar-live"],
  { revalidate: 120, tags: ["ranking"] },
);

export default async function Ranking() {
  const [live, players] = await Promise.all([
    loadLive(),
    topPlayers(25).catch(() => []),
  ]);

  const onlineNames = new Set(live.online.map((p) => p.name));

  return (
    <>
      <PageHeader
        kicker="Placar"
        title="Ranking da Palleira"
        description={`${live.totalPlayers} jogadores e ${live.guilds.length} guilds nos três mundos — inclusive quem está offline.`}
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* ------------------------------------------------ online agora */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight">No mundo agora</h2>
          {live.online.length === 0 ? (
            <Empty text="Ninguém online no momento. Bora abrir o servidor." />
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {live.online.map((p, i) => (
                <li
                  key={`${p.server}-${p.name}-${i}`}
                  className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-3 pl-2.5 text-sm"
                >
                  <span className="size-1.5 rounded-full bg-success" />
                  <span className="font-semibold">{p.name}</span>
                  {p.level > 0 && (
                    <span className="tabular text-gold">lv {p.level}</span>
                  )}
                  <span className="text-muted">{p.server}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* -------------------------------------------------- jogadores */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Jogadores</h2>
          <p className="mt-1 text-sm text-muted">
            Por level e Pals capturados. O save é lido de 2 em 2 horas; quem
            está online mostra o level do momento.
          </p>

          {players.length === 0 ? (
            <Empty text="O ranking aparece assim que o save for lido." />
          ) : (
            <Table
              head={["#", "Jogador", "Servidor", "Level", "Pals"]}
              align={["left", "left", "left", "right", "right"]}
            >
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
                    {live.liveLevel[normUid(p.palworld_uid)] ?? p.level}
                  </td>
                  <td className="tabular px-4 py-3 text-right">
                    {p.pal_count.toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </section>

        {/* ----------------------------------------------------- guilds */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Guilds</h2>
          <p className="mt-1 text-sm text-muted">
            Por level da guild. Ao vivo, atualizado a cada 2 minutos.
          </p>

          {live.guilds.length === 0 ? (
            <Empty text="Sem resposta dos servidores no momento." />
          ) : (
            <Table
              head={["#", "Guild", "Líder", "Servidor", "Level", "Membros", "Bases"]}
              align={["left", "left", "left", "left", "right", "right", "right"]}
            >
              {live.guilds.slice(0, 20).map((g, i) => (
                <tr
                  key={`${g.server}-${g.id}`}
                  className="border-b border-line/60 last:border-0 hover:bg-surface/60"
                >
                  <Rank i={i} />
                  <td className="px-4 py-3 font-semibold">{g.name}</td>
                  <td className="px-4 py-3 text-muted">{g.leader || "—"}</td>
                  <td className="px-4 py-3 text-muted">{g.server}</td>
                  <td className="tabular px-4 py-3 text-right font-semibold">
                    {g.level}
                  </td>
                  <td className="tabular px-4 py-3 text-right">{g.members}</td>
                  <td className="tabular px-4 py-3 text-right">{g.bases}</td>
                </tr>
              ))}
            </Table>
          )}

          {live.failed.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              Sem resposta de {live.failed.join(" e ")} — o placar mostra só os
              servidores que responderam.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function Rank({ i }: { i: number }) {
  return (
    <td className={`tabular px-4 py-3 font-bold ${MEDAL[i] ?? "text-muted"}`}>
      {i + 1}
    </td>
  );
}

function Table({
  head,
  align,
  children,
}: {
  head: string[];
  align: ("left" | "right")[];
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-line">
      <table className="w-full min-w-lg text-sm">
        <thead>
          <tr className="border-b border-line bg-surface">
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-4 py-3 font-semibold text-muted ${
                  align[i] === "right" ? "text-right" : "text-left"
                } ${i === 0 ? "w-14" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-line-strong p-6 text-center text-sm text-muted">
      {text}
    </div>
  );
}
