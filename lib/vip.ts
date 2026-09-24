import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { PLANOS, canManageEconomy, levelOf, MENSAGEM_SO_MEMBRO } from "@/lib/roles";
import { lancar } from "@/lib/economia";
import { alterarCargo, logarNoDiscord } from "@/lib/discord";
import { serverBySlug } from "@/lib/servers";
import { giveItems } from "@/lib/palworld/rcon";
import { meuVinculo } from "@/lib/linking";
import { nomeDoItem } from "@/lib/itens";
import { ondeEstaAgora, type ItemDoKit } from "@/lib/kits";
import {
  infiniteTag,
  reais,
  criarCheckout,
  checarPagamento,
  type DadosDoPagamento,
} from "@/lib/infinitepay";

/**
 * VIP por doação via Pix, pela InfinitePay, com entrega automática do cargo
 * e das Paletas (pedido do dono em 23/09/2026). Ver
 * `db/migrations/028-vip-doacoes.sql`.
 *
 * O caminho de uma doação:
 *   1. `iniciarDoacao` grava a linha e pede à InfinitePay um link de
 *      checkout (Pix ou cartão, a pessoa escolhe lá).
 *   2. Pagou: a InfinitePay chama o webhook E devolve a pessoa para
 *      `/vip/obrigado/<id>` com os dados da transação na URL.
 *   3. Nos dois casos, `confirmarPagamento` pergunta à própria InfinitePay
 *      (`payment_check`) se está pago. **O webhook deles não é assinado** —
 *      qualquer um poderia mandar um POST dizendo "pagou". Só a resposta do
 *      `payment_check` conta.
 *   4. `entregar` dá o cargo no Discord e credita as Paletas do mês, cada
 *      um com a sua trava de repetição. O que falhar fica anotado e o admin
 *      tenta de novo em /admin/vip.
 *   5. Os itens do jogo esperam o jogador: `resgatarItensVip` entrega por
 *      RCON quando ele clica em /vip com o personagem online — o
 *      `giveitems` não acha quem está fora do jogo, então não dá para
 *      mandar na hora do pagamento.
 *
 * O cargo vale 30 dias a partir do pagamento; doar de novo antes de vencer
 * soma mais 30. `expirarVips` tira o cargo de quem venceu — só o cargo que
 * ESTA rotina deu, nunca um VIP que a staff deu na mão.
 */

export const DIAS_DE_VIP = 30;
export { infiniteTag, reais };
export type { DadosDoPagamento };

export interface PlanoVip {
  key: string;
  nome: string;
  precoCentavos: number;
  paletasNoMes: number;
  beneficios: string[];
  /** Itens do jogo, entregues uma vez por doação. */
  itens: ItemDoKit[];
  /** Boosters que cada doação dá para ativar (`lib/booster.ts`). */
  boosters: number;
  destaque: boolean;
  ativo: boolean;
  /** Regra do site, fixa no código (`PLANOS` em `lib/roles.ts`). */
  dailyPaletas: number;
  slotsCofre: number;
}

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/* ----------------------------------------------------------------- leitura */

interface LinhaPlano {
  key: string;
  nome: string;
  preco_centavos: number;
  paletas_no_mes: number;
  beneficios: string[];
  itens: ItemDoKit[];
  boosters: number;
  destaque: boolean;
  ativo: boolean;
}

function paraPlano(r: LinhaPlano): PlanoVip | null {
  const regra = PLANOS.find((p) => p.key === r.key);
  if (!regra) return null;
  return {
    key: r.key,
    nome: r.nome,
    precoCentavos: r.preco_centavos,
    paletasNoMes: r.paletas_no_mes,
    beneficios: r.beneficios,
    itens: r.itens,
    boosters: r.boosters,
    destaque: r.destaque,
    ativo: r.ativo,
    dailyPaletas: regra.dailyPaletas,
    slotsCofre: regra.slotsCofre,
  };
}

export async function planosVip(soAtivos = true): Promise<PlanoVip[]> {
  const rows = (await sql`
    select key, nome, preco_centavos, paletas_no_mes, beneficios, itens, boosters, destaque, ativo
    from vip_planos
    where ${!soAtivos} or ativo
    order by ordem
  `) as LinhaPlano[];
  return rows.map(paraPlano).filter((p): p is PlanoVip => p !== null);
}

/* -------------------------------------------------------------- doar */

export async function iniciarDoacao(
  planoKey: string,
  aceitou: boolean,
): Promise<Resultado & { url?: string }> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) {
    return { ok: false, mensagem: "Entre no Discord da Palleira antes — o VIP é um cargo de lá." };
  }
  if (!aceitou) {
    return { ok: false, mensagem: "Marque que entendeu que é uma doação para continuar." };
  }

  const tag = await infiniteTag();
  if (!tag) return { ok: false, mensagem: "As doações ainda não foram ligadas. Tente mais tarde." };

  const plano = (await planosVip()).find((p) => p.key === planoKey);
  if (!plano) return { ok: false, mensagem: "Esse plano não está disponível." };

  const [{ id }] = (await sql`
    insert into vip_doacoes (discord_id, plano_key, plano_nome, valor_centavos, paletas, itens, boosters)
    values (${session.user.discordId}, ${plano.key}, ${plano.nome}, ${plano.precoCentavos},
            ${plano.paletasNoMes}, ${JSON.stringify(plano.itens)}, ${plano.boosters})
    returning id
  `) as { id: number }[];
  const orderNsu = `vip-${id}`;

  const { url, erro } = await criarCheckout({
    tag,
    orderNsu,
    precoCentavos: plano.precoCentavos,
    descricao: `Doação à comunidade Palleira — agradecimento VIP ${plano.nome}`,
    redirectPath: `/vip/obrigado/${id}`,
  });

  if (!url) {
    await sql`
      update vip_doacoes set status = 'falhou', detail = ${erro.slice(0, 500)}, updated_at = now()
       where id = ${id}
    `;
    return { ok: false, mensagem: "Não consegui abrir o pagamento agora. Tente de novo em instantes." };
  }

  await sql`
    update vip_doacoes set order_nsu = ${orderNsu}, checkout_url = ${url}, updated_at = now()
     where id = ${id}
  `;
  return { ok: true, mensagem: "", url };
}

/* ---------------------------------------------------- confirmar e entregar */

/**
 * Confirma com a InfinitePay e, se pago, entrega. Idempotente: chamada pelo
 * webhook e pela página de volta, ao mesmo tempo ou repetida, entrega uma
 * vez só.
 *
 * `false` em `transitorio` quer dizer "não deu para perguntar agora" — o
 * webhook devolve 400 para a InfinitePay tentar de novo.
 */
export async function confirmarPagamento(
  d: DadosDoPagamento,
): Promise<{ pago: boolean; transitorio: boolean; motivo: string }> {
  const id = Number(/^vip-(\d+)$/.exec(d.orderNsu)?.[1]);
  if (!id) return { pago: false, transitorio: false, motivo: "order_nsu desconhecido" };

  const [doacao] = (await sql`
    select id, status, valor_centavos from vip_doacoes where id = ${id}
  `) as { id: number; status: string; valor_centavos: number }[];
  if (!doacao) return { pago: false, transitorio: false, motivo: "doação não existe" };
  if (doacao.status === "pago" || doacao.status === "entregue") {
    return { pago: true, transitorio: false, motivo: "já confirmada" };
  }

  const r = await checarPagamento(d);
  if (!r.pago) return r;
  const pago = r.valor;
  if (pago < doacao.valor_centavos) {
    await sql`
      update vip_doacoes set detail = ${`pago ${pago} de ${doacao.valor_centavos} centavos — não entregue`},
             updated_at = now()
       where id = ${id}
    `;
    return { pago: false, transitorio: false, motivo: "valor menor que o do plano" };
  }

  // A virada 'aguardando' → 'pago' é a trava: só uma chamada passa daqui.
  // O `vip_ate` soma 30 dias ao que a pessoa ainda tiver do mesmo plano.
  const virou = (await sql`
    update vip_doacoes d
       set status = 'pago', pago_em = now(), paid_amount = ${pago},
           transaction_nsu = ${d.transactionNsu}, invoice_slug = ${d.slug},
           receipt_url = ${d.receiptUrl ?? null},
           capture_method = ${r.captureMethod},
           vip_ate = greatest(
             now(),
             coalesce((select max(o.vip_ate) from vip_doacoes o
                        where o.discord_id = d.discord_id and o.plano_key = d.plano_key
                          and o.status in ('pago', 'entregue') and o.id <> d.id), now())
           ) + (interval '1 day' * ${DIAS_DE_VIP}),
           updated_at = now()
     where id = ${id} and status in ('aguardando', 'falhou')
    returning id
  `) as { id: number }[];

  if (virou.length) await entregar(id);
  return { pago: true, transitorio: false, motivo: "" };
}

/** Cargo + Paletas. Cada um só roda se ainda não deu certo — pode repetir. */
export async function entregar(id: number): Promise<Resultado> {
  const [d] = (await sql`
    select id, discord_id, plano_key, plano_nome, paletas, valor_centavos, status,
           cargo_ok, paletas_ok, vip_ate
    from vip_doacoes where id = ${id}
  `) as {
    id: number; discord_id: string; plano_key: string; plano_nome: string; paletas: number;
    valor_centavos: number; status: string; cargo_ok: boolean; paletas_ok: boolean; vip_ate: string;
  }[];
  if (!d || (d.status !== "pago" && d.status !== "entregue")) {
    return { ok: false, mensagem: "Essa doação não está paga." };
  }

  const falhas: string[] = [];
  let cargoOk = d.cargo_ok;
  let paletasOk = d.paletas_ok;

  if (!cargoOk) {
    const regra = PLANOS.find((p) => p.key === d.plano_key);
    const r = regra
      ? await alterarCargo(d.discord_id, regra.role, "dar", `Doação VIP #${id}`)
      : { ok: false, erro: "plano sem cargo no código" };
    cargoOk = r.ok;
    if (!r.ok) falhas.push(`cargo: ${r.erro}`);
  }

  if (!paletasOk) {
    if (d.paletas > 0) {
      try {
        await lancar({
          discordId: d.discord_id,
          delta: d.paletas,
          origem: "doacao",
          descricao: `Agradecimento pela doação VIP ${d.plano_nome}`,
          refId: String(id),
          chave: `vip:${id}`,
        });
        paletasOk = true;
      } catch (e) {
        falhas.push(`Paletas: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      paletasOk = true;
    }
  }

  const tudo = cargoOk && paletasOk;
  await sql`
    update vip_doacoes
       set cargo_ok = ${cargoOk}, paletas_ok = ${paletasOk},
           status = ${tudo ? "entregue" : "pago"},
           detail = ${falhas.join(" | ").slice(0, 500)}, updated_at = now()
     where id = ${id}
  `;

  if (d.status !== "entregue") {
    await logarNoDiscord(
      `💛 Doação VIP **${d.plano_nome}** · ${reais(d.valor_centavos)} — <@${d.discord_id}>` +
        (tudo ? " · entregue" : `\n> ⚠️ ficou pela metade: ${falhas.join(" | ")}`),
    );
  }

  return tudo
    ? { ok: true, mensagem: "Cargo e Paletas entregues." }
    : { ok: false, mensagem: `Faltou: ${falhas.join(" | ")}` };
}

export interface StatusDaDoacao {
  status: string;
  planoNome: string;
  vipAte: string | null;
  cargoOk: boolean;
  paletasOk: boolean;
  paletas: number;
  /** Tem item do jogo esperando resgate em /vip. */
  itensPendentes: boolean;
}

/** Para a página de volta — só a própria pessoa enxerga a doação dela. */
export async function minhaDoacao(id: number): Promise<StatusDaDoacao | null> {
  const session = await auth();
  if (!session) return null;
  const [d] = (await sql`
    select status, plano_nome, vip_ate, cargo_ok, paletas_ok, paletas,
           jsonb_array_length(itens) > 0 and itens_status <> 'entregue' as itens_pendentes
    from vip_doacoes where id = ${id} and discord_id = ${session.user.discordId}
  `) as {
    status: string; plano_nome: string; vip_ate: string | null;
    cargo_ok: boolean; paletas_ok: boolean; paletas: number; itens_pendentes: boolean;
  }[];
  if (!d) return null;
  return {
    status: d.status,
    planoNome: d.plano_nome,
    vipAte: d.vip_ate,
    cargoOk: d.cargo_ok,
    paletasOk: d.paletas_ok,
    paletas: d.paletas,
    itensPendentes: d.itens_pendentes,
  };
}

/* ---------------------------------------------------------- itens do jogo */

export interface ItensAResgatar {
  id: number;
  planoNome: string;
  pagoEm: string;
  /** Só o que ainda não chegou — o que já saiu numa tentativa anterior fica de fora. */
  itens: ItemDoKit[];
  /** O motivo da última tentativa que não entregou tudo, para a pessoa saber o que fazer. */
  ultimaFalha: string;
}

/** As doações pagas da pessoa com item do jogo ainda por receber. */
export async function meusItensVip(): Promise<ItensAResgatar[]> {
  const session = await auth();
  if (!session) return [];
  const rows = (await sql`
    select id, plano_nome, pago_em, itens, itens_entregues, itens_detail
    from vip_doacoes
    where discord_id = ${session.user.discordId}
      and status in ('pago', 'entregue')
      and itens_status <> 'entregue'
      and jsonb_array_length(itens) > 0
    order by id
  `) as {
    id: number; plano_nome: string; pago_em: string; itens: ItemDoKit[];
    itens_entregues: string[]; itens_detail: string;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    planoNome: r.plano_nome,
    pagoEm: r.pago_em,
    itens: r.itens.filter((i) => !r.itens_entregues.includes(i.itemId)),
    ultimaFalha: r.itens_detail,
  }));
}

/**
 * Entrega os itens do jogo de uma doação, no servidor em que a pessoa está
 * jogando agora — o mesmo caminho da compra de kit.
 *
 * Uma vez por doação. A virada 'pendente' → 'entregando' é a trava contra o
 * clique duplo; uma tentativa que morreu no meio (queda da função) libera
 * sozinha depois de 5 minutos. Cada item que chega é anotado na hora em
 * `itens_entregues`, então tentar de novo depois da mochila cheia manda só
 * o que faltou, sem duplicar o resto.
 */
export async function resgatarItensVip(id: number): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) return { ok: false, mensagem: MENSAGEM_SO_MEMBRO };
  const discordId = session.user.discordId;

  const vinculo = await meuVinculo(discordId);
  if (!vinculo) {
    return {
      ok: false,
      mensagem: "Vincule seu personagem primeiro — os itens são entregues dentro do jogo.",
    };
  }

  const onde = await ondeEstaAgora(vinculo.uid);
  if (!onde) {
    return {
      ok: false,
      mensagem: "Os itens chegam direto na mochila — entre em um dos servidores e clique de novo.",
    };
  }
  const server = serverBySlug(onde.slug);
  if (!server) return { ok: false, mensagem: "Servidor inválido." };

  const [d] = (await sql`
    update vip_doacoes
       set itens_status = 'entregando', itens_tentativa_em = now(), updated_at = now()
     where id = ${id} and discord_id = ${discordId}
       and status in ('pago', 'entregue')
       and jsonb_array_length(itens) > 0
       and (itens_status = 'pendente'
            or (itens_status = 'entregando' and itens_tentativa_em < now() - interval '5 minutes'))
    returning plano_nome, itens, itens_entregues
  `) as { plano_nome: string; itens: ItemDoKit[]; itens_entregues: string[] }[];
  if (!d) {
    return { ok: false, mensagem: "Esses itens já foram entregues ou estão sendo entregues agora." };
  }

  const faltam = d.itens.filter((i) => !d.itens_entregues.includes(i.itemId));
  const falhas: string[] = [];
  for (const item of faltam) {
    try {
      const r = await giveItems(server, vinculo.uid, item.itemId, item.quantidade);
      if (!r.ok) {
        falhas.push(`${nomeDoItem(item.itemId)}: ${r.resposta}`);
        continue;
      }
      await sql`
        update vip_doacoes
           set itens_entregues = itens_entregues || ${JSON.stringify([item.itemId])}::jsonb
         where id = ${id}
      `;
    } catch (e) {
      falhas.push(`${nomeDoItem(item.itemId)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const detalhe = falhas.join(" | ").slice(0, 1000);
  await sql`
    update vip_doacoes
       set itens_status = ${falhas.length ? "pendente" : "entregue"},
           itens_entregue_em = ${falhas.length ? null : new Date().toISOString()},
           itens_server = ${onde.slug},
           itens_detail = ${detalhe},
           updated_at = now()
     where id = ${id}
  `;

  if (!falhas.length) {
    await logarNoDiscord(`🎁 Itens do VIP **${d.plano_nome}** entregues no ${onde.nome} — <@${discordId}>`);
    return { ok: true, mensagem: `Itens do VIP ${d.plano_nome} entregues no ${onde.nome}. Confira a mochila.` };
  }

  const cheia = falhas.some((f) => /inventory space/i.test(f));
  const chegou = faltam.length - falhas.length;
  return {
    ok: chegou > 0,
    mensagem:
      (chegou > 0 ? `${chegou} de ${faltam.length} itens chegaram. ` : "Nenhum item chegou. ") +
      (cheia
        ? "Sua mochila está cheia — libere espaço e clique de novo; só o que faltou será enviado."
        : "Clique de novo em instantes; só o que faltou será enviado."),
  };
}

/* ---------------------------------------------------------------- vencer */

/**
 * Tira o cargo de quem teve a última doação daquele plano vencida. Só mexe
 * em cargo que esta rotina deu (`cargo_ok` e ainda não removido) — VIP dado
 * na mão pela staff não tem linha aqui e nunca é tocado.
 */
export async function expirarVips(): Promise<{ removidos: number; falhas: string[] }> {
  const vencidos = (await sql`
    select discord_id, plano_key
    from vip_doacoes
    where status in ('pago', 'entregue')
    group by discord_id, plano_key
    having max(vip_ate) < now()
       and bool_or(cargo_ok and cargo_removido_em is null)
  `) as { discord_id: string; plano_key: string }[];

  let removidos = 0;
  const falhas: string[] = [];
  for (const v of vencidos) {
    const regra = PLANOS.find((p) => p.key === v.plano_key);
    if (!regra) continue;
    const r = await alterarCargo(v.discord_id, regra.role, "tirar", "VIP por doação venceu");
    // 404 = a pessoa saiu do Discord: não há cargo para tirar, conta como feito.
    if (r.ok || r.erro.includes("não está no servidor")) {
      await sql`
        update vip_doacoes set cargo_removido_em = now(), updated_at = now()
         where discord_id = ${v.discord_id} and plano_key = ${v.plano_key}
           and cargo_ok and cargo_removido_em is null
      `;
      removidos++;
    } else {
      falhas.push(`${v.discord_id} (${v.plano_key}): ${r.erro}`);
    }
  }
  return { removidos, falhas };
}

/* ------------------------------------------------------------------ admin */

async function exigirCupula(): Promise<{ ok: true; discordId: string } | Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!canManageEconomy(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só a cúpula mexe no VIP." };
  }
  return { ok: true, discordId: session.user.discordId };
}

export async function salvarTag(tag: string): Promise<Resultado> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return s;
  const limpa = tag.trim().replace(/^\$/, "");
  if (limpa && !/^[a-z0-9._-]{2,40}$/i.test(limpa)) {
    return { ok: false, mensagem: "InfiniteTag inválida — só letras, números, ponto, traço ou _." };
  }
  await sql`
    update vip_config set infinite_tag = ${limpa}, updated_at = now(), updated_by = ${s.discordId}
     where id = 1
  `;
  return {
    ok: true,
    mensagem: limpa ? `Doações ligadas na InfiniteTag $${limpa}.` : "Doações desligadas.",
  };
}

export async function salvarPlano(args: {
  key: string;
  nome: string;
  precoReais: number;
  paletasNoMes: number;
  beneficios: string[];
  itens: ItemDoKit[];
  boosters: number;
  destaque: boolean;
  ativo: boolean;
}): Promise<Resultado> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return s;
  if (!args.nome.trim() || args.nome.trim().length > 40) {
    return { ok: false, mensagem: "O nome precisa ter de 1 a 40 caracteres." };
  }
  const centavos = Math.round(args.precoReais * 100);
  if (!Number.isFinite(centavos) || centavos < 100) {
    return { ok: false, mensagem: "O valor mínimo é R$ 1,00." };
  }
  if (!Number.isInteger(args.paletasNoMes) || args.paletasNoMes < 0) {
    return { ok: false, mensagem: "Paletas do mês precisa ser um número inteiro, 0 ou mais." };
  }
  const beneficios = args.beneficios.map((b) => b.trim()).filter(Boolean).slice(0, 30);

  if (!Number.isInteger(args.boosters) || args.boosters < 0 || args.boosters > 50) {
    return { ok: false, mensagem: "Boosters precisa ser um número inteiro de 0 a 50." };
  }
  if (args.itens.length > 30) return { ok: false, mensagem: "No máximo 30 itens diferentes por plano." };
  const itens: ItemDoKit[] = [];
  for (const i of args.itens) {
    const itemId = String(i.itemId ?? "").trim();
    if (!/^[A-Za-z0-9_]+$/.test(itemId)) return { ok: false, mensagem: "Um dos itens está com ID inválido." };
    if (!Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > 99_999) {
      return { ok: false, mensagem: `Quantidade de "${nomeDoItem(itemId)}" inválida.` };
    }
    if (itens.some((x) => x.itemId === itemId)) continue;
    itens.push({ itemId, quantidade: i.quantidade });
  }

  const r = (await sql`
    update vip_planos
       set nome = ${args.nome.trim()}, preco_centavos = ${centavos},
           paletas_no_mes = ${args.paletasNoMes}, beneficios = ${JSON.stringify(beneficios)},
           itens = ${JSON.stringify(itens)}, boosters = ${args.boosters},
           destaque = ${args.destaque}, ativo = ${args.ativo},
           updated_at = now(), updated_by = ${s.discordId}
     where key = ${args.key}
    returning key
  `) as { key: string }[];
  if (!r.length) return { ok: false, mensagem: "Plano não encontrado." };
  return { ok: true, mensagem: `"${args.nome.trim()}" salvo.` };
}

export interface DoacaoAdmin {
  id: number;
  discordId: string;
  planoNome: string;
  valorCentavos: number;
  status: string;
  vipAte: string | null;
  detail: string;
  receiptUrl: string | null;
  createdAt: string;
  /** 'sem' quando a doação não tinha item do jogo. */
  itensStatus: "sem" | "pendente" | "entregando" | "entregue";
  itensDetail: string;
}

export async function doacoesRecentes(): Promise<DoacaoAdmin[]> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return [];
  const rows = (await sql`
    select id, discord_id, plano_nome, valor_centavos, status, vip_ate, detail, receipt_url, created_at,
           case when jsonb_array_length(itens) = 0 then 'sem' else itens_status end as itens_status,
           itens_detail
    from vip_doacoes
    where status <> 'aguardando' or created_at > now() - interval '2 days'
    order by id desc
    limit 50
  `) as {
    id: number; discord_id: string; plano_nome: string; valor_centavos: number; status: string;
    vip_ate: string | null; detail: string; receipt_url: string | null; created_at: string;
    itens_status: DoacaoAdmin["itensStatus"]; itens_detail: string;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    discordId: r.discord_id,
    planoNome: r.plano_nome,
    valorCentavos: r.valor_centavos,
    status: r.status,
    vipAte: r.vip_ate,
    detail: r.detail,
    receiptUrl: r.receipt_url,
    createdAt: r.created_at,
    itensStatus: r.itens_status,
    itensDetail: r.itens_detail,
  }));
}

export async function reentregar(id: number): Promise<Resultado> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return s;
  return entregar(id);
}
