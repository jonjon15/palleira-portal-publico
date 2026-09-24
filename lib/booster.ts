import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { canManageEconomy, levelOf, MENSAGEM_SO_MEMBRO } from "@/lib/roles";
import { activeServers, serverBySlug } from "@/lib/servers";
import { logarNoDiscord } from "@/lib/discord";
import {
  infiniteTag,
  reais,
  criarCheckout,
  checarPagamento,
  type DadosDoPagamento,
} from "@/lib/infinitepay";

/**
 * Booster da comunidade — pedido do dono em 24/09/2026. Ver
 * `db/migrations/030-booster.sql`.
 *
 * Uma doação (ou um crédito do VIP) turbina a taxa de UM servidor por UM
 * ciclo de restart, para todo mundo que estiver nele. Quem doa escolhe os
 * tipos — XP, Drop, Captura — e pode misturar.
 *
 * **Quem aplica é o servidor, não o site.** O Palworld só lê as taxas no
 * boot e reescreve o `.ini` ao desligar, então o site não tem como mudar
 * taxa com o jogo no ar. O startup command roda `vigia/booster_boot.py`
 * antes do jogo abrir; ele chama `aplicarNoBoot` e grava o que voltar. Por
 * isso o booster entra no próximo RR do painel (de 4 em 4 horas) e o site
 * nunca derruba servidor. E por isso "ativo" aqui é verdade: só vira ativo
 * quando o próprio servidor ligou pedindo.
 *
 * Fila: cada booster entra no primeiro ciclo em que os tipos dele ainda não
 * foram pegos. XP e Drop de duas pessoas podem valer juntos; dois XP
 * entram um depois do outro — o 2x não vira 4x.
 */

export type TipoBooster = "xp" | "drop" | "captura";

export const TIPOS: Record<TipoBooster, { rotulo: string; chaves: string[] }> = {
  xp: { rotulo: "XP", chaves: ["ExpRate"] },
  drop: { rotulo: "Drop", chaves: ["EnemyDropItemRate", "CollectionDropRate"] },
  captura: { rotulo: "Captura", chaves: ["PalCaptureRate"] },
};

const ehTipo = (t: string): t is TipoBooster => t in TIPOS;

/** Um ciclo de RR. Só para a tela estimar até quando vale. */
export const DURACAO_HORAS = 4;
/**
 * Um boot dentro desta janela depois da ativação é o mesmo ciclo (queda,
 * restart manual): o booster é reaplicado em vez de ser dado por gasto.
 */
const MESMO_CICLO_HORAS = 3.5;

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/* ---------------------------------------------------------------- config */

export interface ConfigBooster {
  precoCentavos: number;
  multiplicador: number;
  ativo: boolean;
}

export async function configBooster(): Promise<ConfigBooster> {
  const [c] = (await sql`
    select preco_centavos, multiplicador, ativo from booster_config where id = 1
  `) as { preco_centavos: number; multiplicador: string; ativo: boolean }[];
  return {
    precoCentavos: c?.preco_centavos ?? 500,
    multiplicador: Number(c?.multiplicador ?? 2),
    ativo: c?.ativo ?? false,
  };
}

/** Onde dá para pôr booster: os servidores do site, menos o que está saindo. */
export const servidoresComBooster = () => activeServers().filter((s) => !s.foraDaHome);

/* --------------------------------------------------------- créditos do VIP */

export interface CreditosVip {
  disponiveis: number;
  total: number;
}

/**
 * Os boosters do VIP: cada doação ainda valendo dá os do plano dela, e
 * vencem com ela. Acabou, a pessoa doa um booster avulso como qualquer um.
 */
export async function creditosVip(discordId: string): Promise<CreditosVip> {
  const [r] = (await sql`
    select coalesce(sum(d.boosters), 0)::int as total,
           coalesce(sum(greatest(d.boosters - (
             select count(*) from boosters b where b.vip_doacao_id = d.id
           ), 0)), 0)::int as disponiveis
    from vip_doacoes d
    where d.discord_id = ${discordId}
      and d.status in ('pago', 'entregue')
      and d.vip_ate > now()
      and d.boosters > 0
  `) as { total: number; disponiveis: number }[];
  return { total: r?.total ?? 0, disponiveis: r?.disponiveis ?? 0 };
}

/* ---------------------------------------------------------------- pedir */

function validar(serverSlug: string, tiposBrutos: string[]): { tipos: TipoBooster[] } | Resultado {
  const server = serverBySlug(serverSlug);
  if (!server || server.foraDaHome) return { ok: false, mensagem: "Escolha um servidor válido." };
  const tipos = [...new Set(tiposBrutos)].filter(ehTipo);
  if (tipos.length === 0) return { ok: false, mensagem: "Escolha ao menos um tipo de booster." };
  return { tipos };
}

/**
 * Pede um booster: com crédito do VIP entra direto na fila; sem, abre o Pix
 * da InfinitePay e entra na fila quando o pagamento for confirmado.
 */
export async function pedirBooster(args: {
  serverSlug: string;
  tipos: string[];
  aceitou: boolean;
  usarCredito: boolean;
}): Promise<Resultado & { url?: string }> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) return { ok: false, mensagem: MENSAGEM_SO_MEMBRO };
  const discordId = session.user.discordId;

  const cfg = await configBooster();
  if (!cfg.ativo) return { ok: false, mensagem: "O booster está desligado no momento." };

  const v = validar(args.serverSlug, args.tipos);
  if (!("tipos" in v)) return v;
  const server = serverBySlug(args.serverSlug)!;
  const rotulo = v.tipos.map((t) => TIPOS[t].rotulo).join(" + ");

  if (args.usarCredito) {
    // Um insert só, condicionado a ainda sobrar crédito: dois cliques
    // seguidos não gastam o mesmo crédito duas vezes.
    const r = (await sql`
      insert into boosters (discord_id, server_slug, tipos, origem, vip_doacao_id, multiplicador, status, pago_em)
      select ${discordId}, ${server.slug}, ${v.tipos}::text[], 'vip', d.id, ${cfg.multiplicador}, 'na_fila', now()
        from vip_doacoes d
       where d.discord_id = ${discordId}
         and d.status in ('pago', 'entregue')
         and d.vip_ate > now()
         and d.boosters > (select count(*) from boosters b where b.vip_doacao_id = d.id)
       order by d.vip_ate
       limit 1
      returning id
    `) as { id: number }[];
    if (!r.length) return { ok: false, mensagem: "Você não tem booster do VIP sobrando." };
    await logarNoDiscord(
      `🚀 Booster **${rotulo}** no ${server.shortName} (crédito VIP) — <@${discordId}> · entra no próximo RR`,
    );
    return {
      ok: true,
      mensagem: `Booster ${rotulo} na fila do ${server.shortName}. Ele entra no próximo restart do servidor.`,
    };
  }

  if (!args.aceitou) return { ok: false, mensagem: "Marque que entendeu que é uma doação para continuar." };
  const tag = await infiniteTag();
  if (!tag) return { ok: false, mensagem: "As doações ainda não foram ligadas. Tente mais tarde." };

  const [{ id }] = (await sql`
    insert into boosters (discord_id, server_slug, tipos, origem, multiplicador, valor_centavos)
    values (${discordId}, ${server.slug}, ${v.tipos}::text[], 'doacao', ${cfg.multiplicador}, ${cfg.precoCentavos})
    returning id
  `) as { id: number }[];
  const orderNsu = `boost-${id}`;

  const { url, erro } = await criarCheckout({
    tag,
    orderNsu,
    precoCentavos: cfg.precoCentavos,
    descricao: `Doação à comunidade Palleira — booster ${rotulo} no ${server.shortName}`,
    redirectPath: `/vip/booster/${id}`,
  });
  if (!url) {
    await sql`
      update boosters set status = 'falhou', detail = ${erro.slice(0, 500)}, updated_at = now() where id = ${id}
    `;
    return { ok: false, mensagem: "Não consegui abrir o pagamento agora. Tente de novo em instantes." };
  }
  await sql`
    update boosters set order_nsu = ${orderNsu}, checkout_url = ${url}, updated_at = now() where id = ${id}
  `;
  return { ok: true, mensagem: "", url };
}

/** Confirma com a InfinitePay e põe na fila. Idempotente, como o do VIP. */
export async function confirmarPagamentoBooster(
  d: DadosDoPagamento,
): Promise<{ pago: boolean; transitorio: boolean; motivo: string }> {
  const id = Number(/^boost-(\d+)$/.exec(d.orderNsu)?.[1]);
  if (!id) return { pago: false, transitorio: false, motivo: "order_nsu desconhecido" };

  const [b] = (await sql`
    select status, valor_centavos from boosters where id = ${id}
  `) as { status: string; valor_centavos: number }[];
  if (!b) return { pago: false, transitorio: false, motivo: "booster não existe" };
  if (b.status !== "aguardando" && b.status !== "falhou") {
    return { pago: true, transitorio: false, motivo: "já confirmado" };
  }

  const r = await checarPagamento(d);
  if (!r.pago) return r;
  if (r.valor < b.valor_centavos) {
    await sql`
      update boosters set detail = ${`pago ${r.valor} de ${b.valor_centavos} centavos — fora da fila`},
             updated_at = now()
       where id = ${id}
    `;
    return { pago: false, transitorio: false, motivo: "valor menor que o do booster" };
  }

  const virou = (await sql`
    update boosters
       set status = 'na_fila', pago_em = now(), paid_amount = ${r.valor},
           transaction_nsu = ${d.transactionNsu}, invoice_slug = ${d.slug},
           receipt_url = ${d.receiptUrl ?? null}, capture_method = ${r.captureMethod},
           updated_at = now()
     where id = ${id} and status in ('aguardando', 'falhou')
    returning discord_id, server_slug, tipos, valor_centavos
  `) as { discord_id: string; server_slug: string; tipos: TipoBooster[]; valor_centavos: number }[];

  if (virou.length) {
    const v = virou[0];
    await logarNoDiscord(
      `🚀 Booster **${v.tipos.map((t) => TIPOS[t]?.rotulo ?? t).join(" + ")}** no ` +
        `${serverBySlug(v.server_slug)?.shortName ?? v.server_slug} · ${reais(v.valor_centavos)} — ` +
        `<@${v.discord_id}> · entra no próximo RR`,
    );
  }
  return { pago: true, transitorio: false, motivo: "" };
}

/* ---------------------------------------------------------------- aplicar */

interface LinhaFila {
  id: number;
  tipos: TipoBooster[];
  multiplicador: string;
  ativado_em: string | null;
}

/**
 * O servidor acabou de ligar e pergunta o que vale neste ciclo.
 *
 * `base` são as taxas que ele leu do `.ini` sem booster. Volta o que gravar
 * por cima (vazio = taxa normal). Quem estava ativo de um ciclo anterior é
 * dado por encerrado; quem foi ativado há pouco (queda, restart manual) é
 * reaplicado, sem consumir fila.
 */
export async function aplicarNoBoot(
  serverSlug: string,
  base: Record<string, number>,
): Promise<{ tipos: TipoBooster[]; valores: Record<string, number>; boosters: number[] }> {
  await sql`
    update boosters set status = 'encerrado', encerrado_em = now(), updated_at = now()
     where server_slug = ${serverSlug} and status = 'ativo'
       and ativado_em < now() - (interval '1 hour' * ${MESMO_CICLO_HORAS})
  `;

  let escolhidos = (await sql`
    select id, tipos, multiplicador, ativado_em from boosters
     where server_slug = ${serverSlug} and status = 'ativo'
  `) as LinhaFila[];

  const cfg = await configBooster();
  if (escolhidos.length === 0 && cfg.ativo) {
    const fila = (await sql`
      select id, tipos, multiplicador, ativado_em from boosters
       where server_slug = ${serverSlug} and status = 'na_fila'
       order by pago_em, id
    `) as LinhaFila[];
    const pegos = new Set<string>();
    for (const b of fila) {
      if (b.tipos.some((t) => pegos.has(t))) continue;
      b.tipos.forEach((t) => pegos.add(t));
      escolhidos.push(b);
    }
    if (escolhidos.length) {
      escolhidos = (await sql`
        update boosters set status = 'ativo', ativado_em = now(), updated_at = now()
         where id = any(${escolhidos.map((b) => b.id)}::bigint[]) and status = 'na_fila'
        returning id, tipos, multiplicador, ativado_em
      `) as LinhaFila[];
    }
  }

  const valores: Record<string, number> = {};
  const taxas: Record<string, [number, number]> = {};
  const tipos = new Set<TipoBooster>();
  for (const b of escolhidos) {
    for (const t of b.tipos) {
      if (!ehTipo(t)) continue;
      tipos.add(t);
      for (const chave of TIPOS[t].chaves) {
        const atual = base[chave];
        if (typeof atual !== "number" || !Number.isFinite(atual)) continue;
        const novo = Math.round(atual * Number(b.multiplicador) * 100) / 100;
        valores[chave] = Math.max(valores[chave] ?? 0, novo);
        taxas[chave] = [atual, valores[chave]];
      }
    }
  }

  if (escolhidos.length) {
    await sql`
      update boosters set taxas = ${JSON.stringify(taxas)}, updated_at = now()
       where id = any(${escolhidos.map((b) => b.id)}::bigint[])
    `;
    const novos = escolhidos.filter((b) => b.ativado_em && Date.now() - new Date(b.ativado_em).getTime() < 60_000);
    if (novos.length) {
      await logarNoDiscord(
        `🔥 Booster ligado no ${serverBySlug(serverSlug)?.shortName ?? serverSlug}: ` +
          Object.entries(taxas).map(([k, [a, n]]) => `${k} ${a} → ${n}`).join(", "),
      );
    }
  }

  return { tipos: [...tipos], valores, boosters: escolhidos.map((b) => Number(b.id)) };
}

/* ----------------------------------------------------------------- telas */

export interface SituacaoDoServidor {
  slug: string;
  nome: string;
  /** Tipos turbinados agora (vazio = sem booster). */
  ativos: TipoBooster[];
  ate: string | null;
  taxas: Record<string, [number, number]>;
  /** Tipos esperando, em ordem — o próximo RR pega o que couber. */
  fila: TipoBooster[][];
}

export async function situacaoDosServidores(): Promise<SituacaoDoServidor[]> {
  const rows = (await sql`
    select server_slug, status, tipos, ativado_em, taxas
      from boosters
     where status in ('ativo', 'na_fila')
     order by pago_em, id
  `) as {
    server_slug: string; status: string; tipos: TipoBooster[]; ativado_em: string | null;
    taxas: Record<string, [number, number]>;
  }[];

  return servidoresComBooster().map((s) => {
    const meus = rows.filter((r) => r.server_slug === s.slug);
    const ativos = meus.filter((r) => r.status === "ativo");
    const desde = ativos.map((r) => new Date(r.ativado_em ?? Date.now()).getTime());
    return {
      slug: s.slug,
      nome: s.shortName,
      ativos: [...new Set(ativos.flatMap((r) => r.tipos))],
      ate: desde.length
        ? new Date(Math.min(...desde) + DURACAO_HORAS * 3600_000).toISOString()
        : null,
      taxas: Object.assign({}, ...ativos.map((r) => r.taxas)),
      fila: meus.filter((r) => r.status === "na_fila").map((r) => r.tipos),
    };
  });
}

export interface StatusDoBooster {
  status: string;
  servidor: string;
  tipos: TipoBooster[];
}

/** Para a página de volta do Pix — só o dono enxerga. */
export async function meuBooster(id: number): Promise<StatusDoBooster | null> {
  const session = await auth();
  if (!session) return null;
  const [b] = (await sql`
    select status, server_slug, tipos from boosters
     where id = ${id} and discord_id = ${session.user.discordId}
  `) as { status: string; server_slug: string; tipos: TipoBooster[] }[];
  if (!b) return null;
  return {
    status: b.status,
    servidor: serverBySlug(b.server_slug)?.shortName ?? b.server_slug,
    tipos: b.tipos,
  };
}

/* ----------------------------------------------------------------- admin */

async function exigirCupula(): Promise<{ discordId: string } | Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!canManageEconomy(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só a cúpula mexe no booster." };
  }
  return { discordId: session.user.discordId };
}

export async function salvarConfigBooster(args: {
  precoReais: number;
  multiplicador: number;
  ativo: boolean;
}): Promise<Resultado> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return s;
  const centavos = Math.round(args.precoReais * 100);
  if (!Number.isFinite(centavos) || centavos < 100) return { ok: false, mensagem: "O valor mínimo é R$ 1,00." };
  if (!Number.isFinite(args.multiplicador) || args.multiplicador <= 1 || args.multiplicador > 10) {
    return { ok: false, mensagem: "O multiplicador vai de 1,1 a 10." };
  }
  await sql`
    update booster_config
       set preco_centavos = ${centavos}, multiplicador = ${args.multiplicador}, ativo = ${args.ativo},
           updated_at = now(), updated_by = ${s.discordId}
     where id = 1
  `;
  return { ok: true, mensagem: "Booster salvo. Vale para os próximos pedidos." };
}

export interface BoosterAdmin {
  id: number;
  discordId: string;
  servidor: string;
  tipos: TipoBooster[];
  origem: string;
  status: string;
  valorCentavos: number;
  ativadoEm: string | null;
  createdAt: string;
  detail: string;
}

export async function boostersRecentes(): Promise<BoosterAdmin[]> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return [];
  const rows = (await sql`
    select id, discord_id, server_slug, tipos, origem, status, valor_centavos, ativado_em, created_at, detail
      from boosters
     where status <> 'aguardando' or created_at > now() - interval '2 days'
     order by id desc
     limit 50
  `) as {
    id: number; discord_id: string; server_slug: string; tipos: TipoBooster[]; origem: string;
    status: string; valor_centavos: number; ativado_em: string | null; created_at: string; detail: string;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    discordId: r.discord_id,
    servidor: serverBySlug(r.server_slug)?.shortName ?? r.server_slug,
    tipos: r.tipos,
    origem: r.origem,
    status: r.status,
    valorCentavos: r.valor_centavos,
    ativadoEm: r.ativado_em,
    createdAt: r.created_at,
    detail: r.detail,
  }));
}
