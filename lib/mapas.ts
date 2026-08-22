/**
 * Os mapas do Palworld (§3.4 do PROMPT.md).
 *
 * O jogo tem mais de um mundo, e eles compartilham a mesma faixa de
 * coordenada de mapa — o que só se descobre pela **altitude**. Uma base na
 * Árvore Mundial e outra em Palpagos podem ter `map_pos` quase idêntico e
 * estar a 60 mil unidades de distância na vertical.
 *
 * ⚠️ Sem separar por altitude, as bases da Árvore Mundial são desenhadas em
 * cima de Palpagos, no lugar errado. Medido em 22/08/2026 no PVE FREE: das
 * 123 bases, **6 estão na Árvore Mundial** — e todas caíam no sudoeste da
 * ilha errada.
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

/**
 * Altitude que separa os dois mundos.
 *
 * Palpagos vai de ~-2.100 a ~18.200 (o topo é montanha e ilha flutuante); a
 * Árvore Mundial medida ficou entre 33.529 e 63.657. O corte em 33.000 cai no
 * vazio entre os dois, então não há empate.
 */
export const Z_ARVORE = 33_000;

export const mapaDe = (worldZ: number): IdMapa =>
  worldZ >= Z_ARVORE ? "arvore" : "palpagos";

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
    // 🎯 Falta a arte do terreno. Enquanto for `null`, o mapa mostra os
    // marcadores sobre a grade — correto entre si, sem cenário atrás.
    imagem: null,
    // Faixa das 6 bases medidas (x -1003..-438, y -1113..1565 depois de
    // inverter o eixo), com folga generosa: são poucas amostras e o mundo
    // certamente é maior do que o pedaço já ocupado.
    limites: { minX: -1500, maxX: 100, minY: 700, maxY: 2100 },
    imagemLimites: { minX: -1500, maxX: 100, minY: 700, maxY: 2100 },
  },
];

export const mapaPorId = (id: IdMapa) =>
  MAPAS.find((m) => m.id === id) ?? MAPAS[0];
