/**
 * Cliente da REST API do PalDefender (§3.6 do PROMPT.md).
 *
 * É a fonte mais rica que temos, e a única que enxerga **jogador offline**
 * ao vivo — a REST oficial do jogo só mostra quem está conectado.
 *
 * ⚠️ REGRA DA §10.1: o `IP` vem no payload e MORRE AQUI DENTRO. Nada que sai
 * deste arquivo carrega endereço de ninguém.
 *
 * ⚠️ `/pals` e `/items` só respondem com o jogador ONLINE — o inventário só
 * existe na memória enquanto ele joga. Por isso o modelo de cofre da §7.3.
 */

import type { PalleiraServer } from "@/lib/servers";
import { normalizarUid } from "@/lib/palworld/uid";

/* ------------------------------------------------------------------- tipos */

export interface PdPlayer {
  name: string;
  /** Canônico: hex maiúsculo sem hífen (`lib/palworld/uid.ts`) */
  playerUid: string;
  userId: string;
  guildName: string;
  guildId: string;
  online: boolean;
  /** Coordenada já em escala de mapa — o PalDefender converte por nós */
  mapX: number;
  mapY: number;
  /**
   * Posição crua no mundo.
   *
   * ⚠️ Necessária para saber em qual mundo a pessoa está: o `MapLocation` que
   * o PalDefender devolve já vem convertido pela fórmula de **Palpagos**,
   * então quem estiver na Árvore Mundial chega aqui com coordenada de
   * Palpagos errada. Ver `lib/palworld/coordenadas.ts`.
   */
  worldX: number;
  worldY: number;
}

export interface PdBase {
  id: string;
  mapX: number;
  mapY: number;
  /**
   * Altitude no mundo. Serve para saber em qual mapa a base está: Palpagos
   * fica abaixo de ~18.000, e a Árvore Mundial (adicionada na 1.1) passa dos
   * 33.000. São mapas diferentes, com imagens diferentes.
   */
  worldZ: number;
}

export interface PdGuild {
  id: string;
  name: string;
  level: number;
  leaderName: string;
  /** Canônico, como todo UID que sai deste arquivo */
  leaderUid: string;
  memberCount: number;
  /** Canônicos — é assim que o mapa reconhece a base de quem está olhando */
  members: string[];
  bases: PdBase[];
}

/* ------------------------------------------------------------------ fetcher */

async function call<T>(
  server: PalleiraServer,
  path: string,
  revalidate = 60,
): Promise<T> {
  if (!server.palDefenderToken) {
    throw new Error(`Token do PalDefender ausente para ${server.slug}`);
  }

  const url = `http://${server.host}:${server.palDefenderPort}/v1/pdapi/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${server.palDefenderToken}` },
    signal: AbortSignal.timeout(20_000),
    // O servidor coleta o game-data a cada 60s; pedir mais rápido não traz
    // dado novo, só carga.
    next: { revalidate },
  });

  if (!res.ok) {
    throw new Error(`PalDefender ${path} → ${res.status} em ${server.slug}`);
  }
  return (await res.json()) as T;
}

/* --------------------------------------------------------------- jogadores */

interface RawPlayer {
  Name: string;
  IP: string; // ⚠️ descartado abaixo
  PlayerUID: string;
  UserId: string;
  GuildName: string;
  GuildUUID: string;
  Status: string;
  MapLocation?: { x: number; y: number };
  /** Posição crua. É dela que sai em qual mundo a pessoa está. */
  WorldLocation?: { x: number; y: number; z: number };
}

export async function getPlayers(server: PalleiraServer): Promise<PdPlayer[]> {
  const raw = await call<{ Players: RawPlayer[] }>(server, "players");
  return (raw.Players ?? []).map((p) => ({
    name: p.Name ?? "",
    // ⚠️ A API devolve com hífen e o save sem. Aqui vira canônico, para o
    // resto do site nunca precisar saber disso (uid.ts).
    playerUid: normalizarUid(p.PlayerUID),
    userId: p.UserId ?? "",
    guildName: guildLabel(p.GuildName),
    guildId: p.GuildUUID ?? "",
    online: p.Status === "Online",
    mapX: Math.round(p.MapLocation?.x ?? 0),
    mapY: Math.round(p.MapLocation?.y ?? 0),
    worldX: p.WorldLocation?.x ?? 0,
    worldY: p.WorldLocation?.y ?? 0,
  }));
}

/* ------------------------------------------------------------------ guilds */

interface RawGuild {
  name: string;
  Level: number;
  admin?: { id: string; name: string };
  camp_count: number;
  camps?: {
    id: string;
    map_pos?: { x: number; y: number };
    world_pos?: { x: number; y: number; z: number };
  }[];
  member_count: number;
  members?: string[];
}

export async function getGuilds(server: PalleiraServer): Promise<PdGuild[]> {
  const raw = await call<{ Guilds: Record<string, RawGuild> }>(
    server,
    "guilds",
    120,
  );

  return Object.entries(raw.Guilds ?? {}).map(([id, g]) => ({
    id,
    name: guildLabel(g.name),
    level: g.Level ?? 0,
    leaderName: g.admin?.name ?? "",
    leaderUid: normalizarUid(g.admin?.id),
    memberCount: g.member_count ?? 0,
    members: (g.members ?? []).map(normalizarUid),
    bases: (g.camps ?? []).map((c) => ({
      id: c.id,
      mapX: Math.round(c.map_pos?.x ?? 0),
      mapY: Math.round(c.map_pos?.y ?? 0),
      worldZ: Math.round(c.world_pos?.z ?? 0),
    })),
  }));
}

/* --------------------------------------------------------------- utilidades */

/** Acima disso, a base está na Árvore Mundial e não em Palpagos. */
export const ARVORE_MUNDIAL_Z = 25_000;

/** O jogo devolve "Unnamed Guild" cru; ninguém merece ler isso em português. */
function guildLabel(name: string | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean || clean === "Unnamed Guild") return "Guild sem nome";
  return clean;
}

/** Health check — útil para o painel admin saber se a API está de pé. */
export async function ping(server: PalleiraServer): Promise<string | null> {
  try {
    const v = await call<{ Version: { Version: string } }>(
      server,
      "version",
      300,
    );
    return v.Version?.Version ?? null;
  } catch {
    return null;
  }
}
