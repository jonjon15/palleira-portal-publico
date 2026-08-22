/**
 * Cliente da REST API oficial do Palworld (§3.1 e §3.4 do PROMPT.md).
 *
 * ⚠️ REGRA DA §10.1 — O IP DO JOGADOR MORRE AQUI DENTRO.
 * A API devolve `ip` de cada jogador. IP é dado pessoal (LGPD) e vetor de
 * ataque. Este módulo é a única fronteira que enxerga esse campo: tudo que
 * sai daqui já vem limpo, para ninguém depois precisar lembrar de filtrar.
 *
 * Runtime: Node.js. Não funciona no Edge (precisa de TCP/Basic auth).
 */

import type { PalleiraServer } from "@/lib/servers";

/* ------------------------------------------------------------------ tipos */

export interface ServerInfo {
  version: string;
  servername: string;
  description: string;
  worldguid: string;
}

export interface ServerMetrics {
  currentplayernum: number;
  serverfps: number;
  serverfpsaverage: number;
  serverframetime: number;
  days: number;
  maxplayernum: number;
  basecampnum: number;
  uptime: number;
}

/** Jogador já sanitizado — repare que não existe campo de IP. */
export interface SafePlayer {
  name: string;
  accountName: string;
  playerId: string;
  userId: string;
  /** steam | gdk (Xbox) | ps5 | mac — a comunidade é cross-platform (§3.5) */
  platform: string;
  ping: number;
  level: number;
  locationX: number;
  locationY: number;
  /** Só o snapshot do mundo traz guild; `/players` não devolve esse campo. */
  guild?: string;
}

export interface SafeBase {
  guildId: string;
  guildName: string;
  /** Nome já tratado: base sem nome não mostra a chave japonesa crua */
  name: string;
  locationX: number;
  locationY: number;
}

export interface SafeGuild {
  guildId: string;
  name: string;
  bases: number;
  pals: number;
}

export interface WorldSnapshot {
  fps: number;
  averageFps: number;
  inGameTime: string;
  inGameDays: number;
  players: SafePlayer[];
  bases: SafeBase[];
  guilds: SafeGuild[];
}

/* ------------------------------------------------------------- utilitários */

/** Extrai a plataforma do userId: `steam_7656…`, `gdk_25332…`, `ps5_63899…` */
export function platformOf(userId: string): string {
  const i = userId.indexOf("_");
  return i > 0 ? userId.slice(0, i) : "desconhecida";
}

const UNNAMED_BASE = /^新規生成拠点テンプレート名/;

/** Traduz os rótulos crus que a API devolve (§3.4). */
function baseLabel(name: string): string {
  return UNNAMED_BASE.test(name ?? "") ? "Base sem nome" : name;
}

function guildLabel(name: string): string {
  return name === "Unnamed Guild" ? "Guild sem nome" : name;
}

/* ----------------------------------------------------------------- fetcher */

export class PalworldError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PalworldError";
  }
}

async function call<T>(
  server: PalleiraServer,
  endpoint: string,
  {
    timeoutMs = 10_000,
    revalidate = 60,
  }: { timeoutMs?: number; revalidate?: number } = {},
): Promise<T> {
  if (!server.adminPassword) {
    throw new PalworldError(
      `Senha de admin ausente para ${server.slug}. Configure no vercel env.`,
    );
  }

  const auth = Buffer.from(`admin:${server.adminPassword}`).toString("base64");
  const url = `http://${server.host}:${server.restPort}/v1/api/${endpoint}`;

  // Cache obrigatório: os servidores rodam com CPU alta (§3.4). Exceção é o
  // game-data, que passa `revalidate: 0` — ele sozinho pesa quase 1 MB e
  // estoura o limite da Data Cache do Next. Nesse caso quem cacheia é a
  // página, guardando o resultado já reduzido em vez do JSON cru.
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(timeoutMs),
    ...(revalidate === 0
      ? { cache: "no-store" as const }
      : { next: { revalidate } }),
  });

  if (!res.ok) {
    throw new PalworldError(
      `${endpoint} respondeu ${res.status} em ${server.slug}`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

/**
 * Comandos de admin (§3.1, §5.3) — a REST oficial devolve `{"message":"OK"}`
 * em alguns e texto puro em outros, então aceita os dois formatos.
 *
 * ⚠️ Sem cache de propósito: cada chamada aqui é uma ação de verdade
 * (expulsar, banir, desligar), nunca uma leitura repetível.
 */
async function command(
  server: PalleiraServer,
  endpoint: string,
  body?: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<string> {
  if (!server.adminPassword) {
    throw new PalworldError(
      `Senha de admin ausente para ${server.slug}. Configure no vercel env.`,
    );
  }

  const auth = Buffer.from(`admin:${server.adminPassword}`).toString("base64");
  const url = `http://${server.host}:${server.restPort}/v1/api/${endpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  const texto = await res.text();
  if (!res.ok) {
    throw new PalworldError(
      `${endpoint} respondeu ${res.status} em ${server.slug}${texto ? `: ${texto}` : ""}`,
      res.status,
    );
  }
  return texto;
}

/* ---------------------------------------------------------------- endpoints */

export const getInfo = (s: PalleiraServer) => call<ServerInfo>(s, "info");

export const getMetrics = (s: PalleiraServer) =>
  call<ServerMetrics>(s, "metrics");

/**
 * Taxas do servidor, lidas AO VIVO.
 *
 * ⚠️ Nunca escrever taxa na mão no site (§7.13). Cartaz envelhece, `.ini` muda
 * e ninguém lembra de atualizar — foi assim que o VIP passou meses anunciando
 * XP 0.5 rodando 0.4. A API não mente.
 */
export async function getRates(s: PalleiraServer): Promise<ServerRates> {
  const raw = await call<Record<string, number>>(s, "settings", {
    revalidate: 600,
  });
  const n = (k: string, fallback = 0) =>
    typeof raw[k] === "number" ? Number(raw[k].toFixed(2)) : fallback;

  return {
    exp: n("ExpRate", 1),
    capture: n("PalCaptureRate", 1),
    enemyDrop: n("EnemyDropItemRate", 1),
    collectionDrop: n("CollectionDropRate", 1),
    itemWeight: n("ItemWeightRate", 1),
    staminaDrain: n("PlayerStaminaDecreaceRate", 1),
    maxBuildings: n("MaxBuildingLimitNum"),
    baseWorkers: n("BaseCampWorkerMaxNum"),
    basesPerGuild: n("BaseCampMaxNumInGuild"),
    guildSize: n("GuildPlayerMaxNum"),
    maxPlayers: n("ServerPlayerMaxNum"),
  };
}

export interface ServerRates {
  exp: number;
  capture: number;
  enemyDrop: number;
  collectionDrop: number;
  itemWeight: number;
  staminaDrain: number;
  maxBuildings: number;
  baseWorkers: number;
  basesPerGuild: number;
  guildSize: number;
  maxPlayers: number;
}

/** Lista de jogadores online, **sem IP**. */
export async function getPlayers(s: PalleiraServer): Promise<SafePlayer[]> {
  const raw = await call<{ players: RawPlayer[] }>(s, "players");
  return (raw.players ?? []).map(toSafePlayer);
}

interface RawPlayer {
  name: string;
  accountName: string;
  playerId: string;
  userId: string;
  iP: string; // ⚠️ descartado abaixo — nunca sai deste arquivo
  ping: number;
  level: number;
  location_x: number;
  location_y: number;
}

function toSafePlayer(p: RawPlayer): SafePlayer {
  return {
    name: p.name,
    accountName: p.accountName,
    playerId: p.playerId,
    userId: p.userId,
    platform: platformOf(p.userId ?? ""),
    ping: Math.round(p.ping ?? 0),
    level: p.level ?? 0,
    locationX: p.location_x ?? 0,
    locationY: p.location_y ?? 0,
  };
}

/**
 * Ações de admin (§3.1, §5.3) — a REST oficial escreve no mundo de verdade.
 * Todas passam pelo painel de moderação, nunca chamadas direto de página.
 */

/** Anúncio no chat do jogo. */
export const announce = (s: PalleiraServer, message: string) =>
  command(s, "announce", { message });

/** Expulsa o jogador; ele pode voltar a entrar. */
export const kickPlayer = (
  s: PalleiraServer,
  userid: string,
  message = "Expulso pela administração",
) => command(s, "kick", { userid, message });

/** Bane o jogador do servidor. */
export const banPlayer = (
  s: PalleiraServer,
  userid: string,
  message = "Banido pela administração",
) => command(s, "ban", { userid, message });

/** Reverte um ban. */
export const unbanPlayer = (s: PalleiraServer, userid: string) =>
  command(s, "unban", { userid });

/** Salva o mundo agora, sem esperar o autosave. */
export const saveWorld = (s: PalleiraServer) => command(s, "save");

/** Desliga com contagem regressiva — a mensagem aparece no chat do jogo. */
export const shutdownServer = (
  s: PalleiraServer,
  waittime: number,
  message: string,
) => command(s, "shutdown", { waittime, message });

/**
 * Snapshot do mundo — jogadores, bases e guilds numa chamada só (§3.4).
 *
 * ⚠️ ~360 KB por chamada, e os servidores rodam com CPU alta.
 * NUNCA chamar por visita de página: só via cron, com o resultado em cache.
 */
export async function getWorldSnapshot(
  s: PalleiraServer,
): Promise<WorldSnapshot> {
  const raw = await call<RawGameData>(s, "game-data", {
    timeoutMs: 30_000,
    revalidate: 0,
  });
  const actors = raw.ActorData ?? [];

  const players: SafePlayer[] = [];
  const bases: SafeBase[] = [];
  const guilds = new Map<string, SafeGuild>();

  const guildOf = (id: string, name: string) => {
    let g = guilds.get(id);
    if (!g) {
      g = { guildId: id, name: guildLabel(name), bases: 0, pals: 0 };
      guilds.set(id, g);
    }
    return g;
  };

  for (const a of actors) {
    if (a.GuildID) guildOf(a.GuildID, a.GuildName);

    if (a.Type === "PalBox") {
      bases.push({
        guildId: a.GuildID,
        guildName: guildLabel(a.GuildName),
        name: baseLabel(a.Name),
        locationX: a.LocationX,
        locationY: a.LocationY,
      });
      if (a.GuildID) guildOf(a.GuildID, a.GuildName).bases++;
      continue;
    }

    if (a.UnitType === "Player") {
      players.push({
        name: a.NickName,
        accountName: a.NickName,
        playerId: a.InstanceID,
        userId: a.userid ?? "",
        platform: platformOf(a.userid ?? ""),
        ping: 0,
        level: a.level ?? 0,
        locationX: a.LocationX,
        locationY: a.LocationY,
        guild: a.GuildName ? guildLabel(a.GuildName) : undefined,
      });
      continue;
    }

    if (a.UnitType === "BaseCampPal" || a.UnitType === "OtomoPal") {
      if (a.GuildID) guildOf(a.GuildID, a.GuildName).pals++;
    }
  }

  return {
    fps: Math.round(raw.FPS ?? 0),
    averageFps: Math.round(raw.AverageFPS ?? 0),
    inGameTime: raw.InGameTime ?? "",
    inGameDays: raw.InGameDays ?? 0,
    players,
    bases,
    guilds: [...guilds.values()]
      .filter((g) => g.bases > 0 || g.pals > 0)
      .sort((a, b) => b.pals - a.pals),
  };
}

interface RawActor {
  Type: string;
  UnitType: string;
  InstanceID: string;
  Name: string;
  NickName: string;
  Class: string;
  GuildID: string;
  GuildName: string;
  level: number;
  userid: string;
  ip: string; // ⚠️ presente no snapshot e descartado aqui
  LocationX: number;
  LocationY: number;
  LocationZ: number;
  AI_Action: string;
}

interface RawGameData {
  Time: string;
  FPS: number;
  AverageFPS: number;
  InGameTime: string;
  InGameDays: number;
  ActorData: RawActor[];
}
