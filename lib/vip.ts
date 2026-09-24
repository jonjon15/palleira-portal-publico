import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { PLANOS, canManageEconomy, levelOf } from "@/lib/roles";
import { lancar } from "@/lib/economia";
import { alterarCargo, logarNoDiscord } from "@/lib/discord";

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
 *
 * O cargo vale 30 dias a partir do pagamento; doar de novo antes de vencer
 * soma mais 30. `expirarVips` tira o cargo de quem venceu — só o cargo que
 * ESTA rotina deu, nunca um VIP que a staff deu na mão.
 */

const CHECKOUT = "https://api.checkout.infinitepay.io";
// Fixo de propósito: o webhook e a volta do checkout precisam do endereço
// público, e o `NEXT_PUBLIC_SITE_URL` local é localhost.
const SITE = "https://palleira.com.br";
export const DIAS_DE_VIP = 30;

export interface PlanoVip {
  key: string;
  nome: string;
  precoCentavos: number;
  paletasNoMes: number;
  beneficios: string[];
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
    destaque: r.destaque,
    ativo: r.ativo,
    dailyPaletas: regra.dailyPaletas,
    slotsCofre: regra.slotsCofre,
  };
}

export async function planosVip(soAtivos = true): Promise<PlanoVip[]> {
  const rows = (await sql`
    select key, nome, preco_centavos, paletas_no_mes, beneficios, destaque, ativo
    from vip_planos
    where ${!soAtivos} or ativo
    order by ordem
  `) as LinhaPlano[];
  return rows.map(paraPlano).filter((p): p is PlanoVip => p !== null);
}

export async function infiniteTag(): Promise<string> {
  const [c] = (await sql`select infinite_tag from vip_config where id = 1`) as { infinite_tag: string }[];
  return (c?.infinite_tag ?? "").trim().replace(/^\$/, "");
}

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
    insert into vip_doacoes (discord_id, plano_key, plano_nome, valor_centavos, paletas)
    values (${session.user.discordId}, ${plano.key}, ${plano.nome}, ${plano.precoCentavos}, ${plano.paletasNoMes})
    returning id
  `) as { id: number }[];
  const orderNsu = `vip-${id}`;

  let url = "";
  let erro = "";
  try {
    const res = await fetch(`${CHECKOUT}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: tag,
        order_nsu: orderNsu,
        items: [
          {
            quantity: 1,
            price: plano.precoCentavos,
            description: `Doação à comunidade Palleira — agradecimento VIP ${plano.nome}`,
          },
        ],
        redirect_url: `${SITE}/vip/obrigado/${id}`,
        webhook_url: `${SITE}/api/infinitepay/webhook`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (res.ok && corpo.url) url = corpo.url;
    else erro = corpo.message ?? `InfinitePay respondeu ${res.status}`;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

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

export interface DadosDoPagamento {
  orderNsu: string;
  transactionNsu: string;
  slug: string;
  receiptUrl?: string;
  captureMethod?: string;
}

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

  const tag = await infiniteTag();
  let r: { success?: boolean; paid?: boolean; paid_amount?: number; amount?: number; capture_method?: string };
  try {
    const res = await fetch(`${CHECKOUT}/payment_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: tag,
        order_nsu: d.orderNsu,
        transaction_nsu: d.transactionNsu,
        slug: d.slug,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { pago: false, transitorio: true, motivo: `payment_check ${res.status}` };
    r = await res.json();
  } catch (e) {
    return { pago: false, transitorio: true, motivo: e instanceof Error ? e.message : String(e) };
  }

  if (!r.success || !r.paid) return { pago: false, transitorio: false, motivo: "não consta como pago" };
  const pago = Number(r.paid_amount ?? r.amount ?? 0);
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
           capture_method = ${r.capture_method ?? d.captureMethod ?? null},
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
}

/** Para a página de volta — só a própria pessoa enxerga a doação dela. */
export async function minhaDoacao(id: number): Promise<StatusDaDoacao | null> {
  const session = await auth();
  if (!session) return null;
  const [d] = (await sql`
    select status, plano_nome, vip_ate, cargo_ok, paletas_ok, paletas
    from vip_doacoes where id = ${id} and discord_id = ${session.user.discordId}
  `) as {
    status: string; plano_nome: string; vip_ate: string | null;
    cargo_ok: boolean; paletas_ok: boolean; paletas: number;
  }[];
  if (!d) return null;
  return {
    status: d.status,
    planoNome: d.plano_nome,
    vipAte: d.vip_ate,
    cargoOk: d.cargo_ok,
    paletasOk: d.paletas_ok,
    paletas: d.paletas,
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

  const r = (await sql`
    update vip_planos
       set nome = ${args.nome.trim()}, preco_centavos = ${centavos},
           paletas_no_mes = ${args.paletasNoMes}, beneficios = ${JSON.stringify(beneficios)},
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
}

export async function doacoesRecentes(): Promise<DoacaoAdmin[]> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return [];
  const rows = (await sql`
    select id, discord_id, plano_nome, valor_centavos, status, vip_ate, detail, receipt_url, created_at
    from vip_doacoes
    where status <> 'aguardando' or created_at > now() - interval '2 days'
    order by id desc
    limit 50
  `) as {
    id: number; discord_id: string; plano_nome: string; valor_centavos: number; status: string;
    vip_ate: string | null; detail: string; receipt_url: string | null; created_at: string;
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
  }));
}

export async function reentregar(id: number): Promise<Resultado> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return s;
  return entregar(id);
}
