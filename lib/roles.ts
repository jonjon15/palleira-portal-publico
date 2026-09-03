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
  planoPalleira: "1527443363039678525",
  planoNewMetal: "1527443223503569137",
  planoHardMetal: "1527443110559482066",
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
 * Planos VIP pagos, do menor para o maior — cada um com sua paga de daily e
 * seus slots grátis no cofre (item e Pal contam separado, mesmo número).
 *
 * Os nomes batem com os cartazes de divulgação (Hard Metal, New Metal,
 * Palleira); os cargos por trás são os mesmos IDs de sempre, só renomeados
 * aqui para não precisar decorar a tradução.
 */
export const PLANOS = [
  { key: "hardMetal", nome: "Hard Metal", role: ROLE.planoHardMetal, ordem: 1, dailyPaletas: 4, slotsCofre: 2 },
  { key: "newMetal", nome: "New Metal", role: ROLE.planoNewMetal, ordem: 2, dailyPaletas: 8, slotsCofre: 3 },
  { key: "palleira", nome: "Palleira", role: ROLE.planoPalleira, ordem: 3, dailyPaletas: 12, slotsCofre: 4 },
] as const;

export type Plano = (typeof PLANOS)[number];

/** Slots grátis de cofre (item ou Pal) para quem não tem nenhum plano VIP. */
export const SLOTS_COFRE_PADRAO = 1;

/**
 * Quantos slots grátis esta pessoa tem no cofre — item e Pal usam a mesma
 * conta, cada um com sua própria lista de slots comprados por cima.
 */
export function slotsGratisDoCofre(roles: string[]): number {
  return planoOf(roles)?.slotsCofre ?? SLOTS_COFRE_PADRAO;
}

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

/**
 * Pode escrever no mural de eventos.
 *
 * Diferente das outras permissões daqui, não é só por `AccessLevel`: o
 * cargo Criador de Evento é dado a pessoas específicas da comunidade que
 * não são staff, então checa a lista de cargos crua também.
 */
export const canManageEvents = (level: AccessLevel, roles: string[]) =>
  isStaff(level) || roles.includes(ROLE.criadorEvento);

export const LEVEL_LABEL: Record<AccessLevel, string> = {
  dono: "Dono",
  admin: "Admin",
  mod: "Moderador",
  vip: "VIP",
  membro: "Palleiro",
  visitante: "Visitante",
};
