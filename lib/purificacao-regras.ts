/**
 * Regras puras da Câmara de Purificação — sem banco, sem sessão, sem rede.
 *
 * Separado de `lib/purificacao.ts` (que puxa `@/lib/db` e `@/auth`) para
 * poder ser importado também de componente client (o formulário de doação
 * realça visualmente quem já atende a regra, antes mesmo de submeter).
 * A validação que vale de verdade é sempre revalidada no server, dentro de
 * `doarPal`.
 */

export const IV_MINIMO_DOADOR = 100;
export const CONDENSADO_MINIMO_DOADOR = 4;
export const DOADORES_POR_RODADA = 4;
export const IV_TETO_RITUAL = 150;
export const IV_INICIAL_RITUAL = 100;

/** O valor de "Ataque" da API — ver nota no topo da migração 020. */
export const ivAtaque = (ivs: Record<string, number>) => Number(ivs.AttackMelee ?? 0);
export const ivVida = (ivs: Record<string, number>) => Number(ivs.Health ?? 0);
export const ivDefesa = (ivs: Record<string, number>) => Number(ivs.Defense ?? 0);

export interface PalParaValidar {
  ivs: Record<string, number>;
  condensedPals: number;
  passives: string[];
}

/**
 * Se este Pal serve como doador para as passivas aceitas do ritual. Usada
 * tanto para realce visual no formulário quanto — a que vale de fato —
 * revalidada dentro de `doarPal`.
 */
export function elegibilidadeDoador(
  pal: PalParaValidar,
  passivasAceitas: string[],
): { ok: boolean; motivo: string; passivaUsada: string } {
  if (
    ivVida(pal.ivs) < IV_MINIMO_DOADOR ||
    ivAtaque(pal.ivs) < IV_MINIMO_DOADOR ||
    ivDefesa(pal.ivs) < IV_MINIMO_DOADOR
  ) {
    return { ok: false, motivo: "Precisa de IV 100 em Vida, Ataque e Defesa.", passivaUsada: "" };
  }
  if (pal.condensedPals < CONDENSADO_MINIMO_DOADOR) {
    return { ok: false, motivo: "Precisa ser Full Condensado (rank 4).", passivaUsada: "" };
  }
  const passivaUsada = pal.passives.find((p) => passivasAceitas.includes(p));
  if (!passivaUsada) {
    return { ok: false, motivo: "Não tem nenhuma das passivas aceitas neste ritual.", passivaUsada: "" };
  }
  return { ok: true, motivo: "", passivaUsada };
}
