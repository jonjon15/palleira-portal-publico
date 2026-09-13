import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { TabelaJogadores } from "@/components/tabela-jogadores";
import { serverBySlug } from "@/lib/servers";
import { normalizarUid } from "@/lib/palworld/uid";
import { getPlayers, getGuilds, poderDaPalbox } from "@/lib/palworld/paldefender";
import { getPlayers as getLivePlayers } from "@/lib/palworld/rest";
import { topPlayers, guardarPoder } from "@/lib/db";
import { racasRegistradas } from "@/lib/racas-do-discord";
import { NOME_DO_ELEMENTO } from "@/lib/racas";

const SLUG = "pvp-free";

export const metadata: Metadata = {
  title: "Ranking — Dominantes",
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
    const livePals = new Map<string, number>();
    // Poder da palbox de quem está online: soma de HP, de level e de IV.
    const livePoder = new Map<
      string,
      { hp: number; level: number; ivs: number; shiny: number }
    >();
    let guilds: GuildRow[] = [];
    let ok = true;

    try {
      const [players, gs, live] = await Promise.all([
        getPlayers(server),
        getGuilds(server),
        getLivePlayers(server).catch(() => []),
      ]);

      for (const p of live) liveLevel.set(p.playerId, p.level);

      const conectados = players.filter((p) => p.online && !ehAdmin(p.name));

      for (const p of conectados) {
        online.push({
          name: p.name || "Jogador sem nome",
          guild: p.guildName,
          level: liveLevel.get(p.playerUid) ?? 0,
        });
      }

      // Uma chamada por jogador conectado — a mesma resposta dá a contagem
      // de Pals e o poder da palbox, então não custa nada a mais do que a
      // contagem sozinha custava antes. Só responde para quem está no jogo;
      // quem está offline mantém o número do último import do save (§3.8),
      // que roda de 2 em 2 horas. Falha individual não derruba o placar.
      await Promise.all(
        conectados.map(async (p) => {
          try {
            const poder = await poderDaPalbox(server, p.playerUid);
            livePals.set(p.playerUid, poder.pals);
            livePoder.set(p.playerUid, {
              hp: poder.hp,
              level: poder.level,
              ivs: poder.ivs,
              shiny: poder.shiny,
            });
          } catch {
            // sem número ao vivo para este: fica o valor do save
          }
        }),
      );

      // O poder lido agora fica guardado, senão sumiria quando a pessoa
      // desconectasse — a palbox só existe na memória do servidor. É o que
      // permite a tabela mostrar número para quem está offline.
      await guardarPoder(
        SLUG,
        [...livePoder].map(([uid, v]) => ({ uid, ...v })),
      ).catch(() => {});

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
      livePals: Object.fromEntries(livePals),
      livePoder: Object.fromEntries(livePoder),
    };
  },
  ["placar-dominantes-live"],
  { revalidate: 120, tags: ["ranking", "ranking-dominantes"] },
);

export default async function RankingDominantes() {
  const server = serverBySlug(SLUG);
  const [live, players, racas] = await Promise.all([
    loadLive(),
    topPlayers(25, SLUG).catch(() => []),
    // O selo de raça é enfeite útil, não conteúdo essencial: se o Discord
    // não responder, o placar sai igual ao que era, sem selo nenhum.
    racasRegistradas(),
  ]);

  const onlineNames = new Set(live.online.map((p) => p.name));

  // Quem está jogando agora entra com os números do momento; quem está
  // offline fica com os do último import do save. A reordenação acontece
  // aqui, e não no `topPlayers`, porque só neste ponto os dois lados se
  // encontram — sem isso alguém que subiu de level aparecia com o número
  // novo na linha errada da tabela.
  const classificados = players
    .map((p) => {
      const uid = normalizarUid(p.palworld_uid);
      const poder = live.livePoder?.[uid];
      return {
        ...p,
        level: live.liveLevel?.[uid] ?? p.level,
        pal_count: live.livePals?.[uid] ?? p.pal_count,
        // Quem está no jogo entra com o número do momento; quem não está,
        // com o último que foi visto (migração 017). Só fica sem nada quem
        // nunca esteve online desde que isto passou a ser guardado.
        // `Number()` porque `poder_hp` é bigint e o driver entrega string:
        // sem isto o placar mostrava "134644" em vez de "134.644".
        poderHp: poder?.hp ?? (p.poder_hp === null ? null : Number(p.poder_hp)),
        poderLevel: poder?.level ?? p.poder_level,
        poderIvs: poder?.ivs ?? p.poder_ivs,
        poderShiny: poder?.shiny ?? p.poder_shiny,
        poderAoVivo: Boolean(poder),
        poderEm: p.poder_em,
      };
    })
    .sort((a, b) => b.level - a.level || b.pal_count - a.pal_count);

  return (
    <>
      <PageHeader
        kicker="Ranking"
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
            Quem está online aparece com o level e os Pals do momento,
            atualizados a cada 2 minutos. Para quem está offline, os números
            são os do último save — lido de 2 em 2 horas.
          </p>
          <p className="mt-1 text-sm text-muted">
            <b className="text-gold">Poder</b> é a soma do HP de toda a
            palbox: já embute level, IV de vida e condensação. Ao lado, a
            soma dos levels e a soma dos IVs de cada Pal, e quantos deles são{" "}
            <b className="text-gold">✨ shiny</b>. Em dourado, o número de quem
            está no jogo agora; em cinza, o último que foi visto — a palbox só
            pode ser lida com a pessoa conectada.{" "}
            <b className="text-text">Clique em qualquer cabeçalho</b> para
            ordenar por ele.
          </p>
          <p className="mt-1 text-sm text-muted">
            A <b className="text-text">raça</b> ao lado do nome vem do registro
            no Discord, com o ícone do elemento primário e do secundário. Só
            aparece para quem vinculou o personagem no site — é o vínculo que
            diz de quem é aquele personagem no jogo.
          </p>

          {classificados.length === 0 ? (
            <Empty text="O ranking aparece assim que o save for lido." />
          ) : (
            <TabelaJogadores
              mostrarElementos
              linhas={classificados.map((p) => {
                // Personagem → conta do Discord → registro no fórum. Some
                // qualquer elo e a linha simplesmente não ganha selo.
                const reg = p.discord_id ? racas.get(p.discord_id) : undefined;
                return {
                chave: p.palworld_uid,
                nome: p.name,
                online: onlineNames.has(p.name),
                raca: reg?.raca
                  ? {
                      nome: reg.raca.nome,
                      cor: reg.raca.cor,
                      elemento: reg.raca.elemento,
                    }
                  : null,
                secundario: reg?.secundario
                  ? {
                      chave: reg.secundario,
                      nome: NOME_DO_ELEMENTO[reg.secundario],
                    }
                  : null,
                level: p.level,
                pals: p.pal_count,
                poderHp: p.poderHp,
                poderLevel: p.poderLevel,
                poderIvs: p.poderIvs,
                poderShiny: p.poderShiny,
                poderAoVivo: p.poderAoVivo,
                poderEm: p.poderEm,
                };
              })}
            />
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
