import NOMES from "@/lib/habilidades-nomes.json";
import ELEMENTO_DA from "@/lib/habilidades-elemento.json";
import PODER_DA from "@/lib/habilidades-power.json";

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
 * 🔴 **O jogo não usa ícone nenhum aqui** — só descobri isso depois de tentar
 * dois selos diferentes (um trapézio, depois um círculo, ambos extraídos via
 * FModel) e o dono mandar print da tela real do jogo: a habilidade ativa é
 * uma barra com borda esquerda na cor do elemento e um bloco sólido daquela
 * cor à direita, mostrando só o **poder** (`700`, `600`...). Cor pixel a
 * pixel de `T_prt_pal_skill_base_element_00..08` (Main_Menu), poder de
 * `active_skills.json`. Sem selo, só cor + número — mais fiel e mais simples
 * que qualquer ícone que a gente tentasse colar do lado.
 */

interface Ficha {
  nome: string;
  descricao: string;
}

interface Elemento {
  chave: string;
  nome: string;
  cor: string;
}

const FICHA_DE = NOMES as Record<string, Ficha>;
const ELEMENTO_DE = ELEMENTO_DA as Record<string, string>;
const PODER_DE = PODER_DA as Record<string, number>;

/** Os 9 tipos elementais do jogo — estável, não vem de dataset externo. */
const ELEMENTO_INFO: Record<string, { nome: string; cor: string }> = {
  Normal: { nome: "Não elemental", cor: "#a2877e" },
  Fire: { nome: "Fogo", cor: "#d65331" },
  Water: { nome: "Água", cor: "#186fd6" },
  Electricity: { nome: "Elétrico", cor: "#ceaa00" },
  Leaf: { nome: "Grama", cor: "#65a700" },
  Dark: { nome: "Escuridão", cor: "#3c2254" },
  Dragon: { nome: "Dracônico", cor: "#ba4ee4" },
  Earth: { nome: "Terra", cor: "#8e5323" },
  Ice: { nome: "Gelo", cor: "#18b0c0" },
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

/** O poder da habilidade (`0` quando não tem, ex.: buff puro) — `null` fora do catálogo. */
export function poderDaHabilidade(chave: string): number | null {
  return PODER_DE[chave] ?? null;
}
