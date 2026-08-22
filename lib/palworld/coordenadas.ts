/**
 * Conversão de coordenada do Palworld (§3.4 do PROMPT.md).
 *
 * ⚠️ **Os dois mundos usam a MESMA fórmula.** A Árvore Mundial não tem
 * sistema próprio de coordenada — ela fica noutro pedaço do mesmo mundo, e a
 * conversão é idêntica à de Palpagos.
 *
 * Isso contraria o `src/palworld_coord` do PalworldSaveTools, que tem
 * constantes separadas de `treemap`. **Elas estão erradas** — provavelmente
 * de uma versão antiga do jogo, e ninguém percebeu porque quase ninguém vai
 * lá. Medido em 22/08/2026 com o dono parado dentro da Árvore, dois pontos
 * distantes:
 *
 * | posição no mundo | fórmula daqui | o jogo mostrou |
 * |---|---|---|
 * | 569160, -687284 | −1841,6 · 1509,9 | **−1841 · 1510** |
 * | 516229, -534185 | −1508,0 · 1394,6 | **−1506 · 1393** |
 *
 * As constantes do `treemap` deles davam −435 · 1197 no primeiro ponto: fora
 * por mais de mil unidades.
 *
 * ⚠️ Repare que `x` e `y` **trocam de lugar** na conversão. É assim no jogo,
 * não é engano de digitação.
 */

/**
 * A conversão, uma só.
 *
 * Bate com o que o PalDefender devolve em `MapLocation` — conferido nos 7
 * jogadores de Palpagos e nos 2 pontos medidos na Árvore Mundial.
 */
const TRANSLADO_X = 123_888;
const TRANSLADO_Y = 158_000;
const ESCALA = 459;

/**
 * `world_x` que separa os dois mundos.
 *
 * Não é altitude — isso foi tentado e está errado, porque existe base
 * legítima de Palpagos a z 63.000 (ilha flutuante, pico de montanha).
 *
 * O que separa é a posição no eixo X do mundo, e a separação é gritante: das
 * 279 posições lidas em 22/08, Palpagos vai de −889.530 a 117.842 e a Árvore
 * de 475.728 a 570.332. **Um vazio de 357.886 unidades** entre os dois, sem
 * nada no meio. O corte fica no meio desse vazio.
 */
export const X_ARVORE = 300_000;

export interface Ponto {
  x: number;
  y: number;
}

export type IdMundo = "palpagos" | "arvore";

export interface PontoNoMundo extends Ponto {
  mundo: IdMundo;
}

/** Coordenada de mundo → coordenada de mapa. Vale para os dois mundos. */
export function paraMapa(x: number, y: number): Ponto {
  return {
    x: Math.round((y - TRANSLADO_Y) / ESCALA),
    y: Math.round((x + TRANSLADO_X) / ESCALA),
  };
}

/**
 * Coordenada de mapa → coordenada de mundo. A volta de `paraMapa`.
 *
 * É o número que as ferramentas de save mostram como `World`, e o que se usa
 * para conferir a calibração contra elas. Confere com os dois pontos medidos
 * na Árvore Mundial: mapa (−1841,6 · 1509,9) volta como mundo
 * (569.155 · −687.294), contra os (569.160 · −687.284) lidos no jogo.
 */
export function paraMundo(mapaX: number, mapaY: number): Ponto {
  return {
    x: Math.round(mapaY * ESCALA - TRANSLADO_X),
    y: Math.round(mapaX * ESCALA + TRANSLADO_Y),
  };
}

/** Em qual mundo o ponto está, e a coordenada de mapa dele. */
export function localizar(x: number, y: number): PontoNoMundo {
  return {
    ...paraMapa(x, y),
    mundo: x >= X_ARVORE ? "arvore" : "palpagos",
  };
}
