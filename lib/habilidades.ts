import NOMES from "@/lib/habilidades-nomes.json";

/**
 * Tradução das habilidades ativas de Pal — o que aparece nos 3 slots de
 * ataque equipados, hoje guardado no template mas nunca mostrado na tela.
 * Mesma origem, mesma licença e mesma disciplina dos catálogos irmãos
 * (`lib/passivas.ts`, `lib/itens.ts`): chave sem tradução mostra a chave.
 */

interface Ficha {
  nome: string;
  descricao: string;
}

const FICHA_DE = NOMES as Record<string, Ficha>;

export function nomeDaHabilidade(chave: string): string {
  return FICHA_DE[chave]?.nome ?? chave;
}

export function descricaoDaHabilidade(chave: string): string {
  return FICHA_DE[chave]?.descricao ?? "";
}
