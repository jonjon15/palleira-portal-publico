import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { meuVinculo } from "@/lib/linking";
import { serverBySlug, activeServers } from "@/lib/servers";
import { getItems, getPlayers, ForaDoJogo } from "@/lib/palworld/paldefender";
import { delItems, giveItems } from "@/lib/palworld/rcon";
import { podeNegociar, motivoDoBloqueio } from "@/lib/itens";
import { lancar } from "@/lib/economia";
import { precoDoSlot } from "@/lib/cofre-regras";
import { slotsGratisDoCofre } from "@/lib/roles";

/**
 * O cofre na nuvem (§7.3 do PROMPT.md).
 *
 * Por que ele existe: `GET /items/{uid}` do PalDefender **só responde com o
 * jogador online**. Se o anúncio lesse o inventário na hora da venda, ninguém
 * compraria de madrugada e toda transação exigiria as duas pessoas no jogo ao
 * mesmo tempo. Com o cofre, o item sai do jogo uma vez, fica em custódia do
 * site, e é vendido a qualquer hora com os dois lados offline.
 *
 * ```
 * JOGO ──importar──▶ COFRE ──vender──▶ COMPRADOR ──resgatar──▶ JOGO
 * ```
 *
 * 🔴 **A ordem das operações nunca inverte.** Antes de qualquer comando no
 * jogo, grava-se a intenção em `vault_transfers`. É o que separa "o item
 * sumiu e ninguém sabe" de "o item está nesta linha, com a resposta do
 * servidor ao lado".
 */

export { precoDoSlot } from "@/lib/cofre-regras";
export { slotsGratisDoCofre } from "@/lib/roles";

export interface ItemNoCofre {
  itemId: string;
  qty: number;
  desde: string;
  /** De qual servidor este lote saiu — trava de mercado (migração 014). */
  serverSlug: string;
  serverNome: string;
}

export interface EstadoDoCofre {
  itens: ItemNoCofre[];
  /** Cada tipo de item ocupa um slot, não importa a quantidade da pilha */
  usados: number;
  total: number;
  precoDoProximo: number;
}

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/**
 * A chave de servidor que a pilha efetivamente usa no cofre (migração 014).
 *
 * String vazia = "livre": o item circula entre qualquer servidor que não
 * seja `mercadoRestrito` — exatamente o pool único que sempre existiu entre
 * PVE Free e PVE VIP, sem mudança de comportamento para quem já usa o cofre.
 * Só um servidor `mercadoRestrito` (hoje, só o Dominantes) grava sua
 * própria chave e trava de verdade a pilha nele.
 */
export const chaveDeServidor = (serverSlug: string): string =>
  serverBySlug(serverSlug)?.mercadoRestrito ? serverSlug : "";

/* ------------------------------------------------------------------ leitura */

export async function meuCofre(
  discordId: string,
  roles: string[],
): Promise<EstadoDoCofre> {
  const [itens, extras] = await Promise.all([
    sql`
      select item_id, qty, updated_at, server_slug
      from vault_items
      where discord_id = ${discordId} and qty > 0
      order by updated_at desc
    ` as unknown as Promise<
      { item_id: string; qty: number; updated_at: string; server_slug: string }[]
    >,
    // Os slots comprados vivem no próprio extrato: cada compra é uma linha
    // de origem "slot". Uma fonte da verdade a menos para divergir.
    sql`
      select count(*)::int as n
      from ledger
      where discord_id = ${discordId} and kind = 'slot'
    ` as unknown as Promise<{ n: number }[]>,
  ]);

  const gratis = slotsGratisDoCofre(roles);
  const total = gratis + (extras[0]?.n ?? 0);
  return {
    itens: itens.map((i) => ({
      itemId: i.item_id,
      qty: i.qty,
      desde: i.updated_at,
      serverSlug: i.server_slug,
      serverNome: i.server_slug
        ? (serverBySlug(i.server_slug)?.shortName ?? i.server_slug)
        : "qualquer servidor livre",
    })),
    usados: itens.length,
    total,
    precoDoProximo: precoDoSlot(total + 1, gratis),
  };
}

export interface PersonagemOnline {
  serverSlug: string;
  serverName: string;
  name: string;
}

/**
 * Onde a pessoa está com o jogo aberto agora.
 *
 * Importar e resgatar mexem no inventário, e os dois comandos procuram o
 * jogador antes de agir — então só faz sentido oferecer o servidor em que ela
 * realmente está. O `online` daqui já é o sinal confiável: `Status` mais
 * `UserId` preenchido (ver `paldefender.ts`).
 */
export async function ondeEstouOnline(
  discordId: string,
): Promise<PersonagemOnline[]> {
  const vinculo = await meuVinculo(discordId);
  if (!vinculo) return [];

  const achados: PersonagemOnline[] = [];
  await Promise.all(
    activeServers().map(async (server) => {
      if (!server.rconPort) return; // sem RCON não há como mover item
      try {
        // `true` = sem cache: quem abre esta tela acabou de entrar no jogo,
        // e um minuto de resposta velha vira "você não está no jogo agora"
        // com a pessoa olhando o próprio personagem na frente dela.
        const eu = (await getPlayers(server, true)).find(
          (p) => p.playerUid === vinculo.uid && p.online,
        );
        if (eu) {
          achados.push({
            serverSlug: server.slug,
            serverName: server.shortName,
            name: eu.name,
          });
        }
      } catch {
        // Servidor mudo não pode derrubar a lista dos outros.
      }
    }),
  );
  return achados;
}

export interface ItemNoJogo {
  itemId: string;
  qty: number;
  negociavel: boolean;
  motivo: string;
}

/** A mochila do jogador naquele servidor, para ele escolher o que guardar. */
export async function inventarioNoJogo(
  discordId: string,
  serverSlug: string,
): Promise<{ itens: ItemNoJogo[]; erro: string }> {
  const vinculo = await meuVinculo(discordId);
  const server = serverBySlug(serverSlug);
  if (!vinculo || !server) {
    return { itens: [], erro: "Vincule seu personagem primeiro." };
  }

  try {
    const inv = await getItems(server, vinculo.uid);
    return {
      itens: inv.itens.map((i) => ({
        itemId: i.itemId,
        qty: i.qty,
        negociavel: podeNegociar(i.itemId),
        motivo: podeNegociar(i.itemId) ? "" : motivoDoBloqueio(i.itemId),
      })),
      erro: "",
    };
  } catch (e) {
    if (e instanceof ForaDoJogo) {
      return {
        itens: [],
        erro: "Você precisa estar com o jogo aberto nesse servidor para o site enxergar sua mochila.",
      };
    }
    return {
      itens: [],
      erro: "Não consegui falar com o servidor agora. Tente de novo em instantes.",
    };
  }
}

/* ------------------------------------------------------------------ slots */

/**
 * Compra o próximo slot.
 *
 * A chave de idempotência é o **número do slot**, não um sorteio: dois
 * cliques rápidos tentam comprar o slot 4 duas vezes, e o segundo esbarra na
 * chave em vez de cobrar de novo.
 */
export async function comprarSlot(
  discordId: string,
  roles: string[],
): Promise<Resultado> {
  const cofre = await meuCofre(discordId, roles);
  const numero = cofre.total + 1;
  const preco = precoDoSlot(numero, slotsGratisDoCofre(roles));

  const r = await lancar({
    discordId,
    delta: -preco,
    origem: "slot",
    descricao: `Slot ${numero} do cofre`,
    refId: String(numero),
    chave: `slot:${discordId}:${numero}`,
  });

  if (r.status === "sem-saldo") {
    return {
      ok: false,
      mensagem: `O slot ${numero} custa ${preco} Paletas e você tem ${r.saldo}.`,
    };
  }
  if (r.status === "repetido") {
    return { ok: false, mensagem: "Esse slot já foi comprado." };
  }
  return {
    ok: true,
    mensagem: `Slot ${numero} liberado por ${preco} Paletas. Saldo: ${r.saldo}.`,
  };
}

/* -------------------------------------------------------------- movimento */

/** Abre a linha de intenção ANTES de o jogo ser tocado. Devolve o id dela. */
async function abrirTransferencia(dados: {
  discordId: string;
  serverSlug: string;
  uid: string;
  direcao: "importar" | "resgatar";
  itemId: string;
  qty: number;
}): Promise<number> {
  const rows = (await sql`
    insert into vault_transfers
      (discord_id, server_slug, palworld_uid, direction, item_id, qty)
    values (${dados.discordId}, ${dados.serverSlug}, ${dados.uid},
            ${dados.direcao}, ${dados.itemId}, ${dados.qty})
    returning id
  `) as { id: number }[];
  return rows[0].id;
}

const fecharTransferencia = (id: number, status: string, detail: string) =>
  sql`
    update vault_transfers
       set status = ${status}, detail = ${detail.slice(0, 500)},
           finished_at = now()
     where id = ${id}
  `;

/**
 * Soma ao cofre, criando a pilha se ainda não existir.
 *
 * `serverSlug` faz parte da chave (migração 014): a mesma pessoa pode ter
 * pilhas separadas do mesmo item vindas de servidores diferentes — elas não
 * se somam, porque não podem trocar de mãos entre si no mercado.
 */
const creditarCofre = (
  discordId: string,
  itemId: string,
  qty: number,
  serverSlug: string,
) =>
  sql`
    insert into vault_items (discord_id, item_id, qty, server_slug)
    values (${discordId}, ${itemId}, ${qty}, ${serverSlug})
    on conflict (discord_id, item_id, server_slug) do update
      set qty = vault_items.qty + excluded.qty,
          updated_at = now()
  `;

/**
 * Tira do cofre, numa instrução só.
 *
 * O `where qty >= ...` é a trava: dois cliques simultâneos não conseguem
 * sacar a mesma pilha duas vezes, porque o segundo não encontra linha para
 * atualizar. Pilha zerada some — e o slot fica livre de novo.
 *
 * ⚠️ É por causa desta instrução que a coluna aceita zero. Sacar a pilha
 * inteira passa por `qty = 0` antes de a linha ser apagada, e um
 * `check (qty > 0)` derrubava a operação com erro de banco — quebrando
 * justamente o caso mais comum, resgatar tudo (migração 003).
 */
async function debitarCofre(
  discordId: string,
  itemId: string,
  qty: number,
  serverSlug: string,
): Promise<boolean> {
  const rows = (await sql`
    update vault_items
       set qty = qty - ${qty}, updated_at = now()
     where discord_id = ${discordId} and item_id = ${itemId}
       and server_slug = ${serverSlug} and qty >= ${qty}
    returning qty
  `) as { qty: number }[];

  if (!rows.length) return false;
  if (rows[0].qty === 0) {
    await sql`
      delete from vault_items
      where discord_id = ${discordId} and item_id = ${itemId}
        and server_slug = ${serverSlug} and qty = 0
    `;
  }
  return true;
}

/**
 * Jogo → cofre.
 *
 * A sequência importa: confere a posse, abre a transferência, **só então**
 * tira do jogo, e credita o cofre depois da confirmação. Se o comando
 * responder "Failed", nada foi tirado e a linha fecha como falha. Se a
 * conexão cair sem resposta, a linha fica em `andando` — que é a verdade:
 * não dá para afirmar que o item saiu nem que ficou, e o admin decide com a
 * resposta crua na mão.
 */
export async function importarParaCofre(
  serverSlug: string,
  itemId: string,
  qty: number,
): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, mensagem: "Quantidade inválida." };
  }
  if (!podeNegociar(itemId)) {
    return { ok: false, mensagem: motivoDoBloqueio(itemId) };
  }

  const vinculo = await meuVinculo(discordId);
  if (!vinculo) {
    return {
      ok: false,
      mensagem: "Vincule seu personagem antes de usar o cofre.",
    };
  }
  const server = serverBySlug(serverSlug);
  if (!server?.rconPort) {
    return { ok: false, mensagem: "Esse servidor não move item agora." };
  }

  // 1. Conferir a posse na fonte — nunca no que o navegador mandou.
  let temNaMochila = 0;
  try {
    const inv = await getItems(server, vinculo.uid);
    temNaMochila = inv.itens.find((i) => i.itemId === itemId)?.qty ?? 0;
  } catch (e) {
    return {
      ok: false,
      mensagem:
        e instanceof ForaDoJogo
          ? "Você precisa estar no jogo nesse servidor para guardar item."
          : "Não consegui ler sua mochila agora. Tente de novo em instantes.",
    };
  }
  if (temNaMochila < qty) {
    return {
      ok: false,
      mensagem: `Você tem ${temNaMochila} na mochila, não ${qty}. Recarregue a página.`,
    };
  }

  // 2. O slot só é cobrado quando a pilha é nova no cofre — pilha aqui já
  //    quer dizer (item, chave de servidor): só o Dominantes separa pilha
  //    por servidor (migração 014); os demais continuam no pool "livre"
  //    (`chaveDeServidor` — comportamento idêntico ao que sempre existiu
  //    entre PVE Free e PVE VIP).
  const chave = chaveDeServidor(serverSlug);
  const cofre = await meuCofre(discordId, session.user.roles);
  const jaTem = cofre.itens.some(
    (i) => i.itemId === itemId && i.serverSlug === chave,
  );
  if (!jaTem && cofre.usados >= cofre.total) {
    return {
      ok: false,
      mensagem: `Seu cofre está cheio (${cofre.usados}/${cofre.total}). Compre um slot ou junte tudo numa pilha que já existe.`,
    };
  }

  // 3. Intenção gravada antes de o jogo ser tocado.
  const transferencia = await abrirTransferencia({
    discordId,
    serverSlug,
    uid: vinculo.uid,
    direcao: "importar",
    itemId,
    qty,
  });

  let resposta;
  try {
    resposta = await delItems(server, vinculo.uid, itemId, qty);
  } catch (e) {
    // Sem resposta: pode ter executado ou não. `andando` é o estado honesto.
    const msg = e instanceof Error ? e.message : String(e);
    await fecharTransferencia(transferencia, "andando", `sem resposta: ${msg}`);
    return {
      ok: false,
      mensagem:
        "O servidor não respondeu. Confira sua mochila no jogo antes de tentar de novo — o registro ficou aberto para a administração conferir.",
    };
  }

  if (!resposta.ok) {
    await fecharTransferencia(transferencia, "falhou", resposta.resposta);
    return {
      ok: false,
      mensagem: "O jogo recusou a retirada. Nada foi movido.",
    };
  }

  await creditarCofre(discordId, itemId, qty, chave);
  await fecharTransferencia(transferencia, "concluido", resposta.resposta);
  return { ok: true, mensagem: `${qty}× guardado no cofre.` };
}

/**
 * Cofre → jogo.
 *
 * Debita **antes** de entregar, de propósito: se a entrega falhar de verdade,
 * o item volta para o cofre e ninguém perde nada. A ordem inversa criaria a
 * chance de entregar e não conseguir debitar — e aí o item existiria duas
 * vezes, no jogo e no cofre.
 */
export async function resgatarDoCofre(
  serverSlug: string,
  itemId: string,
  qty: number,
): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, mensagem: "Quantidade inválida." };
  }

  const vinculo = await meuVinculo(discordId);
  if (!vinculo) {
    return { ok: false, mensagem: "Vincule seu personagem primeiro." };
  }

  const server = serverBySlug(serverSlug);
  if (!server?.rconPort) {
    return { ok: false, mensagem: "Esse servidor não move item agora." };
  }

  // Resgatar num servidor `mercadoRestrito` só tira da pilha travada nele; nos
  // demais, a pilha é a "livre" — mesmo pool único de sempre entre eles.
  const chave = chaveDeServidor(serverSlug);
  if (!(await debitarCofre(discordId, itemId, qty, chave))) {
    return {
      ok: false,
      mensagem: chave
        ? `Você não tem essa quantidade guardada vinda do ${server.shortName}.`
        : "Você não tem essa quantidade no cofre.",
    };
  }

  const transferencia = await abrirTransferencia({
    discordId,
    serverSlug,
    uid: vinculo.uid,
    direcao: "resgatar",
    itemId,
    qty,
  });

  let resposta;
  try {
    resposta = await giveItems(server, vinculo.uid, itemId, qty);
  } catch (e) {
    // ⚠️ Aqui NÃO se devolve ao cofre. Sem resposta, a entrega pode ter
    // acontecido — devolver criaria uma segunda cópia do item. Fica aberto
    // para a administração conferir com a resposta crua ao lado.
    const msg = e instanceof Error ? e.message : String(e);
    await fecharTransferencia(transferencia, "andando", `sem resposta: ${msg}`);
    return {
      ok: false,
      mensagem:
        "O servidor não respondeu. Confira sua mochila no jogo: se o item não chegou, a administração devolve pelo registro que ficou aberto.",
    };
  }

  if (!resposta.ok) {
    await creditarCofre(discordId, itemId, qty, chave);
    await fecharTransferencia(transferencia, "falhou", resposta.resposta);
    return {
      ok: false,
      mensagem:
        "O jogo recusou a entrega — talvez a mochila esteja cheia. O item continua no seu cofre.",
    };
  }

  await fecharTransferencia(transferencia, "concluido", resposta.resposta);
  return { ok: true, mensagem: `${qty}× entregue no jogo.` };
}

/* ------------------------------------------------- uso interno do mercado */

/**
 * Devolve ao cofre sem passar pelo jogo.
 *
 * É como o anúncio cancelado volta para o dono e como a compra chega ao
 * comprador: nesses dois casos o item nunca saiu da custódia do site.
 */
export const devolverAoCofre = creditarCofre;

/** Quantas pilhas a pessoa tem guardadas — o mercado checa antes de entregar. */
export async function cofreCheio(
  discordId: string,
  roles: string[],
): Promise<boolean> {
  const c = await meuCofre(discordId, roles);
  return c.usados >= c.total;
}

export async function temPilha(
  discordId: string,
  itemId: string,
  serverSlug: string,
): Promise<boolean> {
  const rows = (await sql`
    select 1 from vault_items
    where discord_id = ${discordId} and item_id = ${itemId}
      and server_slug = ${serverSlug} and qty > 0
  `) as unknown[];
  return rows.length > 0;
}

export { debitarCofre };
