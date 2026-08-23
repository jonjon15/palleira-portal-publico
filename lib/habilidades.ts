import NOMES from "@/lib/habilidades-nomes.json";
import ELEMENTO_DA from "@/lib/habilidades-elemento.json";

/**
 * Tradução das habilidades ativas de Pal — o que aparece nos 3 slots de
 * ataque equipados, hoje guardado no template mas nunca mostrado na tela.
 * Mesma origem, mesma licença e mesma disciplina dos catálogos irmãos
 * (`lib/passivas.ts`, `lib/itens.ts`): chave sem tradução mostra a chave.
 *
 * 📌 **Elemento por habilidade, não por Pal** — chegou em 23/08/2026, de
 * `data/json/active_skills.json` do Palworld Save Pal. Uma habilidade tem
 * elemento próprio, que pode não bater com o do Pal que a usa (um Pal Terra
 * pode ter uma habilidade de Água equipada); por isso o mapa é da chave da
 * habilidade, não reaproveitado de `elementosDoPal`.
 *
 * 📌 **O selo colorido é do próprio jogo**, não do Save Pal — extraído via
 * FModel em 23/08/2026 de
 * `Pal/Content/Pal/Texture/UI/Main_Menu/T_prt_pal_skill_base_element_00..08`:
 * o trapézio já vem com a cor do elemento e o ícone embutidos (o jogo não
 * tinge um ícone genérico, tem uma arte por elemento). Índice e cor lidos
 * pixel a pixel do PNG real, não adivinhados — a ordem do jogo (`_00` a
 * `_08`) não é a mesma do catálogo do Save Pal (lá é Dark/Dragon/Earth/...
 * em ordem alfabética; aqui é Normal/Fire/Water/Electricity/Leaf/Dark/
 * Dragon/Earth/Ice, a ordem que o próprio arquivo usa).
 */

interface Ficha {
  nome: string;
  descricao: string;
}

interface Elemento {
  chave: string;
  nome: string;
  indice: number;
  cor: string;
}

const FICHA_DE = NOMES as Record<string, Ficha>;
const ELEMENTO_DE = ELEMENTO_DA as Record<string, string>;

/** Os 9 tipos elementais do jogo — estável, não vem de dataset externo. */
const ELEMENTO_INFO: Record<string, { nome: string; indice: number; cor: string }> = {
  Normal: { nome: "Não elemental", indice: 0, cor: "#a2877e" },
  Fire: { nome: "Fogo", indice: 1, cor: "#d65331" },
  Water: { nome: "Água", indice: 2, cor: "#186fd6" },
  Electricity: { nome: "Elétrico", indice: 3, cor: "#ceaa00" },
  Leaf: { nome: "Grama", indice: 4, cor: "#65a700" },
  Dark: { nome: "Escuridão", indice: 5, cor: "#3c2254" },
  Dragon: { nome: "Dracônico", indice: 6, cor: "#ba4ee4" },
  Earth: { nome: "Terra", indice: 7, cor: "#8e5323" },
  Ice: { nome: "Gelo", indice: 8, cor: "#18b0c0" },
};

export function nomeDaHabilidade(chave: string): string {
  return FICHA_DE[chave]?.nome ?? chave;
}

export function descricaoDaHabilidade(chave: string): string {
  return FICHA_DE[chave]?.descricao ?? "";
}

/** O elemento da habilidade (não o do Pal) — `null` para chave desconhecida. */
export function elementoDaHabilidade(chave: string): Elemento | null {
  const elementoChave = ELEMENTO_DE[chave];
  const info = elementoChave ? ELEMENTO_INFO[elementoChave] : undefined;
  return info ? { chave: elementoChave, ...info } : null;
}

/** O selo trapezoidal completo (fundo + símbolo), extraído do jogo. */
export const urlDoSeloElemento = (indice: number) =>
  `/icons/elementos-habilidade/${String(indice).padStart(2, "0")}.png`;
