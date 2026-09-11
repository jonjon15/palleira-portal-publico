import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { serverBySlug } from "@/lib/servers";
import { normalizarUid } from "@/lib/palworld/uid";
import { getPlayers, getGuilds } from "@/lib/palworld/paldefender";
import { getPlayers as getLivePlayers } from "@/lib/palworld/rest";
import { topPlayers } from "@/lib/db";

const SLUG = "pvp-free";

export const metadata: Metadata = {
  title: "Placar — Dominantes",
  description:
    "Ranking de jogadores e guilds do Dominantes — quem tem mais level e mais Pals, inclusive offline.",
};

export const revalidate = 120;

const MEDAL = ["text-gold", "text-[#c9c9c9]", "text-[#c08457]"];

/** Conta de staff no ranking, não jogador — mesmo critério de `topPlayers`. */
const ehAdmin = (nome: string) => /adm/i.test(nome);

interface GuildRow {
  id: string;
  name: string;
  level: number;
  leader: string;
  members: number;
  bases: number;
}

/**
 * Mesmo esquema da página geral de ranking (`app/ranking/page.tsx`), só que
 * fixo no Dominantes — pedido do dono em 11/09/2026, para acompanhar o
 * servidor novo (RCON ligado, mercado com trava própria) sem misturar com
 * PVE Free/VIP.
 */
const loadLive = unstable_cache(
  async () => {
    const server = serverBySlug(SLUG);
    if (!server) return { guilds: [] as GuildRow[], online: [], totalOnline: 0, ok: false };

    const online: { name: string; guild: string; level: number }[] = [];
    const liveLevel = new Map<string, number>();
    let guilds: GuildRow[] = [];
    let ok = true;

    try {
      const [players, gs, live] = await Promise.all([
        getPlayers(server),
        getGuilds(server),
        getLivePlayers(server).catch(() => []),
      ]);

      for (const p of live) liveLevel.set(p.playerId, p.level);

      for (const p of players) {
        if (!p.online || ehAdmin(p.name)) continue;
        online.push({
          name: p.name || "Jogador sem nome",
          guild: p.guildName,
          level: liveLevel.get(p.playerUid) ?? 0,
        });
      }

      guilds = gs
        .filter((g) => g.memberCount > 0 || g.bases.length > 0)
        .map((g) => ({
          id: g.id,
          name: g.name,
          level: g.level,
          leader: g.leaderName,
          members: g.memberCount,
          bases: g.bases.length,
        }))
        .sort((a, b) => b.level - a.level || b.bases - a.bases || b.members - a.members);
    } catch {
      ok = false;
    }

    online.sort((a, b) => b.level - a.level);
    return {
      guilds,
      online,
      totalOnline: online.length,
      ok,
      liveLevel: Object.fromEntries(liveLevel),
    };
  },
  ["placar-dominantes-live"],
  { revalidate: 120, tags: ["ranking", "ranking-dominantes"] },
);

export default async function RankingDominantes() {
  const server = serverBySlug(SLUG);
  const [live, players] = await Promise.all([
    loadLive(),
    topPlayers(25, SLUG).catch(() => []),
  ]);

  const onlineNames = new Set(live.online.map((p) => p.name));

  return (
    <>
      <PageHeader
        kicker="Placar"
        title={`Ranking do ${server?.shortName ?? "Dominantes"}`}
        description="Só este servidor — quem tem mais level e mais Pals capturados, inclusive quem está offline agora."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* ------------------------------------------------ online agora */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight">No mundo agora</h2>
          {live.online.length === 0 ? (
            <Empty
              text={
                live.ok
                  ? "Ninguém online no momento."
                  : "Sem resposta do servidor agora — tente recarregar em instantes."
              }
            />
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {live.online.map((p, i) => (
                <li
                  key={`${p.name}-${i}`}
                  className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-3 pl-2.5 text-sm"
                >
                  <span className="size-1.5 rounded-full bg-success" />
                  <span className="font-semibold">{p.name}</span>
                  {p.level > 0 && (
                    <span className="tabular text-gold">lv {p.level}</span>
                  )}
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
            <Table head={["#", "Jogador", "Level", "Pals"]} align={["left", "left", "right", "right"]}>
              {players.map((p, i) => (
                <tr
                  key={p.palworld_uid}
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
                  <td className="tabular px-4 py-3 text-right font-semibold">
                    {live.liveLevel?.[normalizarUid(p.palworld_uid)] ?? p.level}
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
            <Empty text="Sem resposta do servidor no momento." />
          ) : (
            <Table
              head={["#", "Guild", "Líder", "Level", "Membros", "Bases"]}
              align={["left", "left", "left", "right", "right", "right"]}
            >
              {live.guilds.slice(0, 20).map((g, i) => (
                <tr
                  key={g.id}
                  className="border-b border-line/60 last:border-0 hover:bg-surface/60"
                >
                  <Rank i={i} />
                  <td className="px-4 py-3 font-semibold">{g.name}</td>
                  <td className="px-4 py-3 text-muted">{g.leader || "—"}</td>
                  <td className="tabular px-4 py-3 text-right font-semibold">
                    {g.level}
                  </td>
                  <td className="tabular px-4 py-3 text-right">{g.members}</td>
                  <td className="tabular px-4 py-3 text-right">{g.bases}</td>
                </tr>
              ))}
            </Table>
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
