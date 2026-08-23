import NOMES from "@/lib/itens-nomes.json";
import ICONES from "@/lib/itens-icones.json";
import TIPOS from "@/lib/itens-tipos.json";

/**
 * Rótulo, ícone e regra de negociação dos itens do jogo (§7.4 e §7.5 do
 * PROMPT.md).
 *
 * O jogo fala por `ItemID` cru — `PalSphere_Ancient_1`, `HandgunBullet`. É
 * essa chave que o `giveitems` entende, então é ela que o banco guarda. Aqui
 * mora só a tradução, o ícone e a categoria para a tela.
 *
 * 📌 **O catálogo pendente da §7.4 chegou em 23/08/2026** — 2.372 itens do
 * mesmo projeto que deu os modelos e ícones de Pal
 * ([Palworld Save Pal](https://github.com/PalworldSavePal/palworld-save-pal),
 * GPL-3.0 no código; os dados de jogo são da Pocketpair, mesma tolerância de
 * projeto de fã do resto do site). 2.320 com nome em português, 2.365 com
 * ícone de verdade. Gerado uma vez a partir de `data/json/items.json` e
 * `data/json/l10n/pt-BR/items.json` daquele repositório — os três JSON
 * (`itens-nomes`, `itens-icones`, `itens-tipos`) ficam versionados aqui, sem
 * dependência externa em tempo de execução.
 *
 * 🔴 **Chave sem tradução ainda mostra a chave, nunca lixo.** Uns 37 itens do
 * dataset original vinham com o placeholder literal `"pt-BR Text"` — filtrado
 * na geração, não entrou no catálogo. Item novo do jogo, fora do dataset,
 * cai no mesmo lugar: nome interno, sem inventar rótulo.
 */

export type Categoria =
  | "esfera"
  | "municao"
  | "recurso"
  | "equipamento"
  | "esquema"
  | "comida"
  | "consumo"
  | "moeda"
  | "outro";

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  esfera: "Esferas",
  municao: "Munição",
  recurso: "Recursos",
  equipamento: "Equipamento",
  esquema: "Esquemas",
  comida: "Comida",
  consumo: "Consumíveis",
  moeda: "Moedas e fichas",
  outro: "Outros",
};

const NOME_DE = NOMES as Record<string, string>;
const ICONE_DE = ICONES as Record<string, { arquivo: string; bytes: number }>;
const TIPO_DE = TIPOS as Record<string, string>;

/** Onde os ícones de item são servidos — hash não é preciso: o nome já é único. */
const BASE_ICONE = "/icons/itens";

/**
 * `type_a` do catálogo → nossa categoria. `SpecialWeapon` parece estranho
 * para esfera, mas é exatamente o que o jogo usa: conferido em 23/08, 100%
 * dos itens com esse tipo são `PalSphere*` — nenhuma arma de verdade cai
 * aqui.
 */
const CATEGORIA_DO_TIPO: Record<string, Categoria> = {
  Material: "recurso",
  Accessory: "equipamento",
  Essential: "outro",
  Consume: "consumo",
  Armor: "equipamento",
  Ammo: "municao",
  Weapon: "equipamento",
  Food: "comida",
  Blueprint: "esquema",
  Glider: "equipamento",
  MonsterEquipWeapon: "equipamento",
  SpecialWeapon: "esfera",
  SphereModule: "esfera",
};

/**
 * Moedas e fichas — o catálogo do jogo classifica como `Material` junto de
 * recurso comum, então a categoria certa só sai reconhecendo pelo `ItemID`.
 */
const MOEDAS = new Set([
  "Money",
  "DogCoin",
  "BountyProof_1",
  "BountyProof_2",
  "BountyProof_3",
]);

export function nomeDoItem(itemId: string): string {
  return NOME_DE[itemId] ?? itemId;
}

/** `true` quando o nome na tela é o ID interno — a UI avisa discretamente. */
export const semTraducao = (itemId: string) => !NOME_DE[itemId];

export function categoriaDoItem(itemId: string): Categoria {
  if (MOEDAS.has(itemId)) return "moeda";
  const tipo = TIPO_DE[itemId];
  return (tipo && CATEGORIA_DO_TIPO[tipo]) || "outro";
}

/** A URL do ícone (~4 KB, webp), ou `null` quando o item não tem um. */
export function urlDoIconeItem(itemId: string): string | null {
  const icone = ICONE_DE[itemId];
  return icone ? `${BASE_ICONE}/${icone.arquivo}` : null;
}

/* ------------------------------------------------------- o que não se vende */

/**
 * Itens que **não entram no cofre nem no mercado**.
 *
 * 1. **Ouro (`Money`).** É a moeda do próprio jogo, e ela nasce de drop —
 *    no PVE FREE com taxa dobrada. Deixar trocar Ouro por Paleta criaria um
 *    câmbio entre uma moeda infinita e outra que tem preço em real (§7.14):
 *    em uma semana a Paleta valeria o que o farm de Ouro decidir.
 *
 * 2. **Itens de uso individual.** A regra das Guitarras Elementais da
 *    comunidade é explícita: *não pode ser repassada nem vendida* (§7.13).
 *
 * ⚠️ O `ItemID` real das guitarras ainda não foi lido de um inventário — o
 * padrão abaixo é preventivo. Quando alguém que tenha uma abrir o cofre, o
 * ID aparece na lista e vira uma entrada exata aqui. Bloquear a mais é
 * chato; bloquear a menos deixa vender o prêmio de evento.
 */
const BLOQUEADOS = [/^Money$/i, /Guitar/i];

export const podeNegociar = (itemId: string) =>
  !BLOQUEADOS.some((p) => p.test(itemId));

export function motivoDoBloqueio(itemId: string): string {
  if (/^Money$/i.test(itemId)) {
    return "O Ouro do jogo não entra no mercado — ele nasce de drop, e trocá-lo por Paleta derrubaria o valor da moeda.";
  }
  return "Item de uso individual: não pode ser repassado nem vendido.";
}
