import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { lancar } from "@/lib/economia";
import { podeNegociar, motivoDoBloqueio } from "@/lib/itens";
import { debitarCofre, devolverAoCofre, temPilha, cofreCheio } from "@/lib/cofre";
import { cofreDePalsCheio } from "@/lib/pal-cofre";
import {
  taxaDaVenda,
  PRECO_MINIMO,
  PRECO_MAXIMO,
  MAX_ANUNCIOS_ATIVOS,
} from "@/lib/mercado-regras";

/**
 * O mercado entre jogadores (§7.6 e §7.7 do PROMPT.md).
 *
 * Dois tipos de anúncio, discriminados por `kind`:
 *
 * 1. **Item — um lote.** "500 balas por 10 Paletas", não 0,02 por bala.
 *    Paleta é sempre inteira (§7.1) e preço por unidade traria fração de
 *    volta pela porta dos fundos.
 * 2. **Pal — uma unidade só.** Não é fungível (IVs, passivas, alma próprios,
 *    §7.4) — o anúncio guarda o `PalTemplate` inteiro em `pal_template`, não
 *    `item_id`/`qty`. 23/08/2026: a coluna `kind` e o `check` de forma da
 *    tabela `listings` já prontos desde a v1; só faltava esta metade.
 *
 * Regra que vale para os dois: **o ativo sai do cofre ao anunciar.** Fica em
 * custódia do anúncio, não do dono. Assim é impossível vender o que já foi
 * resgatado, e o cancelamento é só um caminho de volta.
 */

export {
  taxaDaVenda,
  PRECO_MINIMO,
  PRECO_MAXIMO,
  MAX_ANUNCIOS_ATIVOS,
} from "@/lib/mercado-regras";

/* -------------------------------------------------------------------- tipos */

export type TipoAnuncio = "item" | "pal";

export interface Anuncio {
  id: number;
  kind: TipoAnuncio;
  /** Só quando `kind==="item"`. */
  itemId?: string;
  qty?: number;
  /** Só quando `kind==="pal"` — tirado de `pal_template.PalID`. */
  palId?: string;
  palTemplate?: Record<string, unknown>;
  preco: number;
  taxa: number;
  vendedorId: string;
  /** Nome do personagem no jogo — quem vende tem cara, não só um ID */
  vendedor: string;
  em: string;
}

export interface MeuAnuncio extends Anuncio {
  status: "ativo" | "vendido" | "cancelado";
  comprador: string | null;
  fechadoEm: string | null;
}

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/* ----------------------------------------------------------------- leitura */

interface LinhaAnuncio {
  id: number;
  kind: TipoAnuncio;
  item_id: string | null;
  qty: number | null;
  pal_template: Record<string, unknown> | null;
  price: number;
  fee: number;
  seller_id: string;
  vendedor: string | null;
  created_at: string;
}

const paraAnuncio = (r: LinhaAnuncio): Anuncio => ({
  id: r.id,
  kind: r.kind,
  itemId: r.item_id ?? undefined,
  qty: r.qty ?? undefined,
  palId: r.pal_template ? String(r.pal_template.PalID ?? "") : undefined,
  palTemplate: r.pal_template ?? undefined,
  preco: r.price,
  taxa: r.fee,
  vendedorId: r.seller_id,
  vendedor: r.vendedor ?? "Palleiro",
  em: r.created_at,
});

/**
 * A vitrine — só anúncio ativo, do mais novo para o mais velho.
 *
 * O nome do vendedor vem de `account_links` com `left join`: quem desvinculou
 * o personagem não faz o anúncio dele sumir da vitrine.
 */
export async function vitrine(limite = 60): Promise<Anuncio[]> {
  const rows = (await sql`
    select l.id, l.kind, l.item_id, l.qty, l.pal_template, l.price, l.fee,
           l.seller_id, a.player_name as vendedor, l.created_at
    from listings l
    left join account_links a on a.discord_id = l.seller_id
    where l.status = 'ativo'
    order by l.created_at desc
    limit ${limite}
  `) as LinhaAnuncio[];
  return rows.map(paraAnuncio);
}

export async function anuncio(id: number): Promise<Anuncio | null> {
  const rows = (await sql`
    select l.id, l.kind, l.item_id, l.qty, l.pal_template, l.price, l.fee,
           l.seller_id, a.player_name as vendedor, l.created_at
    from listings l
    left join account_links a on a.discord_id = l.seller_id
    where l.id = ${id} and l.status = 'ativo'
  `) as LinhaAnuncio[];
  return rows[0] ? paraAnuncio(rows[0]) : null;
}

export async function meusAnuncios(discordId: string): Promise<MeuAnuncio[]> {
  const rows = (await sql`
    select l.id, l.kind, l.item_id, l.qty, l.pal_template, l.price, l.fee,
           l.seller_id, a.player_name as vendedor, l.created_at,
           l.status, l.closed_at,
           c.player_name as comprador
    from listings l
    left join account_links a on a.discord_id = l.seller_id
    left join account_links c on c.discord_id = l.buyer_id
    where l.seller_id = ${discordId}
    order by l.status = 'ativo' desc, l.created_at desc
    limit 50
  `) as (LinhaAnuncio & {
    status: string;
    closed_at: string | null;
    comprador: string | null;
  })[];

  return rows.map((r) => ({
    ...paraAnuncio(r),
    status: r.status as MeuAnuncio["status"],
    comprador: r.comprador,
    fechadoEm: r.closed_at,
  }));
}

export async function minhasCompras(discordId: string): Promise<MeuAnuncio[]> {
  const rows = (await sql`
    select l.id, l.kind, l.item_id, l.qty, l.pal_template, l.price, l.fee,
           l.seller_id, a.player_name as vendedor, l.created_at,
           l.status, l.closed_at, null as comprador
    from listings l
    left join account_links a on a.discord_id = l.seller_id
    where l.buyer_id = ${discordId} and l.status = 'vendido'
    order by l.closed_at desc
    limit 30
  `) as (LinhaAnuncio & {
    status: string;
    closed_at: string | null;
    comprador: string | null;
  })[];

  return rows.map((r) => ({
    ...paraAnuncio(r),
    status: "vendido",
    comprador: null,
    fechadoEm: r.closed_at,
  }));
}

async function quantosAtivos(discordId: string): Promise<number> {
  const rows = (await sql`
    select count(*)::int as n from listings
    where seller_id = ${discordId} and status = 'ativo'
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/* ------------------------------------------------------------------ vender */

/**
 * Põe um lote do cofre à venda.
 *
 * O item **sai do cofre** aqui. Se a criação do anúncio falhasse depois do
 * débito, o lote sumiria — por isso a inserção vem logo em seguida e, se
 * estourar, o `catch` devolve tudo para o cofre antes de responder.
 */
export async function anunciar(
  itemId: string,
  qty: number,
  preco: number,
): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) {
    return { ok: false, mensagem: "Só quem está no Discord da Palleira vende." };
  }
  const discordId = session.user.discordId;

  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, mensagem: "Quantidade inválida." };
  }
  if (!Number.isInteger(preco)) {
    return { ok: false, mensagem: "O preço é sempre em Paleta inteira." };
  }
  if (preco < PRECO_MINIMO || preco > PRECO_MAXIMO) {
    return {
      ok: false,
      mensagem: `O preço vai de ${PRECO_MINIMO} a ${PRECO_MAXIMO} Paletas.`,
    };
  }
  if (!podeNegociar(itemId)) {
    return { ok: false, mensagem: motivoDoBloqueio(itemId) };
  }
  if ((await quantosAtivos(discordId)) >= MAX_ANUNCIOS_ATIVOS) {
    return {
      ok: false,
      mensagem: `Você já tem ${MAX_ANUNCIOS_ATIVOS} anúncios no ar. Cancele um antes de criar outro.`,
    };
  }

  // A trava de posse é o próprio débito: se não havia a quantidade, ele não
  // encontra linha para atualizar e devolve falso.
  if (!(await debitarCofre(discordId, itemId, qty))) {
    return { ok: false, mensagem: "Você não tem essa quantidade no cofre." };
  }

  const taxa = taxaDaVenda(preco);
  try {
    await sql`
      insert into listings (seller_id, kind, item_id, qty, price, fee)
      values (${discordId}, 'item', ${itemId}, ${qty}, ${preco}, ${taxa})
    `;
  } catch {
    // O lote já saiu do cofre: devolver vem antes de qualquer outra coisa.
    // Deixar a exceção subir mostraria a tela de erro genérica do Next, e a
    // pessoa não saberia se perdeu o item ou não.
    await devolverAoCofre(discordId, itemId, qty);
    return {
      ok: false,
      mensagem:
        "Não consegui publicar o anúncio agora. Seu lote continua no cofre — tente de novo em instantes.",
    };
  }

  return {
    ok: true,
    mensagem: `Anúncio no ar por ${preco} Paletas. Você recebe ${preco - taxa} quando vender (${taxa} de taxa).`,
  };
}

/**
 * Põe um Pal do cofre à venda — mesmo espírito do `anunciar()` de item, mas
 * o ativo é uma unidade só (`vault_pals`), não um lote (`cofre`).
 *
 * O Pal **sai do `vault_pals`** aqui, igual ao primeiro passo de
 * `iniciarResgateDePal` em `lib/pal-cofre.ts` — mesma trava de posse: o
 * `delete` só acerta se o Pal ainda for do vendedor, e se não achar linha
 * nenhuma é porque já foi resgatado, vendido ou nunca existiu.
 */
export async function anunciarPal(
  vaultPalId: number,
  preco: number,
): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) {
    return { ok: false, mensagem: "Só quem está no Discord da Palleira vende." };
  }
  const discordId = session.user.discordId;

  if (!Number.isInteger(preco)) {
    return { ok: false, mensagem: "O preço é sempre em Paleta inteira." };
  }
  if (preco < PRECO_MINIMO || preco > PRECO_MAXIMO) {
    return {
      ok: false,
      mensagem: `O preço vai de ${PRECO_MINIMO} a ${PRECO_MAXIMO} Paletas.`,
    };
  }
  if ((await quantosAtivos(discordId)) >= MAX_ANUNCIOS_ATIVOS) {
    return {
      ok: false,
      mensagem: `Você já tem ${MAX_ANUNCIOS_ATIVOS} anúncios no ar. Cancele um antes de criar outro.`,
    };
  }

  const debitado = (await sql`
    delete from vault_pals
    where id = ${vaultPalId} and discord_id = ${discordId}
    returning pal_id, template, server_slug
  `) as { pal_id: string; template: Record<string, unknown>; server_slug: string | null }[];

  if (!debitado.length) {
    return { ok: false, mensagem: "Esse Pal não está mais no seu cofre." };
  }
  const { pal_id: palId, template, server_slug: origemSlug } = debitado[0];

  const taxa = taxaDaVenda(preco);
  try {
    await sql`
      insert into listings (seller_id, kind, pal_template, pal_server_slug, price, fee)
      values (${discordId}, 'pal', ${JSON.stringify(template)}, ${origemSlug}, ${preco}, ${taxa})
    `;
  } catch {
    // Mesma disciplina do anúncio de item: o Pal já saiu do cofre, então
    // devolver vem antes de qualquer outra coisa.
    await sql`
      insert into vault_pals (discord_id, pal_id, template, server_slug)
      values (${discordId}, ${palId}, ${JSON.stringify(template)}, ${origemSlug})
    `;
    return {
      ok: false,
      mensagem:
        "Não consegui publicar o anúncio agora. Seu Pal continua no cofre — tente de novo em instantes.",
    };
  }

  return {
    ok: true,
    mensagem: `Anúncio no ar por ${preco} Paletas. Você recebe ${preco - taxa} quando vender (${taxa} de taxa).`,
  };
}

/** Tira o anúncio do ar e devolve o ativo ao cofre do dono — item ou Pal. */
export async function cancelarAnuncio(id: number): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  // O `where status = 'ativo'` decide a corrida com uma compra simultânea:
  // se alguém acabou de comprar, não há o que cancelar.
  const rows = (await sql`
    update listings
       set status = 'cancelado', closed_at = now()
     where id = ${id} and seller_id = ${discordId} and status = 'ativo'
    returning kind, item_id, qty, pal_template, pal_server_slug
  `) as {
    kind: TipoAnuncio;
    item_id: string | null;
    qty: number | null;
    pal_template: Record<string, unknown> | null;
    pal_server_slug: string | null;
  }[];

  if (!rows.length) {
    return { ok: false, mensagem: "Esse anúncio não está mais ativo." };
  }
  const cancelado = rows[0];

  if (cancelado.kind === "pal" && cancelado.pal_template) {
    await sql`
      insert into vault_pals (discord_id, pal_id, template, server_slug)
      values (${discordId}, ${String(cancelado.pal_template.PalID ?? "")}, ${JSON.stringify(cancelado.pal_template)}, ${cancelado.pal_server_slug})
    `;
    return { ok: true, mensagem: "Anúncio cancelado e Pal de volta no cofre." };
  }

  await devolverAoCofre(discordId, cancelado.item_id as string, cancelado.qty as number);
  return { ok: true, mensagem: "Anúncio cancelado e lote de volta no cofre." };
}

/* ------------------------------------------------------------------ comprar */

/**
 * A compra inteira, com volta atrás em cada passo que pode falhar.
 *
 * A ordem foi escolhida para que **nenhuma falha deixe alguém sem o item e
 * sem a Paleta**:
 *
 * ```
 * 1. reservar o anúncio   ← decide quem comprou, no banco, sem empate
 * 2. debitar o comprador  ← falhou? o anúncio volta a ficar ativo
 * 3. entregar no cofre    ← o ativo já era do site: não passa pelo jogo
 * 4. pagar o vendedor     ← preço menos a taxa, que é queimada
 * ```
 *
 * O passo 1 é o que impede duas pessoas de comprarem o mesmo lote: o `update`
 * com `status = 'ativo'` na condição só acerta uma vez, e quem chegou depois
 * não recebe linha nenhuma de volta.
 */
export async function comprar(id: number): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) {
    return { ok: false, mensagem: "Só quem está no Discord da Palleira compra." };
  }
  const discordId = session.user.discordId;

  const alvo = await anuncio(id);
  if (!alvo) return { ok: false, mensagem: "Esse anúncio não está mais no ar." };
  if (alvo.vendedorId === discordId) {
    return { ok: false, mensagem: "Esse anúncio é seu." };
  }

  // Aviso cedo e amigável: o lote precisa caber no cofre de quem compra.
  if (
    alvo.kind === "item" &&
    !(await temPilha(discordId, alvo.itemId as string)) &&
    (await cofreCheio(discordId, session.user.roles))
  ) {
    return {
      ok: false,
      mensagem:
        "Seu cofre está cheio. Compre um slot ou resgate algo antes de comprar.",
    };
  }
  if (alvo.kind === "pal" && (await cofreDePalsCheio(discordId, session.user.roles))) {
    return {
      ok: false,
      mensagem:
        "Seu cofre de Pals está cheio. Compre um slot ou resgate algo antes de comprar.",
    };
  }

  // 1. Reservar — a decisão de quem levou acontece aqui, no banco.
  const reservado = (await sql`
    update listings
       set status = 'vendido', buyer_id = ${discordId}, closed_at = now()
     where id = ${id} and status = 'ativo' and seller_id <> ${discordId}
    returning kind, item_id, qty, pal_template, price, fee, seller_id
  `) as {
    kind: TipoAnuncio;
    item_id: string | null;
    qty: number | null;
    pal_template: Record<string, unknown> | null;
    price: number;
    fee: number;
    seller_id: string;
  }[];

  if (!reservado.length) {
    return { ok: false, mensagem: "Alguém comprou primeiro. O anúncio saiu do ar." };
  }
  const venda = reservado[0];

  const desfazerReserva = () => sql`
    update listings
       set status = 'ativo', buyer_id = null, closed_at = null
     where id = ${id} and buyer_id = ${discordId} and status = 'vendido'
  `;

  // 2. Cobrar. A chave é o anúncio: retry ou clique duplo não cobra de novo.
  const pagamento = await lancar({
    discordId,
    delta: -venda.price,
    origem: "compra",
    descricao: `Compra do anúncio #${id}`,
    refId: String(id),
    chave: `compra:${id}`,
  });

  if (pagamento.status === "sem-saldo") {
    await desfazerReserva();
    return {
      ok: false,
      mensagem: `Custa ${venda.price} Paletas e você tem ${pagamento.saldo}.`,
    };
  }

  // 3. Entregar no cofre do comprador. O ativo nunca passou pelo jogo, então
  //    aqui não há RCON nem exigência de ninguém estar online.
  //
  //    ⚠️ Daqui para baixo não há mais volta atrás: o pagamento já entrou no
  //    extrato. Se o banco cair exatamente neste ponto, o conserto é manual —
  //    e possível, porque sobra rastro dos dois lados: a linha de `compra`
  //    no `ledger` com `ref_id` do anúncio, e o `listings` com `buyer_id`
  //    preenchido. Entregar o lote depois é uma linha de SQL; o que não
  //    podia acontecer é a pessoa pagar sem que ninguém saiba a quem.
  //
  //    O cofre do comprador pode passar do limite de slots aqui, e tudo bem:
  //    ele pagou. Erra a favor de quem comprou, nunca contra.
  if (venda.kind === "pal" && venda.pal_template) {
    // A trava de servidor (§006) é para o próprio dono não usar guardar→
    // resgatar repetido como um jeito de farmar contador de captura — não
    // faz sentido contra quem comprou: o comprador pode nunca ter jogado no
    // servidor de quem vendeu. Por isso `server_slug` nasce nulo aqui — o
    // comprador resgata em qualquer servidor que estiver online. O cooldown
    // continua valendo (recomeça do zero em `imported_at = now()`), porque
    // esse é o pedaço que de fato limita o ciclo repetido, com ou sem venda.
    await sql`
      insert into vault_pals (discord_id, pal_id, template, server_slug)
      values (${discordId}, ${String(venda.pal_template.PalID ?? "")}, ${JSON.stringify(venda.pal_template)}, null)
    `;
  } else {
    await devolverAoCofre(discordId, venda.item_id as string, venda.qty as number);
  }

  // 4. Pagar o vendedor. A taxa não vai para lugar nenhum: some da economia,
  //    e é a diferença entre esta linha e a do comprador (§7.7).
  await lancar({
    discordId: venda.seller_id,
    delta: venda.price - venda.fee,
    origem: "venda",
    descricao: `Venda do anúncio #${id} — ${venda.price} menos ${venda.fee} de taxa`,
    refId: String(id),
    chave: `venda:${id}`,
  });

  return {
    ok: true,
    mensagem:
      venda.kind === "pal"
        ? `Comprado! O Pal está no seu cofre — resgate no jogo quando quiser. Saldo: ${pagamento.saldo}.`
        : `Comprado! O lote está no seu cofre — resgate no jogo quando quiser. Saldo: ${pagamento.saldo}.`,
  };
}

/* ------------------------------------------------------------- visão geral */

export interface ResumoDoMercado {
  ativos: number;
  vendidos: number;
  volume: number;
  queimado: number;
}

/** Números do mercado para o painel de economia (§7.12). */
export async function resumoDoMercado(): Promise<ResumoDoMercado> {
  const rows = (await sql`
    select
      count(*) filter (where status = 'ativo')::int   as ativos,
      count(*) filter (where status = 'vendido')::int as vendidos,
      coalesce(sum(price) filter (where status = 'vendido'), 0)::int as volume,
      coalesce(sum(fee)   filter (where status = 'vendido'), 0)::int as queimado
    from listings
  `) as ResumoDoMercado[];
  return rows[0] ?? { ativos: 0, vendidos: 0, volume: 0, queimado: 0 };
}
