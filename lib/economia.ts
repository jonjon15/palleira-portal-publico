import { sql } from "@/lib/db";

/**
 * A carteira de Paletas (§7.1 e §7.8 do PROMPT.md).
 *
 * Decisão C da §7.1: **o site é o dono da economia**. O Palbot hospedado não
 * tem API, então não há como manter duas fontes de verdade em sincronia — e
 * duas moedas divergindo vira suporte infinito.
 *
 * As duas regras que não se quebram:
 *
 * 1. **Saldo é a soma do extrato.** Não existe UPDATE de saldo em lugar
 *    nenhum. Toda mudança é uma linha nova, com origem registrada.
 * 2. **Toda operação tem chave de idempotência.** Clique duplo, retry de
 *    rede e webhook repetido não podem gerar duas transações.
 */

/** As origens possíveis de uma linha do extrato. */
export type Origem =
  | "daily"
  | "doacao"
  | "venda"
  | "compra"
  | "taxa"
  | "slot"
  | "ajuste"
  | "migracao"
  | "evento";

export const ORIGEM_LABEL: Record<Origem, string> = {
  daily: "Daily",
  doacao: "Doação",
  venda: "Venda no mercado",
  compra: "Compra no mercado",
  taxa: "Taxa de venda",
  slot: "Slot de cofre",
  ajuste: "Ajuste da administração",
  migracao: "Saldo trazido do Palbot",
  evento: "Evento",
};

export interface Lancamento {
  id: number;
  delta: number;
  saldoDepois: number;
  origem: Origem;
  descricao: string;
  em: string;
}

/** Quanto o `/daily` paga. Calibrado na §7.1 — não mexer sem refazer a tabela. */
export const DAILY_PALETAS = 2;

/* ------------------------------------------------------------------ leitura */

export async function saldo(discordId: string): Promise<number> {
  const rows = (await sql`
    select coalesce(sum(delta), 0)::int as total
    from ledger
    where discord_id = ${discordId}
  `) as { total: number }[];
  return rows[0]?.total ?? 0;
}

export async function extrato(
  discordId: string,
  limite = 50,
): Promise<Lancamento[]> {
  const rows = (await sql`
    select id, delta, balance_after, kind, descricao, created_at
    from ledger
    where discord_id = ${discordId}
    order by created_at desc, id desc
    limit ${limite}
  `) as {
    id: number;
    delta: number;
    balance_after: number;
    kind: string;
    descricao: string;
    created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    delta: r.delta,
    saldoDepois: r.balance_after,
    origem: r.kind as Origem,
    descricao: r.descricao,
    em: r.created_at,
  }));
}

/* ------------------------------------------------------------------ escrita */

export type ResultadoLancamento =
  | { status: "ok"; saldo: number }
  | { status: "repetido"; saldo: number }
  | { status: "sem-saldo"; saldo: number };

/**
 * Lança uma linha no extrato.
 *
 * Tudo acontece numa instrução só: ler o saldo, somar o delta e gravar. Sem
 * ida e volta ao banco no meio, duas requisições simultâneas não conseguem
 * ler o mesmo saldo velho e gastar a mesma Paleta duas vezes.
 *
 * O `where` no fim é a trava de saldo negativo: se a conta não fecha, a linha
 * simplesmente não nasce.
 */
export async function lancar(opcoes: {
  discordId: string;
  delta: number;
  origem: Origem;
  descricao?: string;
  refId?: string;
  chave: string;
  actorId?: string;
}): Promise<ResultadoLancamento> {
  const {
    discordId,
    delta,
    origem,
    descricao = "",
    refId = null,
    chave,
    actorId = null,
  } = opcoes;

  if (!Number.isInteger(delta)) {
    throw new Error("Paleta é sempre inteira — delta quebrado não entra");
  }

  const gravado = (await sql`
    with atual as (
      select coalesce(sum(delta), 0)::int as saldo
      from ledger
      where discord_id = ${discordId}
    )
    insert into ledger
      (discord_id, delta, balance_after, kind, descricao, ref_id,
       idempotency_key, actor_id)
    select ${discordId}, ${delta}, atual.saldo + ${delta}, ${origem},
           ${descricao}, ${refId}, ${chave}, ${actorId}
    from atual
    where atual.saldo + ${delta} >= 0
    on conflict (idempotency_key) do nothing
    returning balance_after
  `) as { balance_after: number }[];

  if (gravado.length) {
    return { status: "ok", saldo: gravado[0].balance_after };
  }

  // Não gravou. Ou a chave já existia (retry, e está tudo certo), ou o saldo
  // não cobria. Só uma consulta separa os dois casos.
  const jaExiste = (await sql`
    select balance_after from ledger where idempotency_key = ${chave}
  `) as { balance_after: number }[];

  if (jaExiste.length) {
    return { status: "repetido", saldo: await saldo(discordId) };
  }
  return { status: "sem-saldo", saldo: await saldo(discordId) };
}

/* ---------------------------------------------------------------- migração */

/**
 * Traz o saldo que a pessoa já tinha no Palbot (§7.1, decisão C).
 *
 * A chave é o próprio ID da pessoa: rodar a migração duas vezes não credita
 * duas vezes. Se alguém foi migrado com valor errado, a correção é um
 * **ajuste** com motivo — nunca uma segunda migração escondendo a primeira.
 */
export async function migrarDoPalbot(
  discordId: string,
  quanto: number,
  actorId: string,
): Promise<ResultadoLancamento> {
  if (quanto < 0) throw new Error("Migração não aceita valor negativo");
  return lancar({
    discordId,
    delta: quanto,
    origem: "migracao",
    descricao: "Saldo que você já tinha no Palbot",
    chave: `migracao:${discordId}`,
    actorId,
  });
}

export async function jaFoiMigrado(discordId: string): Promise<boolean> {
  const rows = (await sql`
    select 1 from ledger where idempotency_key = ${`migracao:${discordId}`}
  `) as unknown[];
  return rows.length > 0;
}

/**
 * Ajuste manual da administração.
 *
 * Motivo é obrigatório (§7.8): saldo mexido sem explicação registrada é como
 * a economia de servidor morre de desconfiança.
 */
export async function ajustar(opcoes: {
  discordId: string;
  delta: number;
  motivo: string;
  actorId: string;
}): Promise<ResultadoLancamento> {
  const motivo = opcoes.motivo.trim();
  if (!motivo) throw new Error("Ajuste sem motivo não entra no extrato");

  return lancar({
    discordId: opcoes.discordId,
    delta: opcoes.delta,
    origem: "ajuste",
    descricao: motivo,
    chave: `ajuste:${crypto.randomUUID()}`,
    actorId: opcoes.actorId,
  });
}

/* ------------------------------------------------------------- visão geral */

export interface Circulacao {
  total: number;
  carteiras: number;
  porOrigem: { origem: Origem; entrou: number; saiu: number }[];
}

/** Quanta Paleta existe no mundo e de onde ela veio (§7.10, /admin/economia). */
export async function circulacao(): Promise<Circulacao> {
  const [geral, origens] = await Promise.all([
    sql`
      select coalesce(sum(delta), 0)::int as total,
             count(distinct discord_id)::int as carteiras
      from ledger
    ` as unknown as Promise<{ total: number; carteiras: number }[]>,
    sql`
      select kind,
             coalesce(sum(delta) filter (where delta > 0), 0)::int as entrou,
             coalesce(sum(-delta) filter (where delta < 0), 0)::int as saiu
      from ledger
      group by kind
      order by 2 desc
    ` as unknown as Promise<{ kind: string; entrou: number; saiu: number }[]>,
  ]);

  return {
    total: geral[0]?.total ?? 0,
    carteiras: geral[0]?.carteiras ?? 0,
    porOrigem: origens.map((o) => ({
      origem: o.kind as Origem,
      entrou: o.entrou,
      saiu: o.saiu,
    })),
  };
}

/** Maiores saldos — para o admin conferir a migração de olho. */
export async function maioresSaldos(limite = 25) {
  return (await sql`
    select discord_id, coalesce(sum(delta), 0)::int as total
    from ledger
    group by discord_id
    having coalesce(sum(delta), 0) <> 0
    order by total desc
    limit ${limite}
  `) as { discord_id: string; total: number }[];
}

/* -------------------------------------------------------------------- daily */

/**
 * O dia da Paleta vira à meia-noite de Brasília.
 *
 * É mais fácil de explicar para a comunidade que um cooldown rolando de 24h
 * ("por que ainda não liberou? peguei ontem!") e faz a chave de idempotência
 * cuidar do limite sozinha: uma linha por pessoa por dia, e pronto.
 */
export function diaDaPaleta(agora = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export const chaveDoDaily = (discordId: string, dia = diaDaPaleta()) =>
  `daily:${discordId}:${dia}`;

/** Se já pegou hoje, quando vira a virada — para o contador na tela. */
export function proximoDaily(agora = new Date()): Date {
  const brt = new Date(
    agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const virada = new Date(brt);
  virada.setHours(24, 0, 0, 0);
  return new Date(agora.getTime() + (virada.getTime() - brt.getTime()));
}

export async function jaPegouODaily(discordId: string): Promise<boolean> {
  const rows = (await sql`
    select 1 from ledger where idempotency_key = ${chaveDoDaily(discordId)}
  `) as unknown[];
  return rows.length > 0;
}
