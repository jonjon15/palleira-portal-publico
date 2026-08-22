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
     * 🎯 CALIBRAÇÃO — derivada de `treemap_pixel_to_cursor` do
     * PalworldSaveTools, que mapeia a imagem inteira para 5.000 unidades em
     * cada eixo, deslocadas de -3575 em x e +4068 em y.
     *
     * ⚠️ Não foi possível conferir contra jogador real: não havia ninguém na
     * Árvore Mundial no momento. Se os marcadores caírem deslocados, é aqui
     * que se ajusta — mesma receita do mapa de Palpagos.
     */
    limites: { minX: -3575, maxX: 1425, minY: -4068, maxY: 932 },
    imagemLimites: { minX: -3575, maxX: 1425, minY: -4068, maxY: 932 },
  },
];

export const mapaPorId = (id: IdMapa) =>
  MAPAS.find((m) => m.id === id) ?? MAPAS[0];
