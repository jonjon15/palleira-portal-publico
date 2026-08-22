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
     * 🎯 CALIBRAÇÃO — primeira estimativa, precisa de conferência.
     *
     * Centrada nos 6 jogadores medidos em 22/08 (x de −1935 a −1508, y de
     * 1306 a 1512, já com o eixo Y invertido), com folga para os cantos da
     * ilha que ninguém estava ocupando na hora.
     *
     * ⚠️ A CONVERSÃO está provada — bate com o jogo em dois pontos distantes.
     * O que ainda é chute é **quanto do mundo a imagem cobre**. Se os pinos
     * caírem certos entre si mas deslocados como grupo, é só empurrar estes
     * números; se caírem espalhados errado entre si, aí o problema é outro.
     */
    limites: { minX: -2070, maxX: -1370, minY: -1759, maxY: -1059 },
    imagemLimites: { minX: -2070, maxX: -1370, minY: -1759, maxY: -1059 },
  },
];

export const mapaPorId = (id: IdMapa) =>
  MAPAS.find((m) => m.id === id) ?? MAPAS[0];
