/**
 * Registro dos servidores Palworld da Palleira (§3.4 do PROMPT.md).
 *
 * Host e portas não são segredo e ficam aqui; senhas vêm SEMPRE de env.
 *
 * `enabled: false` tira o servidor do site inteiro — é a chave mestra, para
 * quando um servidor não deve existir para o site de jeito nenhum.
 *
 * ⚠️ **Não é aqui que se esconde servidor desligado no painel.** Isso é
 * automático desde 19/09/2026: quem para de responder por mais de 30 min some
 * da vitrine sozinho e volta sozinho ao religar, sem deploy nenhum — ver
 * `lib/presenca-de-servidor.ts`. Mexer em `enabled` para isso só cria trabalho
 * manual dos dois lados.
 *
 * ⚠️ Taxas (XP, drop, peso…) NÃO ficam aqui. São lidas ao vivo de
 * `/v1/api/settings` via `getRates()` — ver §7.13.
 */

export type ServerSlug = "pve-free" | "pve-vip" | "pvp-free";

export interface PalleiraServer {
  slug: ServerSlug;
  name: string;
  shortName: string;
  host: string;
  /** Porta do jogo (UDP) — a que o jogador usa para conectar */
  gamePort: number;
  /** REST oficial do Palworld (TCP) */
  restPort: number;
  /** RCON (TCP) — 0 quando desativado no .ini */
  rconPort: number;
  adminPassword: string;
  /** Token da REST API do PalDefender (§3.6) */
  palDefenderPort: number;
  palDefenderToken: string;
  /**
   * ID do servidor no painel da ENX — o pedaço da URL em `/server/XXXXXXXX`.
   *
   * É o que permite ligar e reiniciar: a REST do Palworld só desliga, porque
   * ela morre junto com o processo. Não é segredo (a chave é que é), então
   * mora aqui e não em env. Vazio = botão de energia desligado no site.
   */
  panelId: string;
  enabled: boolean;
  /**
   * Se as posições de jogador e base podem aparecer no mapa público.
   *
   * ⚠️ Em PvP, mapa é ferramenta de caçada: entrega onde a pessoa está e
   * onde fica a base dela. O servidor aparece no placar e nas estatísticas,
   * mas nunca no mapa.
   */
  mapVisible: boolean;
  mode: "PvE" | "PvP";
  tier: "free" | "vip";
  /**
   * Se item/Pal vindo daqui só pode ser comprado, vendido e resgatado por
   * quem também joga neste servidor (§ trava de mercado, 11/09/2026).
   *
   * Pedido específico do dono para o Dominantes: os outros servidores
   * (PVE Free, PVE VIP) continuam com mercado livre entre si, sem essa
   * restrição — só este slug fica isolado do resto da economia.
   */
  mercadoRestrito: boolean;
}

const env = (key: string) => process.env[key] ?? "";

export const SERVERS: PalleiraServer[] = [
  {
    slug: "pve-free",
    name: "[BR] Palleira PVE FREE",
    shortName: "PVE Free",
    host: "enx-soc-20.enx.host",
    gamePort: 10084,
    restPort: 10056,
    rconPort: 10055,
    adminPassword: env("SRV1_ADMIN_PASSWORD"),
    palDefenderPort: 10052,
    palDefenderToken: env("SRV1_PALDEFENDER_TOKEN"),
    panelId: "0c079595",
    enabled: true,
    mapVisible: true,
    mode: "PvE",
    tier: "free",
    mercadoRestrito: false,
  },
  {
    slug: "pve-vip",
    name: "[BR] Palleira PVE VIP",
    shortName: "PVE VIP",
    host: "enx-cirion-30.enx.host",
    gamePort: 10086,
    restPort: 10056,
    rconPort: 10055,
    adminPassword: env("SRV2_ADMIN_PASSWORD"),
    palDefenderPort: 10064,
    palDefenderToken: env("SRV2_PALDEFENDER_TOKEN"),
    panelId: "6eb8d521",
    enabled: true,
    mapVisible: true,
    mode: "PvE",
    tier: "vip",
    mercadoRestrito: false,
  },
  {
    slug: "pvp-free",
    name: "[BR] Palleira Dominantes",
    shortName: "Dominantes",
    host: "enx-cirion-16.enx.host",
    gamePort: 11144,
    restPort: 10058,
    rconPort: 10056, // ligado em 11/09/2026 — ver alocações no painel
    adminPassword: env("SRV3_ADMIN_PASSWORD"),
    palDefenderPort: 10077,
    palDefenderToken: env("SRV3_PALDEFENDER_TOKEN"),
    panelId: "59ec87fa",
    enabled: true,
    // 🔴 NUNCA no mapa: é PvP, e posição de jogador e base viram alvo.
    mapVisible: false,
    mode: "PvP",
    tier: "free",
    // Pedido do dono em 11/09/2026: item/Pal vindo daqui só troca com quem
    // também joga no Dominantes — os outros dois servidores não têm essa
    // trava.
    mercadoRestrito: true,
  },
];

/** Só os servidores que devem aparecer no site. */
export const activeServers = () => SERVERS.filter((s) => s.enabled);

/**
 * Servidores cujas posições podem ir para o mapa público.
 *
 * Separado de `activeServers` de propósito: o PvP aparece no placar, mas
 * mostrar onde os jogadores estão ali causaria briga de verdade.
 */
export const mappableServers = () =>
  SERVERS.filter((s) => s.enabled && s.mapVisible);

export const serverBySlug = (slug: string) =>
  SERVERS.find((s) => s.slug === slug && s.enabled);
