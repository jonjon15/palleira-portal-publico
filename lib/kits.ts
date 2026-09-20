import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { canPowerServer, levelOf } from "@/lib/roles";
import { activeServers, serverBySlug } from "@/lib/servers";
import { getPlayers } from "@/lib/palworld/paldefender";
import { giveItems } from "@/lib/palworld/rcon";
import { lancar } from "@/lib/economia";
import { meuVinculo } from "@/lib/linking";
import { nomeDoItem } from "@/lib/itens";

/**
 * Kits da loja — o lote de itens que a cúpula monta e o jogador compra com
 * Paletas (§7 do PROMPT.md, decidido com o dono em 20/09/2026).
 *
 * Três coisas separam kit de anúncio do mercado, e é por isso que ele tem
 * tabela própria (ver `db/migrations/024-kits-da-loja.sql`):
 *
 *   1. **Estoque infinito.** O mesmo kit é vendido quantas vezes aparecer
 *      comprador; anúncio é peça única e some quando alguém leva.
 *   2. **Nasce do nada.** Não sai do cofre de ninguém — por isso a Paleta
 *      paga é queimada inteira, em vez de virar receita de um vendedor.
 *      Item criado do nada + Paleta criada do nada seria inflação nas duas
 *      pontas.
 *   3. **Entrega na hora, dentro do jogo.** `giveitems` por RCON, sem passar
 *      pelo cofre — daí a exigência de estar online, que o comando do jogo
 *      impõe (ele procura o jogador no mundo antes de entregar).
 */

export interface ItemDoKit {
  itemId: string;
  quantidade: number;
}

export interface Kit {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  itens: ItemDoKit[];
  ativo: boolean;
}

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

const MAX_ITENS_POR_KIT = 30;
const MAX_QUANTIDADE_POR_ITEM = 99_999;

/* ----------------------------------------------------------------- leitura */

interface KitRow {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  itens: ItemDoKit[];
  ativo: boolean;
}

const paraKit = (r: KitRow): Kit => ({
  id: r.id,
  nome: r.nome,
  descricao: r.descricao,
  preco: r.preco,
  itens: r.itens,
  ativo: r.ativo,
});

/** Os kits à venda — o que a vitrine do mercado mostra. */
export async function kitsAtivos(): Promise<Kit[]> {
  const rows = (await sql`
    select id, nome, descricao, preco, itens, ativo
    from kits
    where ativo
    order by preco asc, created_at desc
  `) as KitRow[];
  return rows.map(paraKit);
}

/** Todos, inclusive os fora do ar — só para a tela de admin. */
export async function todosOsKits(): Promise<Kit[]> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return [];

  const rows = (await sql`
    select id, nome, descricao, preco, itens, ativo
    from kits
    order by ativo desc, created_at desc
  `) as KitRow[];
  return rows.map(paraKit);
}

/* --------------------------------------------------------------- permissão */

async function exigirCupula(): Promise<{ ok: true; discordId: string } | Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só a cúpula monta kit." };
  }
  return { ok: true, discordId: session.user.discordId };
}

/* ------------------------------------------------------------ montar kit */

function validar(nome: string, preco: number, itens: ItemDoKit[]): string | null {
  if (!nome.trim()) return "O kit precisa de um nome.";
  if (nome.trim().length > 60) return "Nome longo demais — até 60 caracteres.";
  if (!Number.isInteger(preco) || preco < 1) {
    return "O preço precisa ser um número inteiro de Paletas, a partir de 1.";
  }
  if (itens.length === 0) return "Escolha ao menos um item para o kit.";
  if (itens.length > MAX_ITENS_POR_KIT) {
    return `No máximo ${MAX_ITENS_POR_KIT} itens diferentes por kit.`;
  }
  for (const i of itens) {
    if (!i.itemId?.trim()) return "Um dos itens está sem ID.";
    if (
      !Number.isInteger(i.quantidade) ||
      i.quantidade < 1 ||
      i.quantidade > MAX_QUANTIDADE_POR_ITEM
    ) {
      return `Quantidade de "${nomeDoItem(i.itemId)}" inválida.`;
    }
  }
  return null;
}

export async function criarKit(args: {
  nome: string;
  descricao: string;
  preco: number;
  itens: ItemDoKit[];
}): Promise<Resultado & { id?: number }> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;

  const erro = validar(args.nome, args.preco, args.itens);
  if (erro) return { ok: false, mensagem: erro };

  const limpos = args.itens.map((i) => ({
    itemId: i.itemId.trim(),
    quantidade: i.quantidade,
  }));

  const [{ id }] = (await sql`
    insert into kits (nome, descricao, preco, itens, criado_por)
    values (${args.nome.trim()}, ${args.descricao.trim()}, ${args.preco},
            ${JSON.stringify(limpos)}, ${staff.discordId})
    returning id
  `) as { id: number }[];

  return { ok: true, mensagem: `Kit "${args.nome.trim()}" criado.`, id };
}

export async function editarKit(args: {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  itens: ItemDoKit[];
}): Promise<Resultado> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;

  const erro = validar(args.nome, args.preco, args.itens);
  if (erro) return { ok: false, mensagem: erro };

  const limpos = args.itens.map((i) => ({
    itemId: i.itemId.trim(),
    quantidade: i.quantidade,
  }));

  const r = (await sql`
    update kits
       set nome = ${args.nome.trim()},
           descricao = ${args.descricao.trim()},
           preco = ${args.preco},
           itens = ${JSON.stringify(limpos)},
           updated_at = now()
     where id = ${args.id}
    returning id
  `) as { id: number }[];

  if (!r.length) return { ok: false, mensagem: "Kit não encontrado." };
  return { ok: true, mensagem: `Kit "${args.nome.trim()}" atualizado.` };
}

/**
 * Tira do ar ou devolve à vitrine.
 *
 * Nunca apaga: `kit_purchases` aponta para cá, e o extrato de quem comprou
 * precisa continuar dizendo o que foi comprado.
 */
export async function alternarKit(id: number, ativo: boolean): Promise<Resultado> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;

  const r = (await sql`
    update kits set ativo = ${ativo}, updated_at = now()
     where id = ${id}
    returning nome
  `) as { nome: string }[];

  if (!r.length) return { ok: false, mensagem: "Kit não encontrado." };
  return {
    ok: true,
    mensagem: ativo
      ? `"${r[0].nome}" voltou para a vitrine.`
      : `"${r[0].nome}" saiu da vitrine.`,
  };
}

/* ---------------------------------------------------------------- comprar */

/**
 * Onde o jogador está jogando AGORA, entre os servidores ativos.
 *
 * O vínculo (`account_links`) guarda um servidor só, mas o UID é da conta e
 * vale nos três (ver `lib/palworld/uid.ts`) — quem vinculou no PVE Free e
 * está no Dominantes precisa receber no Dominantes, que é onde o
 * `giveitems` vai achar a pessoa.
 */
async function ondeEstaAgora(
  uid: string,
): Promise<{ slug: string; nome: string } | null> {
  const achados = await Promise.all(
    activeServers().map(async (server) => {
      // Sem RCON não há como entregar, então nem adianta achar a pessoa lá.
      if (!server.rconPort) return null;
      try {
        // `true` pula o cache de 60s: comprar e ouvir "você não está no
        // jogo" um minuto depois de entrar seria o mesmo defeito que o cofre
        // já teve (ver a memória `gotcha-cache-60s-esconde-jogador-online`).
        //
        // `p.online` e não `Status === "Online"`: o PalDefender lista
        // fantasma como online, e o `giveitems` depois responde "Failed to
        // find player" — ver o comentário em `lib/palworld/paldefender.ts`.
        const online = await getPlayers(server, true);
        return online.some((p) => p.playerUid === uid && p.online)
          ? { slug: server.slug, nome: server.shortName }
          : null;
      } catch {
        return null;
      }
    }),
  );
  return achados.find((a) => a !== null) ?? null;
}

/**
 * Compra de kit: cobra, entrega no jogo e queima a Paleta.
 *
 * A ordem importa. A linha em `kit_purchases` nasce antes do RCON para que
 * uma queda no meio deixe rastro; a cobrança vem antes da entrega porque o
 * contrário permitiria levar o kit sem pagar; e a falha na entrega estorna,
 * porque aí o jogador não recebeu nada.
 */
export async function comprarKit(kitId: number): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  const kits = (await sql`
    select id, nome, descricao, preco, itens, ativo
    from kits where id = ${kitId}
  `) as KitRow[];
  const kit = kits[0];
  if (!kit) return { ok: false, mensagem: "Kit não encontrado." };
  if (!kit.ativo) return { ok: false, mensagem: "Esse kit saiu da vitrine." };

  const vinculo = await meuVinculo(discordId);
  if (!vinculo) {
    return {
      ok: false,
      mensagem: "Vincule seu personagem antes de comprar — o kit é entregue dentro do jogo.",
    };
  }

  const onde = await ondeEstaAgora(vinculo.uid);
  if (!onde) {
    return {
      ok: false,
      mensagem:
        "O kit é entregue na hora, dentro do jogo — entre em um dos servidores e compre de novo.",
    };
  }
  const server = serverBySlug(onde.slug);
  if (!server) return { ok: false, mensagem: "Servidor inválido." };

  // 1. Registrar a intenção, antes de tocar em Paleta ou no jogo.
  const [{ id: compraId }] = (await sql`
    insert into kit_purchases (kit_id, discord_id, server_slug, palworld_uid, preco)
    values (${kitId}, ${discordId}, ${onde.slug}, ${vinculo.uid}, ${kit.preco})
    returning id
  `) as { id: number }[];

  // 2. Cobrar. A chave é a compra, não o kit: recompra é livre, então duas
  //    compras do mesmo kit são dois lançamentos legítimos — o que a chave
  //    impede é o clique duplo virar cobrança dupla.
  const pagamento = await lancar({
    discordId,
    delta: -kit.preco,
    origem: "compra",
    descricao: `Kit "${kit.nome}"`,
    refId: String(compraId),
    chave: `kit:${compraId}`,
  });

  if (pagamento.status === "sem-saldo") {
    await sql`
      update kit_purchases
         set status = 'falhou', detail = 'saldo insuficiente', finished_at = now()
       where id = ${compraId}
    `;
    return {
      ok: false,
      mensagem: `O kit custa ${kit.preco} Paletas e você tem ${pagamento.saldo}.`,
    };
  }

  // 3. Entregar, item a item. Um comando por item para o log dizer o que
  //    chegou e o que não chegou — o mesmo raciocínio de
  //    `entregarItensParaJogadores`.
  const falhas: string[] = [];
  for (const item of kit.itens) {
    try {
      const r = await giveItems(server, vinculo.uid, item.itemId, item.quantidade);
      if (!r.ok) falhas.push(`${nomeDoItem(item.itemId)}: ${r.resposta}`);
    } catch (e) {
      falhas.push(
        `${nomeDoItem(item.itemId)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 4a. Nada chegou — devolve a Paleta. Cobrar por entrega que não
  //     aconteceu é o único desfecho que não dá para explicar ao jogador.
  if (falhas.length === kit.itens.length) {
    await lancar({
      discordId,
      delta: kit.preco,
      origem: "compra",
      descricao: `Estorno do kit "${kit.nome}" — a entrega falhou`,
      refId: String(compraId),
      chave: `kit-estorno:${compraId}`,
    });
    await sql`
      update kit_purchases
         set status = 'falhou', detail = ${falhas.join(" | ").slice(0, 1000)},
             finished_at = now()
       where id = ${compraId}
    `;
    return {
      ok: false,
      mensagem: "O jogo não aceitou a entrega e suas Paletas foram devolvidas. Tente de novo.",
    };
  }

  // 4b. Entrega parcial não estorna: o jogador recebeu parte do kit, e
  //     devolver o preço cheio daria o resto de graça. Fica registrado para
  //     o admin resolver caso a caso.
  await sql`
    update kit_purchases
       set status = ${falhas.length ? "falhou" : "concluido"},
           detail = ${falhas.join(" | ").slice(0, 1000)},
           finished_at = now()
     where id = ${compraId}
  `;

  if (falhas.length) {
    return {
      ok: true,
      mensagem: `Parte do kit chegou, mas ${falhas.length} item(ns) falharam. Fale com a administração.`,
    };
  }

  return {
    ok: true,
    mensagem: `"${kit.nome}" entregue no ${onde.nome}. Confira a mochila.`,
  };
}
