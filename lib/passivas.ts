import NOMES from "@/lib/passivas-nomes.json";

/**
 * Tradução das passivas de Pal (§7.4 do PROMPT.md).
 *
 * O jogo devolve a chave interna (`TrainerDEF_UP_1`, `MutationPal_Mutant`) —
 * é o que a ficha mostrava até 23/08/2026. Catálogo de **421 passivas**,
 * mesma origem e mesma licença dos ícones e do catálogo de item
 * ([Palworld Save Pal](https://github.com/PalworldSavePal/palworld-save-pal),
 * GPL-3.0 no código; dado de jogo é da Pocketpair).
 *
 * Mesma regra de sempre: **chave sem tradução mostra a chave**, nunca um
 * palpite — uma passiva nova que o jogo lance antes do catálogo atualizar
 * cai aqui em vez de virar um nome inventado numa ficha que vale Paleta.
 */

const NOME_DE = NOMES as Record<string, string>;

export function nomeDaPassiva(chave: string): string {
  return NOME_DE[chave] ?? chave;
}

export const semTraducaoDePassiva = (chave: string) => !NOME_DE[chave];
