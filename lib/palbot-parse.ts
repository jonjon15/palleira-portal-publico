/**
 * Leitura do texto que o Palbot escreve no Discord.
 *
 * Separado do resto de propósito: aqui não entra rede nem banco, só texto
 * entra e número sai. É a parte que dá para testar sozinha, e a que quebra
 * se o Palbot mudar o jeito de escrever.
 */

/** Como a moeda se chama no Palbot deste servidor (§4.7). */
const MOEDA = "paletas?";

/**
 * O número que vem antes da palavra "Paletas".
 *
 * Aceita "26 Paletas", "**8** Paletas" e "1,234 Paletas". Devolve null
 * quando a mensagem não fala de saldo.
 */
export function acharSaldo(texto: string): number | null {
  const m = texto.match(
    new RegExp(String.raw`(\d[\d.,]*)\s*\*{0,2}\s*` + MOEDA, "i"),
  );
  if (!m) return null;

  // "1.234" e "1,234" são separador de milhar — saldo é sempre inteiro.
  const n = Number(m[1].replace(/[.,]/g, ""));
  return Number.isInteger(n) && n >= 0 && n < 10_000_000 ? n : null;
}

/**
 * O nome que vem antes da vírgula: "Fulano, you have 26 Paletas".
 *
 * Só serve para `/checkpoints`, onde o Discord carimba o ID do admin que
 * digitou, e não o da pessoa consultada.
 */
export function acharNome(texto: string): string | null {
  const linha = texto
    .split("\n")
    .find((l) => new RegExp(MOEDA, "i").test(l) && /\d/.test(l));
  if (!linha) return null;

  const m = linha.match(/^\s*\*{0,2}\s*([^,\n]{1,80}?)\s*\*{0,2}\s*,/);
  const nome = m?.[1]?.trim().replace(/^@/, "");
  return nome && !/^\d+$/.test(nome) ? nome : null;
}

/**
 * A mensagem é uma **resposta de saldo**, e não outra coisa do bot?
 *
 * O `/daily` também diz "2 Paletas" ("You have claimed 2 Paletas!"), e
 * confundir os dois migraria a recompensa do dia como se fosse o saldo
 * inteiro da pessoa.
 */
export function ehTextoDeSaldo(texto: string): boolean {
  if (acharSaldo(texto) === null) return false;
  return !/\bclaim(ed)?\b|\bresgat/i.test(texto);
}
