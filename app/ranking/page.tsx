import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { TabelaJogadores } from "@/components/tabela-jogadores";
import { activeServers, SERVERS } from "@/lib/servers";
import { normalizarUid } from "@/lib/palworld/uid";
import { getPlayers, getGuilds, poderDaPalbox } from "@/lib/palworld/paldefender";
import { getPlayers as getLivePlayers } from "@/lib/palworld/rest";
import { topPlayers, guardarPoder } from "@/lib/db";

export const metadata: Metadata = {
  title: "Ranking",
  description:
    "Ranking de jogadores e guilds da Palleira BR — todos os servidores, inclusive quem está offline.",
};

export const revalidate = 120;

const SERVER_NAME = Object.fromEntries(
  SERVERS.map((s) => [s.slug, s.shortName]),
);

const MEDAL = ["text-gold", "text-[#c9c9c9]", "text-[#c08457]"];

/** Conta de staff no ranking, não jogador — mesmo critério de `topPlayers`. */
const ehAdmin = (nome: string) => /adm/i.test(nome);

/**
 * A chave dos mapas de dados ao vivo: o servidor JUNTO do UID.
 *
 * 🔴 Nunca o UID sozinho. Ele identifica a conta, não o personagem naquele
 * mundo (`lib/palworld/uid.ts`), e esta página junta os três servidores no
 * mesmo mapa — sem o slug, a leitura de um mundo vaza para a linha do
 * outro.
 */
const chaveViva = (slug: string, uid: string) =>
  `${slug}:${normalizarUid(uid)}`;

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
    // 🔴 A chave destes três mapas é `slug:uid`, NUNCA o uid sozinho.
    //
    // O UID é da conta, não do mundo (ver `lib/palworld/uid.ts`): a mesma
    // pessoa tem o mesmo UID nos três servidores, com personagem, level e
    // palbox diferentes em cada um. Com o uid puro, o último servidor lido
    // sobrescrevia os outros e as duas linhas da mesma pessoa apareciam com
    // números idênticos — a Mari saiu com o mesmo poder no PVE Free e no
    // PVE VIP em 13/09/2026, que foi como isto apareceu.
    //
    // A gravação já se protegia disso (ver o `guardarPoder` mais abaixo); a
    // leitura é que tinha ficado sem a mesma trava.

    // level de quem está conectado agora. A REST oficial devolve o level ao
    // vivo; o PalDefender não. Assim o placar mostra o número certo para
    // quem está jogando, em vez do valor do último save.
    const liveLevel = new Map<string, number>();
    // quantos Pals tem agora. Só de quem está conectado: a palbox vive na
    // memória do servidor, e para quem está offline não há resposta.
    const livePals = new Map<string, number>();
    // Poder da palbox de quem está online: soma de HP, de level e de IV.
    const livePoder = new Map<
      string,
      { hp: number; level: number; ivs: number; shiny: number }
    >();
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
            liveLevel.set(chaveViva(server.slug, p.playerId), p.level);
          }

          totalPlayers += players.length;
          const conectados = players.filter((p) => p.online && !ehAdmin(p.name));
          for (const p of conectados) {
            online.push({
              name: p.name || "Jogador sem nome",
              guild: p.guildName,
              server: server.shortName,
              level: liveLevel.get(chaveViva(server.slug, p.playerUid)) ?? 0,
            });
          }

          // Uma chamada por jogador conectado. Falha individual não derruba
          // o placar — quem falhar fica com o número do último save.
          await Promise.all(
            conectados.map(async (p) => {
              try {
                // A mesma resposta dá a contagem e o poder da palbox.
                const poder = await poderDaPalbox(server, p.playerUid);
                livePals.set(chaveViva(server.slug, p.playerUid), poder.pals);
                livePoder.set(chaveViva(server.slug, p.playerUid), {
                  hp: poder.hp,
                  level: poder.level,
                  ivs: poder.ivs,
                  shiny: poder.shiny,
                });
              } catch {
                // sem número ao vivo para este
              }
            }),
          );

          // Guarda o poder lido, senão sumiria quando a pessoa
          // desconectasse — a palbox só existe na memória do servidor.
          //
          // 🔴 Só os UIDs DESTE servidor: `livePoder` é compartilhado pelos
          // três, e gravar o mapa inteiro carimbaria o poder de alguém no
          // slug errado (a mesma conta joga nos três mundos, com palbox
          // diferente em cada um).
          await guardarPoder(
            server.slug,
            conectados
              .map((p) => {
                const v = livePoder.get(chaveViva(server.slug, p.playerUid));
                return v ? { uid: p.playerUid, ...v } : null;
              })
              .filter((v) => v !== null),
          ).catch(() => {});

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
      livePals: Object.fromEntries(livePals),
      livePoder: Object.fromEntries(livePoder),
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

  // Mesma lógica do ranking do Dominantes: quem está jogando entra com os
  // números do momento, quem está offline com os do último import do save.
  const classificados = players
    .map((p) => {
      // A mesma chave da gravação: o personagem daquele mundo, não a conta.
      const uid = chaveViva(p.server_slug, p.palworld_uid);
      const poder = live.livePoder?.[uid];
      return {
        ...p,
        level: live.liveLevel[uid] ?? p.level,
        pal_count: live.livePals[uid] ?? p.pal_count,
        // Quem está no jogo entra com o número do momento; quem não está,
        // com o último que foi visto (migração 017).
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
        title="Ranking da Palleira"
        description={`${live.totalPlayers} jogadores e ${live.guilds.length} guilds nos três mundos — inclusive quem está offline.`}
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <Link
          href="/ranking/dominantes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:text-gold-hi"
        >
          Ver só o ranking do Dominantes →
        </Link>

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

          {classificados.length === 0 ? (
            <Empty text="O ranking aparece assim que o save for lido." />
          ) : (
            <TabelaJogadores
              mostrarServidor
              linhas={classificados.map((p) => ({
                chave: `${p.server_slug}-${p.palworld_uid}`,
                nome: p.name,
                online: onlineNames.has(p.name),
                servidor: SERVER_NAME[p.server_slug] ?? p.server_slug,
                level: p.level,
                pals: p.pal_count,
                poderHp: p.poderHp,
                poderLevel: p.poderLevel,
                poderIvs: p.poderIvs,
                poderShiny: p.poderShiny,
                poderAoVivo: p.poderAoVivo,
                poderEm: p.poderEm,
              }))}
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
