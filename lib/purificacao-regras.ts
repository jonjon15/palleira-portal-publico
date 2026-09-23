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
/**
 * As "estrelas" de rank que a ficha do Pal mostra vêm de `PartnerSkillLevel`
 * — teto real do jogo é 5 (confirmado via Pal Creator, modo "Capped").
 * `CondensedPals` nunca reflete isso: sempre 0 em Pal entregue via
 * `givepal_j`, e não existe comando de condensar Pal em lugar nenhum do
 * PalDefender — ver a memória do projeto (achado de 14/09/2026).
 */
export const PARTNER_SKILL_MINIMO_DOADOR = 5;
export const DOADORES_POR_RODADA = 4;
export const IV_TETO_RITUAL = 150;
export const IV_INICIAL_RITUAL = 100;
/**
 * Valor inicial de `iv_minimo_resgate` para um ritual novo — a partir daí o
 * staff pode mudar por ritual (não precisa esperar o teto de 150). Ver
 * migração 021.
 */
export const IV_MINIMO_RESGATE_PADRAO = 110;

/**
 * Prazo mínimo e máximo (em minutos) que a staff pode dar para a "sugestão
 * de passivas" da rodada valer — ver migração 025 e
 * `atualizarReferenciaDeRegra`. O formulário pede dias + horas + minutos
 * separados (mais fácil de preencher) e soma tudo nisto antes de enviar.
 */
export const MINUTOS_REFERENCIA_MINIMO = 1;
export const MINUTOS_REFERENCIA_MAXIMO = 30 * 24 * 60; // 30 dias
export const DIAS_REFERENCIA_MAXIMO = 30;

/**
 * O IV de "Ataque" de um Pal — na API/save são DOIS eixos separados
 * (`AttackMelee`, `AttackShot`), e cada Pal usa naturalmente só um deles em
 * combate (o outro fica 0, não é imperfeição — ver PROMPT.md §14.3). Pega
 * o maior dos dois: é o eixo que o Pal de fato usa.
 */
export const ivAtaque = (ivs: Record<string, number>) =>
  Math.max(Number(ivs.AttackMelee ?? 0), Number(ivs.AttackShot ?? 0));
export const ivVida = (ivs: Record<string, number>) => Number(ivs.Health ?? 0);
export const ivDefesa = (ivs: Record<string, number>) => Number(ivs.Defense ?? 0);

export interface PalParaValidar {
  ivs: Record<string, number>;
  partnerSkillLevel: number;
  passives: string[];
  palId: string;
}

/**
 * Se este Pal serve como doador para as passivas aceitas do ritual. Usada
 * tanto para realce visual no formulário quanto — a que vale de fato —
 * revalidada dentro de `doarPal`.
 *
 * `palIdDoAlvo` trava o doador na mesma espécie do Pal que está sendo
 * purificado — pedido do dono em 14/09/2026, para que só um Pal
 * genuinamente igual ao alvo possa alimentar o ritual.
 */
export function elegibilidadeDoador(
  pal: PalParaValidar,
  passivasAceitas: string[],
  palIdDoAlvo: string,
): { ok: boolean; motivo: string; passivaUsada: string } {
  if (pal.palId !== palIdDoAlvo) {
    return { ok: false, motivo: "Precisa ser da mesma espécie do Pal em purificação.", passivaUsada: "" };
  }
  if (
    ivVida(pal.ivs) < IV_MINIMO_DOADOR ||
    ivAtaque(pal.ivs) < IV_MINIMO_DOADOR ||
    ivDefesa(pal.ivs) < IV_MINIMO_DOADOR
  ) {
    return { ok: false, motivo: "Precisa de IV 100 em Vida, Ataque e Defesa.", passivaUsada: "" };
  }
  if (pal.partnerSkillLevel < PARTNER_SKILL_MINIMO_DOADOR) {
    return { ok: false, motivo: "Precisa ser Full Condensado (rank 5).", passivaUsada: "" };
  }
  const passivaUsada = pal.passives.find((p) => passivasAceitas.includes(p));
  if (!passivaUsada) {
    return { ok: false, motivo: "Não tem nenhuma das passivas aceitas neste ritual.", passivaUsada: "" };
  }
  return { ok: true, motivo: "", passivaUsada };
}

/**
 * Se este Pal pode ser o alvo — o que entra na câmara. Mesma barra de
 * entrada dos doadores (IV 100 + Full Condensado), sem a exigência de
 * passiva, que só faz sentido para quem é consumido no ritual.
 *
 * Pal despertado (Cristal do Despertar) PODE entrar, mas sai sem o
 * despertar — `givepal_j` não escreve `IsAwakening` de volta (confirmado por
 * teste em 21/09/2026, ver `lib/pal-template.ts`). De 21 a 23/09 ele ficava
 * barrado; a comunidade pediu para liberar, então a trava virou um aceite
 * explícito: `iniciarRitual` recusa Pal despertado sem `aceitaPerderDespertar`,
 * e o formulário só manda isso depois de a pessoa marcar a caixa do aviso.
 */
export function elegibilidadeAlvo(
  pal: PalParaValidar,
): { ok: boolean; motivo: string } {
  if (
    ivVida(pal.ivs) < IV_MINIMO_DOADOR ||
    ivAtaque(pal.ivs) < IV_MINIMO_DOADOR ||
    ivDefesa(pal.ivs) < IV_MINIMO_DOADOR
  ) {
    return { ok: false, motivo: "Precisa de IV 100 em Vida, Ataque e Defesa." };
  }
  if (pal.partnerSkillLevel < PARTNER_SKILL_MINIMO_DOADOR) {
    return { ok: false, motivo: "Precisa ser Full Condensado (rank 5)." };
  }
  return { ok: true, motivo: "" };
}

export const AVISO_DESPERTAR =
  "Esse Pal está despertado. O despertar não volta depois da Câmara: ao resgatar (ou cancelar), ele sai sem o despertar, e só dá para despertar de novo no jogo, com outro Cristal do Despertar.";
