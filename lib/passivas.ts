import NOMES from "@/lib/passivas-nomes.json";
import RANKS from "@/lib/passivas-rank.json";
import NAO_E_PASSIVA_DE_PAL_JSON from "@/lib/passivas-nao-e-passiva-de-pal.json";

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
const RANK_DE = RANKS as Record<string, number>;

export function nomeDaPassiva(chave: string): string {
  return FICHA_DE[chave]?.nome ?? chave;
}

/** O que a passiva faz de verdade — para tooltip e para a ficha completa. */
export function descricaoDaPassiva(chave: string): string {
  return FICHA_DE[chave]?.descricao ?? "";
}

export const semTraducaoDePassiva = (chave: string) => !FICHA_DE[chave];

/**
 * A raridade da passiva — de -3 (prejudicial) a 5 (a melhor variante de uma
 * família, tipo "Deus da Destruição"). Vem de `passive_skills.json` do
 * Palworld Save Pal, mesmo lote de `lib/passivas-rank.json` (23/08/2026).
 * `null` para chave fora do catálogo — mesma regra de sempre.
 */
export function rankDaPassiva(chave: string): number | null {
  return RANK_DE[chave] ?? null;
}

/**
 * A cor do rank, mesma escala visual que o Palworld Save Pal usa: rank 1 é
 * neutro, 2–3 dourado, 4–5 ciano (as melhores), e rank ≤0 vermelho (passiva
 * prejudicial). Usada para tingir o ícone de brasão via `mask-image` — ele
 * chega em branco puro, sem cor própria (§ícone de rank).
 */
export function corDoRank(rank: number): string {
  if (rank >= 4) return "#68ffd8";
  if (rank >= 2) return "#fcdf19";
  if (rank === 1) return "#9ca3af";
  return "#ff3b3b";
}

/**
 * O brasão de raridade — não é do Save Pal, é o chevron de verdade extraído
 * do próprio jogo via FModel em 23/08/2026
 * (`Pal/Content/Pal/Texture/UI/Main_Menu/T_icon_skillstatus_rank_arrow_00..05`),
 * a pedido explícito: o card de passiva do Save Pal usava um selo genérico,
 * e o jogo tem uma progressão visual própria — de 1 chevron aberto (rank 0)
 * até um losango fechado de 6 camadas (rank 5). Png branco puro, tingir com
 * `corDoRank` via `mask-image` (a mesma técnica, só a fonte da arte mudou).
 *
 * O dataset não usa rank 0 (vai de -3 a 5, pulando o zero) — todo rank ≤0
 * cai no chevron mais vazio (`rank_0`), que é o que sobra para "prejudicial".
 */
export const urlDoIconeRank = (rank: number) =>
  `/icons/passivas/rank_${Math.max(0, Math.min(5, rank))}.png`;

export interface PassivaListada {
  chave: string;
  nome: string;
  rank: number | null;
}

/**
 * `passivas-nomes.json` mistura passiva genética de verdade (a que aparece
 * na ficha de um Pal capturado e se herda por reprodução) com um monte de
 * outra coisa que usa o mesmo formato de tradução mas nunca gruda num Pal:
 * troféu de chefe derrotado (`BossDefeatReward_*`), nome de chefe de arena
 * (`GYM_NAME_*`), bônus de acessório/armadura (`_ACC_`, `_Armor`,
 * `_Otomo_Only_Equip`, `StonDrop_Boost_*`, `WoodDrop_Boost_*`,
 * `MaxInventoryWeight_up*`...), resistência de temperatura, mecânica de
 * montaria (`AirDash_*`, `JumpCount_Increase*`), entre outras.
 *
 * `passivas-nao-e-passiva-de-pal.json` é a lista definitiva de exclusão —
 * gerada comparando nossas 421 chaves contra a DataTable real do jogo
 * (`PalPassiveSkill`, extraída via FModel/CUE4Parse em 14/09/2026): toda
 * chave que não existe *nessa* tabela cai aqui. Achar padrão de nome novo
 * a cada vez que aparece lixo é frágil — comparar contra o dado real do
 * jogo resolve de uma vez.
 */
const NAO_E_PASSIVA_DE_PAL = new Set<string>(NAO_E_PASSIVA_DE_PAL_JSON);

/**
 * O catálogo traduzido, sem o que não é passiva genética de Pal, ordenado
 * por rank (melhor primeiro) e depois por nome — para a Câmara de
 * Purificação montar a lista de passivas que ela vai aceitar num ritual
 * (§020 da migração).
 */
export function todasAsPassivas(): PassivaListada[] {
  return Object.keys(FICHA_DE)
    .filter((chave) => !NAO_E_PASSIVA_DE_PAL.has(chave))
    .map((chave) => ({ chave, nome: nomeDaPassiva(chave), rank: rankDaPassiva(chave) }))
    .sort((a, b) => (b.rank ?? -99) - (a.rank ?? -99) || a.nome.localeCompare(b.nome));
}
