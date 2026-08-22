/**
 * Os mundos do Palworld (§3.4 do PROMPT.md).
 *
 * São dois mapas com artes diferentes: Ilhas Palpagos e Árvore Mundial. A
 * arte veio do PalworldSaveTools (`T_WorldMap` e `T_TreeMap`, 8192² no
 * original), reduzida para 4096² — o suficiente para continuar nítida no
 * zoom sem pesar demais na página.
 *
 * ⚠️ **Não se constrói na Árvore Mundial**, então toda base é de Palpagos,
 * mesmo as que aparecem com altitude altíssima — essas são ilha flutuante ou
 * pico de montanha. Tentamos separar por altitude e estava errado: há base
 * legítima de Palpagos a z 63.000.
 *
 * Jogador, esse sim, pode estar nos dois. Quem decide é
 * `localizar()` em `lib/palworld/coordenadas.ts`, pela posição horizontal.
 */

export type IdMapa = "palpagos" | "arvore";

export interface DefinicaoMapa {
  id: IdMapa;
  nome: string;
  /**
   * Imagem do terreno. `null` enquanto não temos a arte — os marcadores
   * aparecem sobre a grade de coordenada, no lugar certo um em relação ao
   * outro, e o terreno entra depois sem mexer em mais nada.
   */
  imagem: string | null;
  /** Recorte do mundo que a vista cobre, em coordenada de mapa. */
  limites: { minX: number; maxX: number; minY: number; maxY: number };
  /** Qual retângulo a imagem cobre — só difere de `limites` na calibração. */
  imagemLimites: { minX: number; maxX: number; minY: number; maxY: number };
}

export const MAPAS: DefinicaoMapa[] = [
  {
    id: "palpagos",
    nome: "Ilhas Palpagos",
    imagem: "/mapa-palpagos.webp",
    // Medidos das bases reais e arredondados com folga, para o enquadramento
    // não pular quando alguém construir num canto novo.
    limites: { minX: -1929, maxX: 1229, minY: -1031, maxY: 2127 },
    imagemLimites: { minX: -1929, maxX: 1229, minY: -1031, maxY: 2127 },
  },
  {
    id: "arvore",
    nome: "Árvore Mundial",
    imagem: "/mapa-arvore.webp",
    /*
     * 🎯 CALIBRAÇÃO — segunda iteração, medida de dois prints do jogo.
     *
     * Método: dois prints do mapa cheio, com o personagem em lugares
     * diferentes e a coordenada visível. Medindo a posição da seta dentro da
     * moldura nos dois, sai quantas unidades de mapa a moldura cobre:
     *
     *   print 1: coord −1715 a 43,3% da largura da moldura
     *   print 2: coord −1506 a 69,7% da largura
     *   → 209 unidades para 26,4% da moldura = 792 unidades de ponta a ponta
     *
     * A primeira estimativa (700 de largura, centrada nos jogadores) ficava
     * estreita e deslocada para oeste, e o pino caía perto da região vinho em
     * vez de a leste dela.
     *
     * ⚠️ A CONVERSÃO está provada e não se mexe (ver `coordenadas.ts`). Isto
     * aqui é só **quanto do mundo a imagem cobre**, e sai de medição em
     * pixel, então tem erro de alguns pontos. Se ainda ficar deslocado, é
     * este retângulo que se empurra.
     */
    limites: { minX: -2058, maxX: -1266, minY: -1824, maxY: -1032 },
    imagemLimites: { minX: -2058, maxX: -1266, minY: -1824, maxY: -1032 },
  },
];

export const mapaPorId = (id: IdMapa) =>
  MAPAS.find((m) => m.id === id) ?? MAPAS[0];
