/**
 * As regras de espaço do cofre — **sem nenhuma dependência**.
 *
 * Separado do `lib/cofre.ts` pelo mesmo motivo do `mercado-regras`: aquele
 * fala com o banco, com a sessão e com o jogo, e por isso não pode ser
 * importado por componente de tela. O preço do próximo slot, porém, precisa
 * aparecer para o jogador antes de ele clicar.
 */

/** Slots de graça. Do 4º em diante o preço dobra — é o sink principal (§7.12). */
export const SLOTS_GRATIS = 3;

/**
 * Quanto custa o próximo slot.
 *
 * 15 · 30 · 60 · 120 · 240… Preço que dobra é o melhor sink que existe: quem
 * acumulou muita Paleta gasta muito, e ninguém é obrigado a comprar.
 */
export function precoDoSlot(numeroDoSlot: number): number {
  if (numeroDoSlot <= SLOTS_GRATIS) return 0;
  return 15 * 2 ** (numeroDoSlot - SLOTS_GRATIS - 1);
}
