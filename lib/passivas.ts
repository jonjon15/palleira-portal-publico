import NOMES from "@/lib/passivas-nomes.json";

/**
 * Tradução das passivas de Pal (§7.4 do PROMPT.md).
 *
 * O jogo devolve a chave interna (`TrainerDEF_UP_1`, `MutationPal_Mutant`) —
 * é o que a ficha mostrava até 23/08/2026. Catálogo de **421 passivas**, com
 * nome **e o efeito já traduzido com o número certo** (`"Velocidade de
 * trabalho +90.0%"`, não o `<NumBlue_13>` cru que a doc em inglês do jogo
 * usa por trás). Mesma origem e mesma licença dos ícones e do catálogo de
 * item ([Palworld Save Pal](https://github.com/PalworldSavePal/palworld-save-pal),
 * GPL-3.0 no código; dado de jogo é da Pocketpair).
 *
 * Mesma regra de sempre: **chave sem tradução mostra a chave**, nunca um
 * palpite — uma passiva nova que o jogo lance antes do catálogo atualizar
 * cai aqui em vez de virar um nome inventado numa ficha que vale Paleta.
 */

interface Ficha {
  nome: string;
  descricao: string;
}

const FICHA_DE = NOMES as Record<string, Ficha>;

export function nomeDaPassiva(chave: string): string {
  return FICHA_DE[chave]?.nome ?? chave;
}

/** O que a passiva faz de verdade — para tooltip e para a ficha completa. */
export function descricaoDaPassiva(chave: string): string {
  return FICHA_DE[chave]?.descricao ?? "";
}

export const semTraducaoDePassiva = (chave: string) => !FICHA_DE[chave];
