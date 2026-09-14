import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { meuVinculo } from "@/lib/linking";
import { serverBySlug, activeServers } from "@/lib/servers";
import { getPlayers } from "@/lib/palworld/rest";
import { givePalTemplate } from "@/lib/palworld/rcon";
import { nomeDoArquivo, type PalTemplate } from "@/lib/pal-template";
import { dispararWorkflow } from "@/lib/github";
import { canPowerServer, levelOf } from "@/lib/roles";
import { nomesDe } from "@/lib/discord";

/**
 * Entrega manual de um Pal a partir de um JSON colado por staff — mesmo
 * mecanismo de duas fases do cofre (`lib/pal-cofre.ts::resgatarDoCofre` +
 * `continuarResgate`), mas sem passar pelo `vault_pals`: aqui o Pal nunca
 * existiu no site, o staff está injetando um do zero (ex: para testar a
 * Câmara de Purificação, ou repor um Pal perdido por engano do jogo).
 *
 * ⚠️ Descoberto em 14/09/2026, testando manualmente: `CondensedPals` não é
 * respeitado pelo `givepal_j` — o Pal sempre chega com condensação 0, não
 * importa o valor do JSON. `PalSouls` (Almas) funciona normalmente. Ver
 * memória do projeto para o achado completo.
 */

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/**
 * Restrito à cúpula (`canPowerServer`), mesmo nível de "Zona de risco" —
 * entregar Pal de graça é ação econômica sensível, não é moderação comum.
 */
async function exigirStaff(): Promise<{ ok: true; discordId: string } | Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só a cúpula pode entregar Pal manualmente." };
  }
  return { ok: true, discordId: session.user.discordId };
}

/**
 * Allowlist dos campos aceitos — mesmo espírito de `paraTemplate`: nunca
 * repassar o JSON colado direto pro banco. O staff pode digitar qualquer
 * coisa; só o que o `PalTemplate` documenta vira arquivo de verdade.
 */
function paraTemplateDeJson(bruto: unknown): PalTemplate | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  if (typeof o.PalID !== "string" || !o.PalID.trim()) return null;

  const num = (v: unknown, padrao = 0) => (typeof v === "number" ? v : padrao);
  const str = (v: unknown, padrao = "") => (typeof v === "string" ? v : padrao);
  const bool = (v: unknown) => v === true;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const obj = (v: unknown): Record<string, number> =>
    v && typeof v === "object" ? (v as Record<string, number>) : {};

  return {
    PalID: str(o.PalID),
    Nickname: str(o.Nickname),
    Gender: str(o.Gender, "Male"),
    Level: num(o.Level, 1) || 1,
    SkinId: str(o.SkinId),
    Shiny: bool(o.Shiny),
    Exp: num(o.Exp),
    PartnerSkillLevel: Math.max(1, num(o.PartnerSkillLevel, 1)),
    FriendshipPoints: num(o.FriendshipPoints),
    HP: num(o.HP, 100),
    SP: num(o.SP, 100),
    SAN: num(o.SAN, 100),
    Support: num(o.Support),
    CraftSpeed: num(o.CraftSpeed, 100),
    PalSouls: obj(o.PalSouls),
    IVs: obj(o.IVs),
    ActiveSkills: arr(o.ActiveSkills),
    LearntSkills: arr(o.LearntSkills),
    Passives: arr(o.Passives),
    CondensedPals: num(o.CondensedPals),
    ExtraWorkSuitabilities: obj(o.ExtraWorkSuitabilities),
    DisableWorkPreferences: arr(o.DisableWorkPreferences),
  };
}

const MAX_QUANTIDADE_POR_ENTREGA = 20;

/**
 * Fase 1: valida o JSON, acha o vínculo do jogador (pelo Discord ID) e abre
 * `quantidade` transferências — cada cópia precisa do próprio arquivo no
 * servidor (`givepal_j` lê um arquivo por vez), então dispara o GitHub
 * Actions uma vez por cópia. O RCON de verdade só acontece em
 * `continuarEntregaAdmin`, chamado depois para cada `transferId`.
 */
export async function entregarPalPorJson(
  discordIdDestino: string,
  jsonBruto: string,
  quantidade: number,
): Promise<Resultado & { transferIds?: number[] }> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return staff;

  const qtd = Math.floor(quantidade);
  if (!Number.isFinite(qtd) || qtd < 1) {
    return { ok: false, mensagem: "Quantidade precisa ser pelo menos 1." };
  }
  if (qtd > MAX_QUANTIDADE_POR_ENTREGA) {
    return { ok: false, mensagem: `No máximo ${MAX_QUANTIDADE_POR_ENTREGA} por vez.` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBruto);
  } catch {
    return { ok: false, mensagem: "JSON inválido — confira a vírgula ou chave faltando." };
  }

  const template = paraTemplateDeJson(parsed);
  if (!template) {
    return { ok: false, mensagem: "O JSON precisa ter pelo menos um PalID." };
  }

  const vinculo = await meuVinculo(discordIdDestino.trim());
  if (!vinculo) {
    return { ok: false, mensagem: "Esse Discord ID não tem personagem vinculado." };
  }
  const server = serverBySlug(vinculo.serverSlug);
  if (!server) {
    return { ok: false, mensagem: "Servidor do vínculo é inválido." };
  }

  // As `qtd` cópias abrem em paralelo — disparar o Actions uma a uma em
  // série (como era antes) fazia 20 cópias levarem 20x o tempo de uma só
  // chamada, e a action só devolvia a resposta depois do loop inteiro:
  // clicar "Entregar" de novo enquanto isso rodava parecia travado.
  const resultados = await Promise.allSettled(
    Array.from({ length: qtd }, async () => {
      const [{ id: transferId }] = (await sql`
        insert into pal_transfers
          (discord_id, server_slug, palworld_uid, template, direction, status, arquivo)
        values (${discordIdDestino.trim()}, ${vinculo.serverSlug}, ${vinculo.uid},
                ${JSON.stringify(template)}, 'resgatar', 'aguardando_arquivo', '')
        returning id
      `) as { id: number }[];

      const arquivo = nomeDoArquivo(transferId);
      await sql`update pal_transfers set arquivo = ${arquivo} where id = ${transferId}`;

      try {
        await dispararWorkflow("deliver-pal-template.yml", {
          transfer_id: String(transferId),
          modo: "aplicar",
        });
        return transferId;
      } catch (e) {
        await sql`update pal_transfers set status = 'falhou', detail = ${(e instanceof Error ? e.message : String(e)).slice(0, 500)}, finished_at = now() where id = ${transferId}`;
        throw e;
      }
    }),
  );

  const transferIds = resultados
    .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
    .map((r) => r.value);

  if (transferIds.length === 0) {
    return { ok: false, mensagem: "Não consegui disparar o Actions agora. Tente de novo." };
  }

  return {
    ok: true,
    mensagem: `Entregando ${transferIds.length} para ${vinculo.playerName} (${server.shortName})…`,
    transferIds,
  };
}

export interface StatusEntrega {
  status: string;
  detail: string;
  palId: string;
}

/** Estado de uma entrega — para a tela que fica de olho, com o `transferId` já em mãos (staff, não é o dono do Pal). */
export async function statusEntregaAdmin(transferId: number): Promise<StatusEntrega | null> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return null;

  const rows = (await sql`
    select status, detail, template->>'PalID' as pal_id
    from pal_transfers
    where id = ${transferId}
  `) as { status: string; detail: string; pal_id: string }[];
  return rows[0] ? { status: rows[0].status, detail: rows[0].detail, palId: rows[0].pal_id } : null;
}

/**
 * Fase 2: chamado pelo polling da tela de admin quando o arquivo está
 * pronto. Faz o `givepal_j` de verdade — mesma lógica de
 * `lib/pal-cofre.ts::continuarResgate`, sem exigir dono (é staff).
 */
export async function continuarEntregaAdmin(transferId: number): Promise<StatusEntrega | null> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return null;

  const rows = (await sql`
    select server_slug, palworld_uid, arquivo, status, template->>'PalID' as pal_id
    from pal_transfers
    where id = ${transferId}
  `) as {
    server_slug: string;
    palworld_uid: string;
    arquivo: string | null;
    status: string;
    pal_id: string;
  }[];
  const t = rows[0];
  if (!t) return null;
  if (t.status !== "arquivo_pronto") {
    return { status: t.status, detail: "", palId: t.pal_id };
  }

  const server = serverBySlug(t.server_slug);
  if (!server?.rconPort || !t.arquivo) {
    return { status: t.status, detail: "", palId: t.pal_id };
  }

  let resposta;
  try {
    resposta = await givePalTemplate(server, t.palworld_uid, t.arquivo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`update pal_transfers set detail = ${`RCON sem resposta: ${msg}`.slice(0, 500)} where id = ${transferId}`;
    return { status: "arquivo_pronto", detail: "sem resposta do servidor", palId: t.pal_id };
  }

  if (!resposta.ok) {
    await sql`
      update pal_transfers set status = 'falhou', detail = ${resposta.resposta.slice(0, 500)}, finished_at = now()
      where id = ${transferId} and status = 'arquivo_pronto'
    `;
    return { status: "falhou", detail: resposta.resposta, palId: t.pal_id };
  }

  await sql`
    update pal_transfers set status = 'concluido', detail = ${resposta.resposta.slice(0, 500)}, finished_at = now()
    where id = ${transferId} and status = 'arquivo_pronto'
  `;
  return { status: "concluido", detail: resposta.resposta, palId: t.pal_id };
}

export interface JogadorOnline {
  discordId: string;
  nome: string;
  serverSlug: string;
  serverName: string;
}

/**
 * Quem está no jogo agora, entre quem já vinculou o Discord — para o
 * dropdown de "Entregar Pal manual" escolher em vez de colar o ID cru.
 * Cruza `account_links` com o REST oficial (`getPlayers`, só online) de
 * cada servidor ativo.
 */
export async function jogadoresOnlineParaEntrega(): Promise<JogadorOnline[]> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return [];

  const vinculos = (await sql`
    select discord_id, server_slug, palworld_uid from account_links
  `) as { discord_id: string; server_slug: string; palworld_uid: string }[];
  if (vinculos.length === 0) return [];

  const porUid = new Map(vinculos.map((v) => [v.palworld_uid, v]));

  const achados: JogadorOnline[] = [];
  await Promise.all(
    activeServers().map(async (server) => {
      try {
        const online = await getPlayers(server);
        for (const p of online) {
          const vinculo = porUid.get(p.playerId);
          if (!vinculo || vinculo.server_slug !== server.slug) continue;
          achados.push({
            discordId: vinculo.discord_id,
            nome: p.name,
            serverSlug: server.slug,
            serverName: server.shortName,
          });
        }
      } catch {
        // Servidor mudo não derruba a lista dos outros.
      }
    }),
  );

  const nomes = await nomesDe(achados.map((a) => a.discordId)).catch(() => new Map<string, string>());
  return achados.map((a) => ({ ...a, nome: nomes.get(a.discordId) ?? a.nome }));
}
