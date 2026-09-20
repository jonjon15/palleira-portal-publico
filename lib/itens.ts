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

/* ------------------------------------------------------------------ selas */

/**
 * As selas — e tudo que se equipa **num Pal** para montar, planar ou atirar.
 *
 * O jogo guarda todas em `KeyItems`, o compartimento da aba "Itens
 * importantes", e não na mochila. Como o cofre lia só a mochila, sela nunca
 * aparecia na tela para guardar e ninguém conseguia vender uma (relatado
 * pelo dono em 12/09/2026, com as selas de Rushoar, Direhowl e Grintale na
 * mão). Ver `getItems` em `lib/palworld/paldefender.ts`.
 *
 * O prefixo `SkillUnlock_` cobre os 143 do catálogo: 112 selas e arreios de
 * montaria, e mais 31 que são a mesma ideia com outro nome — as Luvas de
 * Galeclaw, o Lança-mísseis de Jetragon, o Colar de Daedream. Todos são o
 * item que libera usar aquele Pal de um jeito, todos são fabricáveis, e é
 * isso que a comunidade troca.
 *
 * 🔴 **Só isto sai do `KeyItems`.** Esfera-chave, implante, estátua de
 * Lifmunk, bolsa de expansão e prova de chefe ficam de fora: são desbloqueio
 * permanente de conta, não equipamento de Pal.
 */
export const ehSela = (itemId: string) => /^SkillUnlock_/.test(itemId);

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

/* ------------------------------------------------------------- raridade */

/**
 * O grau do item, de 1 (o mais simples) a 5 (o melhor) — ou `null` para o
 * que não tem grau nenhum.
 *
 * **Sai do próprio `ItemID`, não de tabela do jogo.** O Palworld nomeia as
 * versões de uma mesma peça com sufixo numérico: `Accessory_AT_1`,
 * `Accessory_AT_2`, `Accessory_AT_3` são o mesmo Pingente de Ataque em três
 * graus, e todos os três compartilham o nome traduzido — na tela viram três
 * linhas idênticas, e só a cor os distingue. Vale para 1197 dos 2320 itens
 * do catálogo, com 237 famílias chegando ao grau 5.
 *
 * 🔴 **Sem sufixo não é "comum", é sem grau.** Madeira, Pedra e Ouro não
 * participam dessa escala: pintá-los de cinza-comum afirmaria uma posição
 * numa régua em que eles nem entram. Por isso `null`, e a UI não pinta.
 *
 * A raridade "de verdade" mora no campo `Rarity` da `DT_ItemDataTable`, que
 * só se lê extraindo o `.pak` do jogo com o `.usmap`. O sufixo é a mesma
 * informação de graça — se algum dia divergir, é a DataTable que manda.
 */
export type GrauDoItem = 1 | 2 | 3 | 4 | 5;

export function grauDoItem(itemId: string): GrauDoItem | null {
  const m = /_([1-5])$/.exec(itemId);
  return m ? (Number(m[1]) as GrauDoItem) : null;
}

/* --------------------------------------------------------- catálogo para busca */

export interface ItemDoCatalogo {
  id: string;
  nome: string;
  categoria: Categoria;
  /** URL do ícone, ou `null` para os poucos que não têm um. */
  icone: string | null;
  /** 1 a 5, ou `null` quando o item não participa da escala de graus. */
  grau: GrauDoItem | null;
}

/**
 * Todo o catálogo — o que a grade de ícones de "Entregar itens manual"
 * precisa para desenhar e filtrar sem voltar ao servidor.
 *
 * Diferente do cofre e do mercado, aqui não há `podeNegociar`: é o admin
 * dando item de graça, não um jogador vendendo o que já tem — não existe
 * "Ouro não pode ser negociado" quando não há negociação nenhuma.
 *
 * São ~2300 itens, mas só três campos curtos cada: o custo de mandar isso
 * ao navegador é menor do que o de uma rota de busca que ida-e-volta a cada
 * tecla digitada.
 *
 * Ordenado por nome (itens sem tradução, que mostram o próprio ID, caem
 * juntos no fim do alfabeto por acidente — aceitável, é o caso raro).
 */
export function catalogoDeItens(): ItemDoCatalogo[] {
  return Object.keys(NOME_DE)
    .map((id) => ({
      id,
      nome: NOME_DE[id],
      categoria: categoriaDoItem(id),
      icone: urlDoIconeItem(id),
      grau: grauDoItem(id),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
