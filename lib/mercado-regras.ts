/**
 * As regras de preço e taxa do mercado — **sem nenhuma dependência**.
 *
 * Fica separado do `lib/mercado.ts` de propósito: aquele fala com o banco e
 * com a sessão, e por isso não pode ser importado por componente de tela. A
 * taxa, porém, precisa aparecer para o jogador **antes** de ele publicar,
 * senão a primeira venda vira surpresa. Módulo puro roda nos dois lados.
 */

/**
 * Piso e teto de preço.
 *
 * A Paleta é moeda de número pequeno (§7.1 do PROMPT.md): um ano inteiro de
 * daily dá 730, e a maior doação dá 250. Preço de mercado vive nas dezenas —
 * o teto existe para um zero a mais no teclado não virar anúncio de 999999.
 *
 * ⚠️ A §7.12 quer estes números editáveis no painel admin, sem deploy. Até a
 * tabela `economy_config` existir, mudar aqui exige release.
 */
export const PRECO_MINIMO = 1;
export const PRECO_MAXIMO = 500;

/** Anti-spam de listagem (§7.7). */
export const MAX_ANUNCIOS_ATIVOS = 10;

/**
 * A taxa da venda, em degraus — e não em porcentagem.
 *
 * Percentual puro não funciona nesta moeda: 5% de 10 Paletas é 0,5, que
 * arredonda para zero, e o sink desaparece justamente onde há mais volume.
 * Degrau fixo é previsível e cabe numa frase no Discord: *"até 20 Paletas, a
 * taxa é 1"*.
 *
 * A taxa é **queimada** — não vai para ninguém. No extrato ela aparece como a
 * diferença entre o que o comprador pagou e o que o vendedor recebeu.
 */
export function taxaDaVenda(preco: number): number {
  if (preco <= 20) return 1;
  if (preco <= 50) return 2;
  if (preco <= 100) return 4;
  return Math.ceil(preco * 0.05);
}
