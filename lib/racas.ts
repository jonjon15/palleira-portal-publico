/**
 * Raças e elementos do Dominantes (§ regras do servidor, 12/09/2026).
 *
 * O servidor competitivo tem sistema de elementos: a raça define o elemento
 * primário e o jogador escolhe um secundário. Quem registra declara os dois
 * no fórum do Discord, em texto livre — daí a bagunça que `elementoDoTexto`
 * abaixo precisa desfazer.
 *
 * Ideia do Leo_Raposa em 12/09/2026: mostrar a raça de cada jogador no
 * placar. Os ícones são os mesmos que já vieram do jogo em
 * `public/icons/elementos/`.
 */

export type Elemento =
  | "fire"
  | "ice"
  | "grass"
  | "ground"
  | "electric"
  | "water"
  | "dragon"
  | "dark"
  | "neutral";

export const NOME_DO_ELEMENTO: Record<Elemento, string> = {
  fire: "Fogo",
  ice: "Gelo",
  grass: "Grama",
  ground: "Terra",
  electric: "Elétrico",
  water: "Água",
  dragon: "Dragão",
  dark: "Sombra",
  neutral: "Neutro",
};

export const iconeDoElemento = (e: Elemento) => `/icons/elementos/${e}.webp`;

export interface Raca {
  nome: string;
  elemento: Elemento;
  /** A cor que identifica a raça no placar. */
  cor: string;
}

/**
 * As quatro raças, e só elas — cada uma amarrada ao seu elemento primário.
 *
 * As cores saem do próprio elemento (fogo alaranjado, gelo azul, grama
 * verde, terra âmbar) em tom claro o bastante para ler sobre o fundo escuro
 * do site sem virar o destaque da tela: o dourado continua sendo do site.
 */
export const RACAS: Record<string, Raca> = {
  daemon: { nome: "Daemon", elemento: "fire", cor: "#e0563d" },
  kryos: { nome: "Kryos", elemento: "ice", cor: "#57a3dd" },
  elfien: { nome: "Elfien", elemento: "grass", cor: "#7fbc55" },
  dunary: { nome: "Dunary", elemento: "ground", cor: "#d9a53a" },
};

/** Sem acento, sem pontuação, minúsculo — para comparar o que foi digitado. */
const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/**
 * O que as pessoas escreveram → o elemento de verdade.
 *
 * 🔴 Levantado dos 28 registros reais em 12/09/2026, e é por isso que a
 * lista tem tantas entradas para a mesma coisa: apareceram "escuridão",
 * "sombra", "sombrio" e "noct" para Sombra, "planta" e "grama" para Grama,
 * e "Eletico" escrito errado. Campo de texto livre sempre termina assim.
 *
 * Um formulário no site com opções fixas (a outra metade da ideia do Leo)
 * resolveria na origem e deixaria este mapa só como leitor do histórico.
 */
const APELIDOS: Record<string, Elemento> = {
  fogo: "fire",
  gelo: "ice",
  grama: "grass",
  planta: "grass",
  terra: "ground",
  eletrico: "electric",
  eletico: "electric",
  agua: "water",
  dragao: "dragon",
  sombra: "dark",
  sombrio: "dark",
  escuridao: "dark",
  noct: "dark",
  neutro: "neutral",
};

/** A raça, quando o que foi digitado é uma das quatro oficiais. */
export const racaDoTexto = (texto: string): Raca | null =>
  RACAS[chave(texto)] ?? null;

/** O elemento, quando o que foi digitado é reconhecível. */
export const elementoDoTexto = (texto: string): Elemento | null =>
  APELIDOS[chave(texto)] ?? null;

export interface RegistroDeRaca {
  /** Nulo quando a pessoa escreveu uma raça que não existe (ex.: "Nordem"). */
  raca: Raca | null;
  /** O que ela escreveu, para a tela poder mostrar mesmo sem reconhecer. */
  racaCrua: string;
  secundario: Elemento | null;
}

/**
 * Lê um post do fórum de registro.
 *
 * O formato pedido é `RAÇA: … / ELEMENTOS INICIAIS: … / …`, mas ninguém
 * segue à risca: aparece com asterisco de negrito, com "ELEMENTOS:" sem o
 * "INICIAIS", separado por vírgula, por "e" ou por hífen. Devolve `null`
 * quando não é um registro — inclusive para o post-modelo em branco que o
 * dono fixou no topo da thread.
 */
export function lerRegistro(texto: string): RegistroDeRaca | null {
  const limpo = texto.replace(/\*/g, "");

  const achouRaca = /RA[ÇC]A\s*:\s*([^\n|]+)/i.exec(limpo);
  const racaCrua = achouRaca?.[1]?.trim() ?? "";
  // O modelo em branco tem "RAÇA:" seguido direto da próxima etiqueta.
  if (!racaCrua || /^ELEMENTOS/i.test(racaCrua)) return null;

  const raca = racaDoTexto(racaCrua);

  const achouElems = /ELEMENTOS?(?:\s+INICIAIS)?\s*:\s*([^\n]+)/i.exec(limpo);
  const secundario =
    achouElems?.[1]
      ?.split(/[,;\-]|\se\s/)
      .map((p) => elementoDoTexto(p))
      .find((e) => e && e !== raca?.elemento) ?? null;

  return { raca, racaCrua, secundario };
}
