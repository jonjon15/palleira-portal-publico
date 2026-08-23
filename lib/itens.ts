/**
 * Rótulo e regra de negociação dos itens do jogo (§7.4 e §7.5 do PROMPT.md).
 *
 * O jogo fala por `ItemID` cru — `PalSphere_Ancient_1`, `HandgunBullet`. É
 * essa chave que o `giveitems` entende, então é ela que o banco guarda. Aqui
 * mora só a tradução para a tela.
 *
 * 🔴 **Chave sem tradução mostra a chave, nunca lixo.** São ~2.400 itens no
 * jogo e este dicionário cobre uma fração: o resto aparece com o nome
 * interno, que o jogador reconhece, em vez de um rótulo inventado que estaria
 * errado. O catálogo completo entra depois, semeado de dataset com licença
 * (§7.4) — a estrutura aqui já está pronta para recebê-lo.
 */

export type Categoria =
  | "esfera"
  | "municao"
  | "recurso"
  | "equipamento"
  | "esquema"
  | "comida"
  | "moeda"
  | "outro";

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  esfera: "Esferas",
  municao: "Munição",
  recurso: "Recursos",
  equipamento: "Equipamento",
  esquema: "Esquemas",
  comida: "Comida",
  moeda: "Moedas e fichas",
  outro: "Outros",
};

interface Ficha {
  nome: string;
  categoria: Categoria;
}

/**
 * O que já foi visto de verdade no inventário dos servidores, traduzido.
 *
 * Nada aqui é chute: cada linha saiu de uma leitura real do
 * `GET /v1/pdapi/items/{uid}`. Item que ainda não apareceu não ganha
 * tradução adivinhada — ganha o nome interno.
 */
const CATALOGO: Record<string, Ficha> = {
  Money: { nome: "Ouro", categoria: "moeda" },
  DogCoin: { nome: "Moeda cachorro", categoria: "moeda" },
  BountyProof_1: { nome: "Prova de recompensa", categoria: "moeda" },

  PalSphere: { nome: "Esfera Pal", categoria: "esfera" },
  PalSphere_Mega: { nome: "Mega esfera", categoria: "esfera" },
  PalSphere_Giga: { nome: "Giga esfera", categoria: "esfera" },
  PalSphere_Hyper: { nome: "Hiper esfera", categoria: "esfera" },
  PalSphere_Ultra: { nome: "Ultra esfera", categoria: "esfera" },
  PalSphere_Master: { nome: "Esfera mestra", categoria: "esfera" },
  PalSphere_Legend: { nome: "Esfera lendária", categoria: "esfera" },
  PalSphere_Exotic: { nome: "Esfera exótica", categoria: "esfera" },
  PalSphere_Tera: { nome: "Tera esfera", categoria: "esfera" },

  HandgunBullet: { nome: "Munição de pistola", categoria: "municao" },
  RifleBullet: { nome: "Munição de rifle", categoria: "municao" },

  PalFluid: { nome: "Fluido Pal", categoria: "recurso" },
  MeteorDrop: { nome: "Fragmento de meteorito", categoria: "recurso" },

  MeatCutterKnife: { nome: "Faca de açougueiro", categoria: "equipamento" },
  Homeward: { nome: "Pergaminho de retorno", categoria: "outro" },
};

/**
 * Prefixos que dão categoria a quem não está no catálogo.
 *
 * Serve só para agrupar a vitrine — nunca para inventar nome.
 */
const POR_PREFIXO: [RegExp, Categoria][] = [
  [/^PalSphere/, "esfera"],
  [/Bullet$|^Arrow/, "municao"],
  [/^Blueprint_/, "esquema"],
  [/^SkillUnlock_/, "outro"],
  [/^FishingRod|^Pickaxe|^Axe_|^Handgun|^AssaultRifle|_weight_/, "equipamento"],
  [/^Food_|^Bread|^Salad|Bait/, "comida"],
];

export function nomeDoItem(itemId: string): string {
  return CATALOGO[itemId]?.nome ?? itemId;
}

/** `true` quando o nome na tela é o ID interno — a UI avisa discretamente. */
export const semTraducao = (itemId: string) => !CATALOGO[itemId];

export function categoriaDoItem(itemId: string): Categoria {
  const ficha = CATALOGO[itemId];
  if (ficha) return ficha.categoria;
  for (const [padrao, categoria] of POR_PREFIXO) {
    if (padrao.test(itemId)) return categoria;
  }
  return "outro";
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
