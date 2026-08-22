/**
 * Registro dos servidores Palworld da Palleira (§3.4 do PROMPT.md).
 *
 * Host e portas não são segredo e ficam aqui; senhas vêm SEMPRE de env.
 *
 * `enabled: false` tira o servidor do site inteiro sem deploy — é assim que
 * o PVP fica em standby até o RCON ser ligado.
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
  enabled: boolean;
  mode: "PvE" | "PvP";
  tier: "free" | "vip";
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
    enabled: true,
    mode: "PvE",
    tier: "free",
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
    enabled: true,
    mode: "PvE",
    tier: "vip",
  },
  {
    slug: "pvp-free",
    name: "[BR] Palleira PVP FREE NEW",
    shortName: "PVP Free",
    host: "enx-cirion-16.enx.host",
    gamePort: 11144,
    restPort: 10058,
    rconPort: 0, // RCONEnabled=False — ver §3.4
    adminPassword: env("SRV3_ADMIN_PASSWORD"),
    // 🟡 standby: cadastrado e desligado. Virar para true quando o RCON subir.
    enabled: false,
    mode: "PvP",
    tier: "free",
  },
];

/** Só os servidores que devem aparecer no site. */
export const activeServers = () => SERVERS.filter((s) => s.enabled);

export const serverBySlug = (slug: string) =>
  SERVERS.find((s) => s.slug === slug && s.enabled);
