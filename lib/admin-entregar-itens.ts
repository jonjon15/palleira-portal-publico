import { auth } from "@/auth";
import { canPowerServer, levelOf } from "@/lib/roles";
import { serverBySlug, activeServers } from "@/lib/servers";
import { getPlayers } from "@/lib/palworld/rest";
import { giveItems } from "@/lib/palworld/rcon";
import { nomesDe } from "@/lib/discord";
import { nomeDoItem } from "@/lib/itens";

/**
 * Entrega manual de itens — a versão mascarada do `/giveitems` do jogo
 * (síntese literal de Config → RCON → GameServer, ver `lib/palworld/rcon.ts`).
 *
 * Diferente de "Entregar Pal manual", não passa por fila nem GitHub Actions:
 * `giveitems` é RCON puro, sem arquivo para escrever no servidor primeiro —
 * mesma lógica de `delItems`/`giveItems`, já usados pelo cofre. Por isso a
 * entrega acontece toda aqui, sem os dois estágios que o Pal precisa.
 *
 * ⚠️ Exige o jogador **online**: o comando procura o UserId no mundo antes de
 * agir, igual a `delitems`/`deletepals`. Por isso a tela só deixa escolher
 * entre quem está no jogo agora — não dá para mandar para quem está offline.
 */

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/** Mesmo nível de "Entregar Pal manual" — dar item de graça é econômico, não é moderação comum. */
async function exigirStaff(): Promise<{ ok: true; discordId: string } | Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só a cúpula pode entregar item manualmente." };
  }
  return { ok: true, discordId: session.user.discordId };
}

export interface JogadorOnlineParaItens {
  discordId: string;
  nome: string;
  uid: string;
  serverSlug: string;
  serverName: string;
}

/**
 * Quem está no jogo agora, para o multi-select da tela — igual a
 * `jogadoresOnlineParaEntrega`, mas carregando também o `playerId` (uid): a
 * entrega de item é direta por RCON, sem passar pelo vínculo/`account_links`
 * de novo depois.
 */
export async function jogadoresOnlineParaItens(): Promise<JogadorOnlineParaItens[]> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return [];

  const { sql } = await import("@/lib/db");
  const vinculos = (await sql`
    select discord_id, server_slug, palworld_uid from account_links
  `) as { discord_id: string; server_slug: string; palworld_uid: string }[];
  if (vinculos.length === 0) return [];

  const porUid = new Map(vinculos.map((v) => [v.palworld_uid, v]));

  const achados: JogadorOnlineParaItens[] = [];
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
            uid: p.playerId,
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

export interface ItemPedido {
  itemId: string;
  quantidade: number;
}

export interface ResultadoEntrega {
  discordId: string;
  nome: string;
  itemId: string;
  quantidade: number;
  ok: boolean;
  resposta: string;
}

const MAX_JOGADORES_POR_ENTREGA = 20;
const MAX_ITENS_POR_ENTREGA = 20;
const MAX_QUANTIDADE_POR_ITEM = 99_999;

/**
 * Entrega o mesmo lote de itens a uma lista de jogadores — todos já
 * conferidos como online pela própria tela (`jogadoresOnlineParaItens`).
 *
 * Cada par (jogador × item) é um comando RCON separado: `giveitems` aceita
 * vários `ItemId:Qty` numa linha só, mas a resposta do PalDefender não diz
 * qual item específico falhou dentro do lote — só "sucesso" ou o motivo de
 * uma falha geral. Rodar um item por vez custa mais chamadas, mas o log e o
 * extrato mostram exatamente o que chegou e o que não chegou, item a item,
 * jogador a jogador — o mesmo raciocínio de `interpretar()` em `rcon.ts`:
 * entre facilitar o motor e facilitar auditar o que já rodou, ganha auditar.
 */
export async function entregarItensParaJogadores(
  alvos: { discordId: string; nome: string; uid: string; serverSlug: string }[],
  itens: ItemPedido[],
): Promise<{ ok: boolean; mensagem: string; resultados: ResultadoEntrega[] }> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return { ...staff, resultados: [] };

  if (alvos.length === 0) {
    return { ok: false, mensagem: "Escolha ao menos um jogador.", resultados: [] };
  }
  if (alvos.length > MAX_JOGADORES_POR_ENTREGA) {
    return {
      ok: false,
      mensagem: `No máximo ${MAX_JOGADORES_POR_ENTREGA} jogadores por vez.`,
      resultados: [],
    };
  }
  if (itens.length === 0) {
    return { ok: false, mensagem: "Adicione ao menos um item.", resultados: [] };
  }
  if (itens.length > MAX_ITENS_POR_ENTREGA) {
    return {
      ok: false,
      mensagem: `No máximo ${MAX_ITENS_POR_ENTREGA} itens diferentes por vez.`,
      resultados: [],
    };
  }
  for (const it of itens) {
    if (!it.itemId.trim()) {
      return { ok: false, mensagem: "Um dos itens está sem ID.", resultados: [] };
    }
    if (!Number.isInteger(it.quantidade) || it.quantidade < 1 || it.quantidade > MAX_QUANTIDADE_POR_ITEM) {
      return {
        ok: false,
        mensagem: `Quantidade de "${nomeDoItem(it.itemId)}" inválida — use um número entre 1 e ${MAX_QUANTIDADE_POR_ITEM}.`,
        resultados: [],
      };
    }
  }

  // Um jogador pode estar num servidor diferente do outro — resolve o
  // `PalleiraServer` de cada um antes de disparar, para falhar cedo se
  // algum slug parar de existir entre a listagem e o clique.
  const servidorPorSlug = new Map(alvos.map((a) => [a.serverSlug, serverBySlug(a.serverSlug)]));
  for (const [slug, srv] of servidorPorSlug) {
    if (!srv) {
      return { ok: false, mensagem: `Servidor inválido: ${slug}.`, resultados: [] };
    }
  }

  const resultados: ResultadoEntrega[] = [];
  await Promise.all(
    alvos.map(async (alvo) => {
      const server = servidorPorSlug.get(alvo.serverSlug)!;
      for (const it of itens) {
        try {
          const r = await giveItems(server, alvo.uid, it.itemId.trim(), it.quantidade);
          resultados.push({
            discordId: alvo.discordId,
            nome: alvo.nome,
            itemId: it.itemId.trim(),
            quantidade: it.quantidade,
            ok: r.ok,
            resposta: r.resposta,
          });
        } catch (e) {
          resultados.push({
            discordId: alvo.discordId,
            nome: alvo.nome,
            itemId: it.itemId.trim(),
            quantidade: it.quantidade,
            ok: false,
            resposta: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }),
  );

  const falhas = resultados.filter((r) => !r.ok);
  const sucesso = falhas.length === 0;

  return {
    ok: sucesso,
    mensagem: sucesso
      ? `${itens.length} item(ns) entregue(s) para ${alvos.length} jogador(es).`
      : `${resultados.length - falhas.length} de ${resultados.length} entregas deram certo — ${falhas.length} falharam. Confira abaixo.`,
    resultados,
  };
}
