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
  /** Altura crua — o save não guarda relevo, então isto só presta enquanto
   *  vem de alguém pisando no chão agora (§ restauração paga). */
  worldZ: number;
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

/** O jogador não está com o jogo aberto — não é falha de servidor. */
export class ForaDoJogo extends Error {}

async function call<T>(
  server: PalleiraServer,
  path: string,
  revalidate: number | false = 60,
): Promise<T> {
  if (!server.palDefenderToken) {
    throw new Error(`Token do PalDefender ausente para ${server.slug}`);
  }

  const url = `http://${server.host}:${server.palDefenderPort}/v1/pdapi/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${server.palDefenderToken}` },
    signal: AbortSignal.timeout(20_000),
    // O servidor coleta o game-data a cada 60s; pedir mais rápido não traz
    // dado novo, só carga. `false` é para o inventário, que muda a cada
    // clique do jogador e não pode chegar velho na tela.
    ...(revalidate === false
      ? { cache: "no-store" as const }
      : { next: { revalidate } }),
  });

  if (!res.ok) {
    // Inventário de quem está fora do jogo devolve 400 com esta mensagem —
    // é resposta esperada, não defeito, e merece um erro próprio para a
    // tela poder explicar em vez de dizer "deu erro".
    const corpo = await res.text().catch(() => "");
    if (corpo.includes("APalPlayerController")) {
      throw new ForaDoJogo(`${server.shortName}: jogador não está no jogo`);
    }
    throw new Error(`PalDefender ${path} → ${res.status} em ${server.slug}`);
  }
  return (await res.json()) as T;
}

/* --------------------------------------------------------------- jogadores */

interface RawPlayer {
  Name: string;
  IP: string; // ⚠️ descartado abaixo
  PlayerUID: string;
  /**
   * `steam_…` / `gdk_…` / `ps5_…` — e **vem vazio para quem não está
   * conectado de verdade** (ver `online` mais abaixo).
   */
  UserId: string;
  GuildName: string;
  GuildUUID: string;
  Status: string;
  MapLocation?: { x: number; y: number };
  /** Posição crua. É dela que sai em qual mundo a pessoa está. */
  WorldLocation?: { x: number; y: number; z: number };
}

/**
 * Quem o servidor está vendo agora.
 *
 * `agora` pula o cache de 60s. Mapa e ranking podem viver com um minuto de
 * atraso; já quem abriu o cofre acabou de entrar no jogo e receberia "você
 * não está no jogo" por até um minuto — ver `ondeEstouOnline`.
 */
export async function getPlayers(
  server: PalleiraServer,
  agora = false,
): Promise<PdPlayer[]> {
  const raw = await call<{ Players: RawPlayer[] }>(
    server,
    "players",
    agora ? false : 60,
  );
  return (raw.Players ?? []).map((p) => ({
    name: p.Name ?? "",
    // ⚠️ A API devolve com hífen e o save sem. Aqui vira canônico, para o
    // resto do site nunca precisar saber disso (uid.ts).
    playerUid: normalizarUid(p.PlayerUID),
    userId: p.UserId ?? "",
    guildName: guildLabel(p.GuildName),
    guildId: p.GuildUUID ?? "",
    // 🔴 `Status: "Online"` sozinho MENTE. Medido em 23/08/2026: o PVE VIP
    // listava JAPA60HZ e Lincao como "Online" enquanto a REST oficial do
    // jogo dizia que não havia ninguém — e `/items` respondia "Failed to
    // find APalPlayerController" para os dois. Quem está mesmo no jogo tem
    // `UserId` (e IP) preenchidos; nos três servidores a correlação foi
    // exata, sem um único caso de "offline com UserId".
    //
    // Acreditar no Status faz o site oferecer vínculo e importação para
    // fantasma: a pessoa clica, o RCON responde "Failed to find player" e
    // ela leva a culpa por um erro que não é dela.
    online: p.Status === "Online" && Boolean(p.UserId),
    mapX: Math.round(p.MapLocation?.x ?? 0),
    mapY: Math.round(p.MapLocation?.y ?? 0),
    worldX: p.WorldLocation?.x ?? 0,
    worldY: p.WorldLocation?.y ?? 0,
    worldZ: p.WorldLocation?.z ?? 0,
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

/* ------------------------------------------------------------- inventário */

export interface PdItem {
  /** ItemID cru do jogo — a chave que o `giveitems` do RCON entende */
  itemId: string;
  qty: number;
}

export interface PdInventario {
  itens: PdItem[];
  usados: number;
  total: number;
}

interface RawContainer {
  Available: boolean;
  UsedSlots: number;
  MaxSlots: number;
  Slots: Record<string, { ItemID: string; Count: number }>;
}

/**
 * O que o jogador tem **na mochila**, agora.
 *
 * 📌 Só a mochila (`Items`), de propósito. A resposta traz seis
 * compartimentos — `Items`, `KeyItems`, `Weapons`, `Armor`, `Food` e
 * `DropSlot` —, mas equipamento em uso e item-chave não são coisa para
 * vender por engano. A regra fica fácil de explicar para a comunidade:
 * **põe na mochila o que você quer levar para o cofre**.
 *
 * ⚠️ Lança `ForaDoJogo` quando a pessoa não está conectada — o inventário só
 * existe na memória do servidor enquanto ela joga. É essa limitação que dá
 * origem ao cofre (§7.3).
 */
export async function getItems(
  server: PalleiraServer,
  uid: string,
): Promise<PdInventario> {
  // A rota aceita o UID nas duas grafias (testado em 23/08/2026 com e sem
  // hífen), então segue o canônico do site sem conversão nenhuma.
  const raw = await call<{ Inventory: Record<string, RawContainer> }>(
    server,
    `items/${normalizarUid(uid)}`,
    false,
  );

  const mochila = raw.Inventory?.Items;
  if (!mochila?.Available) return { itens: [], usados: 0, total: 0 };

  // Pilhas do mesmo item em slots diferentes viram uma linha só: para
  // vender, o que importa é quanto a pessoa tem, não onde está guardado.
  const somado = new Map<string, number>();
  for (const slot of Object.values(mochila.Slots ?? {})) {
    if (!slot?.ItemID || !slot.Count) continue;
    somado.set(slot.ItemID, (somado.get(slot.ItemID) ?? 0) + slot.Count);
  }

  return {
    itens: [...somado]
      .map(([itemId, qty]) => ({ itemId, qty }))
      .sort((a, b) => a.itemId.localeCompare(b.itemId)),
    usados: mochila.UsedSlots ?? 0,
    total: mochila.MaxSlots ?? 0,
  };
}

/* ------------------------------------------------------------------- pals */

/**
 * Um Pal exatamente como o jogo guarda — os mesmos campos que
 * `lib/pal-template.ts` usa para montar o arquivo de entrega.
 *
 * Fica solto (sem interface fechada) de propósito: a lista de campos que o
 * PalDefender devolve é maior que a que o `PalTemplate` aceita de volta
 * (`ImportedCharacter`, `WorkerSick`, `team_slot_index`…), e travar um tipo
 * aqui só duplicaria manutenção. Quem decide o que vira arquivo é
 * `pal-template.ts`, com um allowlist explícito.
 */
export type PalCru = Record<string, unknown> & {
  PalID: string;
  Nickname: string;
  Level: number;
  Gender: string;
  Shiny: boolean;
  CondensedPals: number;
};

export interface PalNoCofre {
  /** A chave do Pal dentro da resposta — não é o UID do dono */
  instanceId: string;
  pal: PalCru;
}

interface RawPals {
  Pals: {
    Team?: Record<string, PalCru>;
    Palbox?: Record<string, PalCru>;
    // BaseCamps existe na resposta, mas fica de fora do cofre nesta versão
    // (§7.3): tirar um Pal que está trabalhando numa base é uma operação
    // diferente, e a comunidade sente a base perder produção sem avisar.
  };
}

/**
 * Os Pals do time e da palbox — o que dá para levar para o cofre.
 *
 * 📌 Igual ao `getItems`, só o que está "na mochila" entra: `Team` e
 * `Palbox`, nunca `BaseCamps`.
 *
 * ⚠️ Lança `ForaDoJogo` quando a pessoa não está conectada — mesma
 * limitação do inventário, mesma origem para o cofre.
 */
export async function getPals(
  server: PalleiraServer,
  uid: string,
): Promise<PalNoCofre[]> {
  const raw = await call<RawPals>(server, `pals/${normalizarUid(uid)}`, false);

  const grupos = [raw.Pals?.Team, raw.Pals?.Palbox];
  const lista: PalNoCofre[] = [];
  for (const grupo of grupos) {
    for (const [instanceId, pal] of Object.entries(grupo ?? {})) {
      if (pal?.PalID) lista.push({ instanceId, pal });
    }
  }
  return lista;
}

/**
 * Só quantos Pals a pessoa tem, sem baixar os templates.
 *
 * O ranking precisa do número, não das fichas — e a resposta completa de
 * `pals/{uid}` é grande (cada Pal traz IVs, passivas, skills). O `Meta` já
 * vem com as contagens prontas, então aqui só se lê ele. Base inclusa: no
 * ranking o que importa é quantos Pals a pessoa tem no mundo, e não a regra
 * de custódia do cofre (§7.3), que ignora os que estão trabalhando.
 *
 * ⚠️ Lança `ForaDoJogo` para quem não está conectado, igual `getPals`.
 */
export async function contarPals(
  server: PalleiraServer,
  uid: string,
): Promise<number> {
  const raw = await call<{
    Meta?: { TeamCount?: number; PalboxCount?: number; BaseCampCount?: number };
  }>(server, `pals/${normalizarUid(uid)}`, false);

  const m = raw.Meta ?? {};
  return (m.TeamCount ?? 0) + (m.PalboxCount ?? 0) + (m.BaseCampCount ?? 0);
}

/** Um Pal específico, pelo `instanceId` que `getPals` devolveu. */
export async function getPal(
  server: PalleiraServer,
  uid: string,
  instanceId: string,
): Promise<PalCru | null> {
  const lista = await getPals(server, uid);
  return lista.find((p) => p.instanceId === instanceId)?.pal ?? null;
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
