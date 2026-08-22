import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { mappableServers, SERVERS } from "@/lib/servers";
import { getGuilds, getPlayers } from "@/lib/palworld/paldefender";

export const metadata: Metadata = {
  title: "Mapa",
  description:
    "Onde a comunidade da Palleira construiu: bases das guilds e quem está no mundo agora.",
};

export const revalidate = 120;

/**
 * Limites do mapa em coordenada de jogo.
 *
 * Medidos das 158 bases reais dos dois PvE (x de -1357 a 948, y de -1565 a
 * 426) e arredondados com folga, para o enquadramento não pular quando
 * alguém construir num canto novo.
 */
const BOUNDS = { minX: -1929, maxX: 1229, minY: -1031, maxY: 2127 };
const W = BOUNDS.maxX - BOUNDS.minX;
const H = BOUNDS.maxY - BOUNDS.minY;

/**
 * 🎯 CALIBRAÇÃO DO MAPA — mexer só aqui.
 *
 * Qual retângulo em coordenada de jogo a imagem de fundo cobre. É a única
 * coisa que precisa de ajuste fino: se os losangos caírem deslocados em
 * relação ao terreno, é este retângulo que está errado.
 *
 * Como afinar: escolha uma base conhecida, veja onde ela cai no mapa e
 * empurre estes números na direção contrária à diferença.
 */
const IMAGE_BOUNDS = { minX: -1929, maxX: 1229, minY: -1031, maxY: 2127 };

/**
 * ⚠️ O eixo Y do `map_pos` do PalDefender vem INVERTIDO em relação ao que o
 * jogo mostra. Confirmado comparando o mesmo jogador nas duas fontes:
 * o jogo exibia `-430, -169` e a API devolvia `(-430, +169)`.
 *
 * Sem isso o mapa inteiro sai espelhado na vertical.
 */
const gameY = (mapY: number) => -mapY;

interface Marker {
  x: number;
  y: number;
  label: string;
  server: string;
}

const loadMap = unstable_cache(
  async () => {
    const bases: Marker[] = [];
    const players: Marker[] = [];
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
                label: g.name,
                server: server.shortName,
              });
            }
          }

          for (const p of ps) {
            if (!p.online) continue;
            players.push({
              x: p.mapX,
              y: gameY(p.mapY),
              label: p.name || "Jogador",
              server: server.shortName,
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

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <svg
            viewBox={`${BOUNDS.minX} ${BOUNDS.minY} ${W} ${H}`}
            className="block h-auto w-full"
            role="img"
            aria-label={`Mapa com ${bases.length} bases e ${players.length} jogadores online`}
          >
            <defs>
              <pattern
                id="grade"
                width="200"
                height="200"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 200 0 L 0 0 0 200"
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth="2"
                />
              </pattern>
              <radialGradient id="brilho">
                <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect
              x={BOUNDS.minX}
              y={BOUNDS.minY}
              width={W}
              height={H}
              fill="var(--bg)"
            />

            {/* Mapa de Palpagos. Escurecido de propósito: é textura de fundo,
                não protagonista — o ouro dos marcadores precisa dominar. */}
            <image
              href="/mapa-palpagos.webp"
              x={IMAGE_BOUNDS.minX}
              y={IMAGE_BOUNDS.minY}
              width={IMAGE_BOUNDS.maxX - IMAGE_BOUNDS.minX}
              height={IMAGE_BOUNDS.maxY - IMAGE_BOUNDS.minY}
              opacity="0.58"
              preserveAspectRatio="none"
            />

            <rect
              x={BOUNDS.minX}
              y={BOUNDS.minY}
              width={W}
              height={H}
              fill="url(#grade)"
            />

            {/* Halo por base: onde muita gente construiu, o brilho soma e
                aparece a região "quente" da comunidade. */}
            {bases.map((b, i) => (
              <circle
                key={`h${i}`}
                cx={b.x}
                cy={b.y}
                r={90}
                fill="url(#brilho)"
              />
            ))}

            {bases.map((b, i) => (
              <g key={`b${i}`}>
                <title>{`${b.label} · ${b.server}`}</title>
                <rect
                  x={b.x - 11}
                  y={b.y - 11}
                  width={22}
                  height={22}
                  transform={`rotate(45 ${b.x} ${b.y})`}
                  fill="var(--gold)"
                  fillOpacity="0.85"
                  stroke="var(--bg)"
                  strokeWidth="3"
                />
              </g>
            ))}

            {players.map((p, i) => (
              <g key={`p${i}`}>
                <title>{`${p.label} · ${p.server}`}</title>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={26}
                  fill="var(--color-success)"
                  fillOpacity="0.2"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={11}
                  fill="var(--color-success)"
                  stroke="var(--bg)"
                  strokeWidth="3"
                />
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="size-3 rotate-45 bg-gold/85" />
            <span className="text-muted">{bases.length} bases</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-success" />
            <span className="text-muted">
              {players.length} jogando agora
            </span>
          </span>
          <span className="text-muted">
            Passe o mouse num marcador para ver a guild.
          </span>
          <span className="ml-auto text-xs text-muted">
            Mapa de Palworld © Pocketpair, Inc.
          </span>
        </div>



        <div className="hidden">
        </div>

        {hidden.length > 0 && (
          <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-5">
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
