/**
 * As regras de espaço do cofre — **sem nenhuma dependência**.
 *
 * Separado do `lib/cofre.ts` pelo mesmo motivo do `mercado-regras`: aquele
 * fala com o banco, com a sessão e com o jogo, e por isso não pode ser
 * importado por componente de tela. O preço do próximo slot, porém, precisa
 * aparecer para o jogador antes de ele clicar.
 *
 * Os slots grátis não são mais um número fixo — dependem do plano VIP da
 * pessoa (`slotsGratisDoCofre` em `lib/roles.ts`). Por isso entram aqui como
 * parâmetro, não como constante.
 */

/**
 * Quanto custa o próximo slot, dado quantos essa pessoa já tem de graça.
 *
 * 100 · 200 · 400 · 800 · 1600… Os dois primeiros sobem de 100 em 100; a
 * partir do terceiro, dobra. Pedido do dono em 03/09/2026. Vale igual para
 * o cofre de item e o de Pal.
 */
export function precoDoSlot(numeroDoSlot: number, slotsGratis: number): number {
  if (numeroDoSlot <= slotsGratis) return 0;
  const posicao = numeroDoSlot - slotsGratis;
  if (posicao === 1) return 100;
  if (posicao === 2) return 200;
  return 200 * 2 ** (posicao - 2);
}
