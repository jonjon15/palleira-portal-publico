import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { canManageEconomy, levelOf, planoOf, MENSAGEM_SO_MEMBRO } from "@/lib/roles";
import { activeServers, serverBySlug } from "@/lib/servers";
import { logarNoDiscord, listarMembros, buscarMembro } from "@/lib/discord";
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
 * tipos — XP, Drop de Pals, Coleta — e pode misturar.
 *
 * **Quem aplica é o servidor, não o site.** O Palworld só lê as taxas no
 * boot e reescreve o `.ini` ao desligar, então o site não tem como mudar
 * taxa com o jogo no ar. O startup command roda `vigia/booster_boot.py`
 * antes do jogo abrir; ele chama `aplicarNoBoot` e grava o que voltar. Por
 * isso o booster entra no próximo RR do painel (de 4 em 4 horas) e o site
 * nunca derruba servidor. E por isso "ativo" aqui é verdade: só vira ativo
 * quando o próprio servidor ligou pedindo.
 *
 * Fila **por tipo** (migração 031): cada (booster, tipo) é gasto num ciclo,
 * na ordem de pagamento. Pedir com outro já ligado mantém o que foi
 * escolhido e acrescenta o que faltar — XP ligado + pedido de XP e Drop =
 * Drop entra no próximo RR e o XP novo estende o XP por mais um ciclo. A
 * taxa nunca passa de 2x: o tipo está ligado ou não está.
 */

export type TipoBooster = "xp" | "drop" | "coleta";

/**
 * Captura saiu a pedido do dono (24/09/2026), e o Drop foi separado em dois
 * no mesmo dia: o que cai dos Pals e o que sai da coleta no mapa.
 */
export const TIPOS: Record<TipoBooster, { rotulo: string; chaves: string[] }> = {
  xp: { rotulo: "XP", chaves: ["ExpRate"] },
  drop: { rotulo: "Drop de Pals", chaves: ["EnemyDropItemRate"] },
  coleta: { rotulo: "Coleta", chaves: ["CollectionDropRate"] },
};

export const rotuloDoTipo = (t: string) => (TIPOS as Record<string, { rotulo: string }>)[t]?.rotulo ?? t;

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

/** Cada booster do VIP usado volta depois disto. */
export const DIAS_DO_CREDITO = 30;
const JANELA_CREDITO = `${DIAS_DO_CREDITO} days`;

export interface CreditosVip {
  disponiveis: number;
  total: number;
  /** Quando o próximo booster gasto volta — null se nada foi gasto. */
  proximoVolta: string | null;
}

/** Quantos boosters por período o plano do cargo dá (vip_planos.boosters). */
async function boostersDoPlano(roles: string[]): Promise<number> {
  const plano = planoOf(roles);
  if (!plano) return 0;
  const [p] = (await sql`select boosters from vip_planos where key = ${plano.key}`) as { boosters: number }[];
  return p?.boosters ?? 0;
}

/**
 * Gasto nos últimos 30 dias: boosters pedidos com crédito do VIP + acertos
 * da staff (`booster_ajustes`). É uma expressão só, para caber tanto na
 * leitura quanto na trava do insert em `pedirBooster`.
 */
async function gastos(discordIds: string[]): Promise<Map<string, { usados: number; primeiro: string | null }>> {
  if (discordIds.length === 0) return new Map();
  const rows = (await sql`
    select discord_id, sum(n)::int as usados, min(quando) as primeiro
      from (
        select discord_id, 1 as n, created_at as quando
          from boosters
         where origem = 'vip' and discord_id = any(${discordIds}::text[])
           and created_at > now() - ${JANELA_CREDITO}::interval
        union all
        select discord_id, consumidos, created_at
          from booster_ajustes
         where discord_id = any(${discordIds}::text[])
           and created_at > now() - ${JANELA_CREDITO}::interval
      ) g
     group by discord_id
  `) as { discord_id: string; usados: number; primeiro: string | null }[];
  return new Map(rows.map((r) => [r.discord_id, { usados: r.usados, primeiro: r.primeiro }]));
}

/**
 * Os boosters do VIP, pelo CARGO do Discord (pedido do dono em 24/09/2026):
 * Hard Metal, New Metal e Palleira dão os do plano, e cada um gasto volta
 * 30 dias depois. Perdeu o cargo, perdeu os boosters. Acabaram, doa avulso.
 */
export async function creditosVip(discordId: string, roles: string[]): Promise<CreditosVip> {
  const total = await boostersDoPlano(roles);
  if (total === 0) return { total: 0, disponiveis: 0, proximoVolta: null };
  const g = (await gastos([discordId])).get(discordId);
  const usados = g?.usados ?? 0;
  return {
    total,
    disponiveis: Math.max(0, total - usados),
    proximoVolta: g?.primeiro
      ? new Date(new Date(g.primeiro).getTime() + DIAS_DO_CREDITO * 86_400_000).toISOString()
      : null,
  };
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
    // seguidos não gastam o mesmo crédito duas vezes. O total vem do cargo
    // (sessão relida a cada 5 min), o gasto é contado aqui dentro.
    const total = await boostersDoPlano(session.user.roles);
    const r = (await sql`
      insert into boosters (discord_id, server_slug, tipos, origem, multiplicador, status, pago_em)
      select ${discordId}, ${server.slug}, ${v.tipos}::text[], 'vip', ${cfg.multiplicador}, 'na_fila', now()
       where ${total}::int > (
         (select count(*) from boosters
           where origem = 'vip' and discord_id = ${discordId}
             and created_at > now() - ${JANELA_CREDITO}::interval)
         + (select coalesce(sum(consumidos), 0) from booster_ajustes
             where discord_id = ${discordId}
               and created_at > now() - ${JANELA_CREDITO}::interval)
       )
      returning id
    `) as { id: number }[];
    if (!r.length) return { ok: false, mensagem: "Você não tem booster do VIP sobrando." };
    await logarNoDiscord(
      `🚀 Booster **${rotulo}** no ${server.shortName} (crédito VIP) — <@${discordId}> · entra no próximo RR`,
    );
    return {
      ok: true,
      mensagem:
        `Booster ${rotulo} na fila do ${server.shortName}. Ele entra no próximo restart; ` +
        `se o tipo já estiver ligado, o seu estende o tempo (nunca passa de 2x).`,
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

const JANELA = `${MESMO_CICLO_HORAS} hours`;

/**
 * Até quando um booster ligado em `ativadoEm` vale de verdade. Todo boot
 * dentro da janela de 3,5h reaplica o mesmo booster, então ele só sai no
 * primeiro RR do painel depois dela. O RR é às 0, 4, 8, 12, 16 e 20h de
 * Brasília (UTC-3, sem horário de verão) — em UTC, 3, 7, 11, 15, 19 e 23h.
 *
 * A tela usava só a janela de 3,5h e mostrava "Sem booster agora" na última
 * meia hora do ciclo (ou mais, quando ligou num restart manual), com o
 * servidor ainda em 2x.
 */
function fimDoCiclo(ativadoEm: string | Date): number {
  const t = new Date(ativadoEm).getTime() + MESMO_CICLO_HORAS * 3600_000;
  const d = new Date(t);
  d.setUTCMinutes(0, 0, 0);
  // Horas de RR em UTC: (h + 1) % 4 === 0 → 3, 7, 11, 15, 19, 23.
  while (d.getTime() < t || (d.getUTCHours() + 1) % 4 !== 0) d.setUTCHours(d.getUTCHours() + 1);
  return d.getTime();
}

interface UsoDoCiclo {
  booster_id: number;
  tipo: string;
  multiplicador: string;
  ativado_em: string;
}

async function usosDoCiclo(serverSlug: string): Promise<UsoDoCiclo[]> {
  return (await sql`
    select u.booster_id, u.tipo, b.multiplicador, u.ativado_em
      from booster_usos u
      join boosters b on b.id = u.booster_id
     where u.server_slug = ${serverSlug}
       and u.ativado_em > now() - ${JANELA}::interval
  `) as UsoDoCiclo[];
}

/**
 * O servidor acabou de ligar e pergunta o que vale neste ciclo.
 *
 * `base` são as taxas que ele leu do `.ini` sem booster. Volta o que gravar
 * por cima (vazio = taxa normal).
 *
 * Um uso ativado há menos de 3,5h é o mesmo ciclo (queda, restart manual):
 * é reaplicado sem gastar fila. Passou disso, é ciclo novo, e cada tipo
 * pega o próximo pedido da fila dele — no máximo um por tipo, por isso a
 * taxa nunca passa do multiplicador.
 */
export async function aplicarNoBoot(
  serverSlug: string,
  base: Record<string, number>,
): Promise<{ tipos: TipoBooster[]; valores: Record<string, number>; boosters: number[] }> {
  let usos = await usosDoCiclo(serverSlug);
  let cicloNovo = false;

  const cfg = await configBooster();
  if (usos.length === 0 && cfg.ativo) {
    for (const tipo of Object.keys(TIPOS)) {
      const r = (await sql`
        insert into booster_usos (booster_id, server_slug, tipo)
        select b.id, b.server_slug, ${tipo}
          from boosters b
         where b.server_slug = ${serverSlug}
           and b.status in ('na_fila', 'ativo')
           and ${tipo} = any(b.tipos)
           and not exists (select 1 from booster_usos u where u.booster_id = b.id and u.tipo = ${tipo})
         order by b.pago_em, b.id
         limit 1
        on conflict (booster_id, tipo) do nothing
        returning id
      `) as { id: number }[];
      if (r.length) cicloNovo = true;
    }
    if (cicloNovo) usos = await usosDoCiclo(serverSlug);
  }

  // Status de cada pedido: ligado se tem uso neste ciclo; encerrado quando
  // todos os tipos dele já foram usados; senão, esperando.
  await sql`
    update boosters b
       set status = case
             when exists (select 1 from booster_usos u
                           where u.booster_id = b.id and u.ativado_em > now() - ${JANELA}::interval)
               then 'ativo'
             when (select count(*) from booster_usos u where u.booster_id = b.id) >= cardinality(b.tipos)
               then 'encerrado'
             else 'na_fila'
           end,
           ativado_em = coalesce(b.ativado_em,
             (select min(u.ativado_em) from booster_usos u where u.booster_id = b.id)),
           updated_at = now()
     where b.server_slug = ${serverSlug} and b.status in ('na_fila', 'ativo')
  `;
  await sql`
    update boosters set encerrado_em = now()
     where server_slug = ${serverSlug} and status = 'encerrado' and encerrado_em is null
  `;

  const valores: Record<string, number> = {};
  const tipos = new Set<TipoBooster>();
  for (const u of usos) {
    if (!ehTipo(u.tipo)) continue;
    tipos.add(u.tipo);
    const taxas: Record<string, [number, number]> = {};
    for (const chave of TIPOS[u.tipo].chaves) {
      const atual = base[chave];
      if (typeof atual !== "number" || !Number.isFinite(atual)) continue;
      // Nunca soma: o tipo está ligado ou não, e vale o maior multiplicador.
      const novo = Math.round(atual * Number(u.multiplicador) * 100) / 100;
      valores[chave] = Math.max(valores[chave] ?? 0, novo);
      taxas[chave] = [atual, valores[chave]];
    }
    await sql`
      update booster_usos set taxas = ${JSON.stringify(taxas)}
       where booster_id = ${u.booster_id} and tipo = ${u.tipo}
    `;
  }

  if (cicloNovo) {
    await logarNoDiscord(
      `🔥 Booster ligado no ${serverBySlug(serverSlug)?.shortName ?? serverSlug}: ` +
        Object.entries(valores).map(([k, n]) => `${k} ${base[k]} → ${n}`).join(", "),
    );
  }

  return {
    tipos: [...tipos],
    valores,
    boosters: [...new Set(usos.map((u) => Number(u.booster_id)))],
  };
}

/* ----------------------------------------------------------------- telas */

export interface SituacaoDoServidor {
  slug: string;
  nome: string;
  /** Tipos turbinados agora (vazio = sem booster). */
  ativos: TipoBooster[];
  ate: string | null;
  taxas: Record<string, [number, number]>;
  /** Quantos ciclos de cada tipo ainda esperam — cada um é mais 4h. */
  fila: Partial<Record<TipoBooster, number>>;
}

export async function situacaoDosServidores(): Promise<SituacaoDoServidor[]> {
  const [usos, fila] = await Promise.all([
    sql`
      select server_slug, tipo, ativado_em, taxas
        from booster_usos
       where ativado_em > now() - interval '9 hours'
    `.then((r) =>
      (r as { server_slug: string; tipo: string; ativado_em: string; taxas: Record<string, [number, number]> }[])
        .filter((u) => Date.now() < fimDoCiclo(u.ativado_em)),
    ),
    sql`
      select b.server_slug, t.tipo, count(*)::int as n
        from boosters b
       cross join unnest(b.tipos) as t(tipo)
       where b.status in ('na_fila', 'ativo')
         and not exists (select 1 from booster_usos u where u.booster_id = b.id and u.tipo = t.tipo)
       group by 1, 2
    `.then((r) => r as { server_slug: string; tipo: string; n: number }[]),
  ]);

  return servidoresComBooster().map((s) => {
    const meus = usos.filter((u) => u.server_slug === s.slug && ehTipo(u.tipo));
    const fins = meus.map((u) => fimDoCiclo(u.ativado_em));
    const esperando: Partial<Record<TipoBooster, number>> = {};
    for (const f of fila) {
      if (f.server_slug === s.slug && ehTipo(f.tipo)) esperando[f.tipo] = f.n;
    }
    return {
      slug: s.slug,
      nome: s.shortName,
      ativos: [...new Set(meus.map((u) => u.tipo as TipoBooster))],
      ate: fins.length ? new Date(Math.min(...fins)).toISOString() : null,
      taxas: Object.assign({}, ...meus.map((u) => u.taxas)),
      fila: esperando,
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

/**
 * Booster dado pela staff, sem Pix (pedido do dono em 24/09/2026): evento,
 * prêmio, compensação. Entra na mesma fila, com as mesmas regras (um ciclo
 * por tipo, nunca acima do multiplicador), e fica no nome de quem deu.
 */
export async function concederBoosterStaff(args: {
  serverSlug: string;
  tipos: string[];
  motivo: string;
}): Promise<Resultado> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return s;

  const v = validar(args.serverSlug, args.tipos);
  if (!("tipos" in v)) return v;
  const server = serverBySlug(args.serverSlug)!;
  const cfg = await configBooster();
  const motivo = args.motivo.trim().slice(0, 200);

  await sql`
    insert into boosters (discord_id, server_slug, tipos, origem, multiplicador, status, pago_em, detail)
    values (${s.discordId}, ${server.slug}, ${v.tipos}::text[], 'staff', ${cfg.multiplicador}, 'na_fila', now(), ${motivo})
  `;
  const rotulo = v.tipos.map((t) => TIPOS[t].rotulo).join(" + ");
  await logarNoDiscord(
    `🎁 Booster **${rotulo}** no ${server.shortName} dado pela staff — <@${s.discordId}>` +
      (motivo ? ` · ${motivo}` : "") +
      " · entra no próximo RR",
  );
  return {
    ok: true,
    mensagem: `Booster ${rotulo} na fila do ${server.shortName}. Entra no próximo restart.`,
  };
}

export interface VipComBoosters {
  discordId: string;
  nome: string;
  plano: string;
  total: number;
  disponiveis: number;
}

/** Todo mundo com cargo VIP no Discord agora, e quantos boosters sobram. */
export async function vipsComBoosters(): Promise<VipComBoosters[]> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return [];
  const [membros, planos] = await Promise.all([
    listarMembros(),
    sql`select key, boosters from vip_planos`.then((r) => r as { key: string; boosters: number }[]),
  ]);
  const porPlano = new Map(planos.map((p) => [p.key, p.boosters]));
  const vips = membros
    .map((m) => ({ m, plano: planoOf(m.roles) }))
    .filter((x): x is { m: (typeof membros)[number]; plano: NonNullable<ReturnType<typeof planoOf>> } => x.plano !== null);
  const g = await gastos(vips.map((v) => v.m.id));
  return vips
    .map(({ m, plano }) => {
      const total = porPlano.get(plano.key) ?? 0;
      return {
        discordId: m.id,
        nome: m.displayName,
        plano: plano.nome,
        total,
        disponiveis: Math.max(0, total - (g.get(m.id)?.usados ?? 0)),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * A staff acerta quantos boosters a pessoa ainda pode usar neste período
 * (alguns já usaram por fora). Grava a diferença em `booster_ajustes`, que
 * vence em 30 dias como qualquer uso.
 */
export async function definirBoostersRestantes(args: {
  discordId: string;
  restantes: number;
}): Promise<Resultado> {
  const s = await exigirCupula();
  if (!("discordId" in s)) return s;
  if (!Number.isInteger(args.restantes) || args.restantes < 0 || args.restantes > 50) {
    return { ok: false, mensagem: "Coloque um número de 0 a 50." };
  }
  const membro = await buscarMembro(args.discordId).catch(() => null);
  if (!membro) return { ok: false, mensagem: "Essa pessoa não está no Discord." };
  const atual = await creditosVip(membro.id, membro.roles);
  if (atual.total === 0) return { ok: false, mensagem: `${membro.displayName} não tem cargo VIP.` };

  const diferenca = atual.disponiveis - args.restantes;
  if (diferenca !== 0) {
    await sql`
      insert into booster_ajustes (discord_id, consumidos, motivo, por)
      values (${membro.id}, ${diferenca}, 'acerto da staff', ${s.discordId})
    `;
  }
  return {
    ok: true,
    mensagem: `${membro.displayName} agora tem ${args.restantes} de ${atual.total} boosters neste período.`,
  };
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
