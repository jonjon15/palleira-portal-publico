/**
 * Cargos do Discord → permissões no site (§4.1 do PROMPT.md).
 *
 * Os IDs foram lidos direto da API do servidor Palleira BR em 22/08/2026.
 * Se um cargo for recriado no Discord, o ID muda e precisa ser atualizado
 * aqui — por isso o nome fica ao lado, para dar para conferir a olho.
 */

export const ROLE = {
  dono: "1528473158586208446",
  dev: "1531256185917804564",
  admin: "1451356002309111931",
  modDiscord: "1527448282354290839",
  pvpVip: "1528839890593255464",
  pveVip: "1528840127160516748",
  planoColossal: "1527443363039678525",
  planoDiamante: "1527443223503569137",
  planoOuro: "1527443110559482066",
  planoPrata: "1527442831235612702",
  planoBronze: "1527441969268396184",
  criadorEvento: "1527631716687286323",
  booster: "1457782290573955093",
  palleiro: "1527449340686368929",
} as const;

/** Do mais forte para o mais fraco — a ordem importa em `levelOf`. */
export type AccessLevel = "dono" | "admin" | "mod" | "vip" | "membro" | "visitante";

const LEVEL_ROLES: [AccessLevel, string[]][] = [
  ["dono", [ROLE.dono]],
  ["admin", [ROLE.admin, ROLE.dev]],
  ["mod", [ROLE.modDiscord]],
  ["vip", [ROLE.pveVip, ROLE.pvpVip]],
  ["membro", [ROLE.palleiro]],
];

/**
 * Planos de assinatura, do menor para o maior.
 *
 * ⚠️ Os cartazes de divulgação falam em "Hard Metal", "New Metal" e
 * "Palleira", que **não existem como cargo**. O que existe no Discord é esta
 * escada de cinco. Conferir qual é a verdade antes de publicar benefício.
 */
export const PLANOS = [
  { key: "bronze", nome: "Bronze", role: ROLE.planoBronze, ordem: 1 },
  { key: "prata", nome: "Prata", role: ROLE.planoPrata, ordem: 2 },
  { key: "ouro", nome: "Ouro", role: ROLE.planoOuro, ordem: 3 },
  { key: "diamante", nome: "Diamante", role: ROLE.planoDiamante, ordem: 4 },
  { key: "colossal", nome: "Colossal", role: ROLE.planoColossal, ordem: 5 },
] as const;

export type Plano = (typeof PLANOS)[number];

/** Nível de acesso a partir dos cargos que o Discord devolveu. */
export function levelOf(roles: string[], isMember = true): AccessLevel {
  if (!isMember) return "visitante";
  const owned = new Set(roles);
  for (const [level, ids] of LEVEL_ROLES) {
    if (ids.some((id) => owned.has(id))) return level;
  }
  return "membro";
}

/** O plano mais alto que a pessoa tem, se tiver algum. */
export function planoOf(roles: string[]): Plano | null {
  const owned = new Set(roles);
  return (
    [...PLANOS].reverse().find((p) => owned.has(p.role)) ?? null
  );
}

export const isStaff = (level: AccessLevel) =>
  level === "dono" || level === "admin" || level === "mod";

/** Pode agir no servidor do jogo: kick, ban, anúncio (§5.3). */
export const canModerate = isStaff;

/** Pode mexer em economia e resolver disputa — só cúpula (§7.8). */
export const canManageEconomy = (level: AccessLevel) =>
  level === "dono" || level === "admin";

/**
 * Pode ligar, reiniciar e desligar servidor pelo painel do host.
 *
 * Mais restrito que `canModerate` de propósito: kick e ban atingem uma
 * pessoa, energia derruba todo mundo que está online. Moderador modera
 * jogador; servidor é da cúpula.
 */
export const canPowerServer = (level: AccessLevel) =>
  level === "dono" || level === "admin";

export const LEVEL_LABEL: Record<AccessLevel, string> = {
  dono: "Dono",
  admin: "Admin",
  mod: "Moderador",
  vip: "VIP",
  membro: "Palleiro",
  visitante: "Visitante",
};
