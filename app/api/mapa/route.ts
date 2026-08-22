import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { mappableServers } from "@/lib/servers";
import { getPlayers } from "@/lib/palworld/paldefender";
import { localizar } from "@/lib/palworld/coordenadas";

/**
 * Posição de quem está jogando agora, para o mapa acompanhar ao vivo.
 *
 * Só jogador: **base não se move**, então ela vem no carregamento da página e
 * não precisa entrar no laço. Isso corta o `/guilds` (77 KB no PVE FREE) de
 * toda atualização.
 *
 * ⚠️ O cache é do lado do servidor de propósito. Dez pessoas com o mapa
 * aberto continuam custando **uma** chamada ao servidor do jogo por janela,
 * não dez. Sem isso, mapa ao vivo viraria ataque de negação de serviço contra
 * o próprio PVE FREE, que já roda com CPU no teto (§3.4).
 *
 * ⚠️ §10.1 — nada de IP aqui. O `getPlayers` já devolve limpo, e este arquivo
 * escolhe campo por campo em vez de repassar o objeto inteiro, para um campo
 * novo na API do PalDefender nunca vazar sozinho.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Janela do cache. Abaixo disso não melhora: o jogo não anda mais rápido. */
const SEGUNDOS = 3;

const carregar = unstable_cache(
  async () => {
    const jogadores: {
      x: number;
      y: number;
      mapa: "palpagos" | "arvore";
      nome: string;
      guilda: string;
      servidor: string;
    }[] = [];

    await Promise.all(
      mappableServers().map(async (server) => {
        try {
          for (const p of await getPlayers(server)) {
            if (!p.online) continue;
            // Reconverter da posição crua: o `MapLocation` do PalDefender já
            // vem na fórmula de Palpagos e poria quem está na Árvore Mundial
            // no lugar errado.
            const onde = localizar(p.worldX, p.worldY);
            jogadores.push({
              x: onde.x,
              y: -onde.y, // mesmo eixo Y invertido do resto do mapa
              mapa: onde.mundo,
              nome: p.name || "Jogador",
              guilda: p.guildName,
              servidor: server.shortName,
            });
          }
        } catch {
          // Servidor fora do ar não derruba o mapa inteiro: os outros vêm.
        }
      }),
    );

    return { jogadores, em: Date.now() };
  },
  ["mapa-ao-vivo"],
  { revalidate: SEGUNDOS, tags: ["mapa-ao-vivo"] },
);

export async function GET() {
  const dados = await carregar();
  return NextResponse.json(dados, {
    headers: {
      // A borda também guarda pela mesma janela, então nem chega ao servidor.
      "Cache-Control": `public, s-maxage=${SEGUNDOS}, stale-while-revalidate=${SEGUNDOS * 4}`,
    },
  });
}
