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
 * 15 · 30 · 60 · 120 · 240… Preço que dobra é o melhor sink que existe: quem
 * acumulou muita Paleta gasta muito, e ninguém é obrigado a comprar. Vale
 * igual para o cofre de item e o de Pal.
 */
export function precoDoSlot(numeroDoSlot: number, slotsGratis: number): number {
  if (numeroDoSlot <= slotsGratis) return 0;
  return 15 * 2 ** (numeroDoSlot - slotsGratis - 1);
}
