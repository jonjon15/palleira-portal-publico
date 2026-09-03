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
 * 60 · 90 · 120 · 150 · 180… Sobe 30 a cada slot — sink linear, não mais
 * dobrando. Vale igual para o cofre de item e o de Pal.
 */
export function precoDoSlot(numeroDoSlot: number, slotsGratis: number): number {
  if (numeroDoSlot <= slotsGratis) return 0;
  const posicao = numeroDoSlot - slotsGratis;
  return 60 + 30 * (posicao - 1);
}
