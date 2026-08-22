/**
 * Conversão de coordenada do Palworld (§3.4 do PROMPT.md).
 *
 * Portado de `src/palworld_coord/__init__.py` do
 * [PalworldSaveTools](https://github.com/deafdudecomputers/PalworldSaveTools),
 * que é a referência da comunidade para isso. As constantes são delas — não
 * foram derivadas aqui, e mexer nelas sem motivo quebra o mapa.
 *
 * ⚠️ **O que separa os dois mundos NÃO é a altitude.** Foi a primeira coisa
 * que tentamos e está errado: existem bases em Palpagos a z 63.000 (ilha
 * flutuante, pico de montanha). O que distingue é a **posição horizontal** —
 * a Árvore Mundial fica num pedaço completamente diferente do mundo, a
 * ~382 mil unidades de distância no eixo Y.
 *
 * ⚠️ Repare que `x` e `y` **trocam de lugar** na conversão. É assim no jogo,
 * não é engano de digitação.
 */

/* --------------------------------------------------- constantes do jogo */

// Palpagos, fórmula antiga — é a que o PalDefender usa. Conferido com base
// real: world (-234517, 239250) → map (177, -241), que bate exatamente.
const PALPAGOS_ANTIGO = { tx: 123_888, ty: 158_000, escala: 459 };

// Palpagos, fórmula nova — usada para decidir a que mundo um ponto pertence.
const PALPAGOS_NOVO = { tx: 375_247, ty: -18, escala: 725 };

const ARVORE = { tx: 358_540, ty: -382_365, escala: 724 };

/** Fora deste raio, o ponto não é de Palpagos. */
const LIMITE_PALPAGOS = 1000;

/** Fora deste raio, o ponto não é da Árvore Mundial. */
const LIMITE_ARVORE = 2500;

export interface Ponto {
  x: number;
  y: number;
}

/* ------------------------------------------------------------- conversão */

function converter(
  x: number,
  y: number,
  c: { tx: number; ty: number; escala: number },
): Ponto {
  return {
    x: Math.round((y - c.ty) / c.escala),
    y: Math.round((x + c.tx) / c.escala),
  };
}

/** Coordenada de mundo → coordenada do mapa de Palpagos (fórmula antiga). */
export const paraPalpagos = (x: number, y: number) =>
  converter(x, y, PALPAGOS_ANTIGO);

/** Coordenada de mundo → coordenada do mapa da Árvore Mundial. */
export const paraArvore = (x: number, y: number) => converter(x, y, ARVORE);

export type IdMundo = "palpagos" | "arvore";

export interface PontoNoMundo extends Ponto {
  mundo: IdMundo;
}

/**
 * Descobre em qual mundo o ponto está e devolve a coordenada daquele mapa.
 *
 * A regra é a do PalworldSaveTools: converte por Palpagos e, se o resultado
 * escapar do raio dela, tenta a Árvore Mundial. Se couber lá, é de lá.
 *
 * Não usa altitude de propósito — ver o aviso no topo do arquivo.
 */
export function localizar(x: number, y: number): PontoNoMundo {
  const p = converter(x, y, PALPAGOS_NOVO);

  if (Math.abs(p.x) > LIMITE_PALPAGOS || Math.abs(p.y) > LIMITE_PALPAGOS) {
    const a = paraArvore(x, y);
    if (Math.abs(a.x) <= LIMITE_ARVORE && Math.abs(a.y) <= LIMITE_ARVORE) {
      return { ...a, mundo: "arvore" };
    }
  }

  // Palpagos: devolver na fórmula antiga, que é a que o resto do site usa.
  return { ...paraPalpagos(x, y), mundo: "palpagos" };
}
