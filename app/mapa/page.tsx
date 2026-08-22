import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { mappableServers, SERVERS } from "@/lib/servers";
import { getGuilds, getPlayers } from "@/lib/palworld/paldefender";
import {
  MapaInterativo,
  type BaseNoMapa,
  type JogadorNoMapa,
} from "@/components/mapa-interativo";
import { MAPAS, mapaDe } from "@/lib/mapas";

export const metadata: Metadata = {
  title: "Mapa",
  description:
    "Onde a comunidade da Palleira construiu: bases das guilds e quem está no mundo agora.",
};

export const revalidate = 120;

/**
 * ⚠️ O eixo Y do `map_pos` do PalDefender vem INVERTIDO em relação ao que o
 * jogo mostra. Confirmado comparando o mesmo jogador nas duas fontes:
 * o jogo exibia `-430, -169` e a API devolvia `(-430, +169)`.
 *
 * Sem isso o mapa inteiro sai espelhado na vertical.
 */
const gameY = (mapY: number) => -mapY;



const loadMap = unstable_cache(
  async () => {
    const bases: BaseNoMapa[] = [];
    const players: JogadorNoMapa[] = [];
    const failed: string[] = [];

    // ⚠️ mappableServers(), não activeServers(): o PvP fica de fora de
    // propósito — posição de jogador e de base ali vira alvo de raide.
    await Promise.all(
      mappableServers().map(async (server) => {
        try {
          const [gs, ps] = await Promise.all([
            getGuilds(server),
            getPlayers(server),
          ]);

          for (const g of gs) {
            for (const b of g.bases) {
              // Não filtrar por altitude: não dá para construir na Árvore
              // Mundial, então base em z alto é ilha flutuante de Palpagos
              // mesmo — e precisa aparecer.
              bases.push({
                x: b.mapX,
                y: gameY(b.mapY),
                // A altitude é o que diz em qual mundo a base está: sem
                // isto, base da Árvore Mundial cai em cima de Palpagos.
                mapa: mapaDe(b.worldZ),
                guilda: g.name,
                nivel: g.level,
                lider: g.leaderName,
                membros: g.memberCount,
                servidor: server.shortName,
              });
            }
          }

          for (const p of ps) {
            if (!p.online) continue;
            players.push({
              x: p.mapX,
              y: gameY(p.mapY),
              // ⚠️ `/players` do PalDefender não devolve altitude, então não
              // dá para saber em qual mundo a pessoa está. Fica em Palpagos,
              // que é onde quase todo mundo joga.
              mapa: "palpagos" as const,
              nome: p.name || "Jogador",
              guilda: p.guildName,
              servidor: server.shortName,
            });
          }
        } catch {
          failed.push(server.shortName);
        }
      }),
    );

    return { bases, players, failed };
  },
  ["mapa"],
  { revalidate: 120, tags: ["mapa"] },
);

export default async function Mapa() {
  const { bases, players, failed } = await loadMap();
  const hidden = SERVERS.filter((s) => s.enabled && !s.mapVisible);

  return (
    <>
      <PageHeader
        kicker="Mapa"
        title="Onde a Palleira construiu"
        description={`${bases.length} bases espalhadas pelo mundo, e quem está jogando agora.`}
      />

      <div className="mx-auto max-w-[110rem] px-3 pt-4 pb-10">
        <MapaInterativo
          bases={bases}
          jogadores={players}
          servidores={mappableServers().map((s) => s.shortName)}
          mapas={MAPAS}
        />

        {hidden.length > 0 && (
          <div className="mx-auto mt-6 max-w-3xl rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="font-semibold">
              Por que {hidden.map((s) => s.shortName).join(" e ")} não aparece
              aqui
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              É PvP. Mostrar onde cada um está e onde ficam as bases seria
              entregar alvo de raide de graça. O servidor aparece no placar e
              nas estatísticas, mas nunca no mapa.
            </p>
          </div>
        )}

        {failed.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Sem resposta de {failed.join(" e ")} no momento.
          </p>
        )}
      </div>
    </>
  );
}
