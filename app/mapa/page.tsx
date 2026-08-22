import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { mappableServers, SERVERS } from "@/lib/servers";
import { getGuilds, getPlayers } from "@/lib/palworld/paldefender";
import {
  MapaInterativo,
  type BaseNoMapa,
  type JogadorNoMapa,
  type ViagemRapida,
} from "@/components/mapa-interativo";
import { MAPAS } from "@/lib/mapas";
import viagensRapidas from "@/lib/viagem-rapida.json";
import { localizar } from "@/lib/palworld/coordenadas";
import { auth } from "@/auth";
import { meuVinculo } from "@/lib/linking";

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
    // Guarda os membros da guild junto: é com eles que se descobre, depois,
    // qual base é de quem está olhando. Fica DENTRO do cache porque não
    // depende de quem pediu a página.
    const bases: (BaseNoMapa & { uids: string[] })[] = [];
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
                // Sempre Palpagos: não se constrói na Árvore Mundial. Base
                // com altitude altíssima é ilha flutuante ou pico, não outro
                // mundo — ver o aviso em lib/mapas.ts.
                mapa: "palpagos" as const,
                guilda: g.name,
                nivel: g.level,
                lider: g.leaderName,
                membros: g.memberCount,
                servidor: server.shortName,
                uids: g.members,
                minha: false,
              });
            }
          }

          for (const p of ps) {
            if (!p.online) continue;

            // O `MapLocation` do PalDefender já vem convertido pela fórmula
            // de Palpagos, então quem estiver na Árvore Mundial chegaria com
            // coordenada errada. Reconverter a partir da posição crua é o que
            // põe a pessoa no mundo certo.
            const onde = localizar(p.worldX, p.worldY);

            players.push({
              x: onde.x,
              y: gameY(onde.y),
              mapa: onde.mundo,
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
  const { bases: brutas, players, failed } = await loadMap();

  /*
   * Marcar a base de quem está olhando.
   *
   * Feito FORA do `unstable_cache` de propósito: o cache é compartilhado por
   * todo mundo, e enfiar identidade nele serviria a base de uma pessoa para
   * as outras.
   *
   * Os UIDs dos membros ficam no servidor — o navegador recebe só um
   * booleano. Não há motivo para mandar a lista de quem é de qual guild para
   * a máquina de cada visitante.
   */
  const session = await auth();
  const vinculo = session?.user?.discordId
    ? await meuVinculo(session.user.discordId).catch(() => null)
    : null;

  const bases = brutas.map(({ uids, ...b }) => ({
    ...b,
    minha: Boolean(vinculo && uids.includes(vinculo.uid)),
  }));
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
          viagens={viagensRapidas as ViagemRapida[]}
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
