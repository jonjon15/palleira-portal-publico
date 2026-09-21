import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { canPowerServer, levelOf } from "@/lib/roles";
import { nomeDoItem } from "@/lib/itens";
import {
  entregarItensParaJogadores,
  type ItemPedido,
  type ResultadoEntrega,
} from "@/lib/admin-entregar-itens";

/**
 * Kits de prêmio — lote de itens salvo para entregar DE GRAÇA (§026 da
 * migração). Substitui parte de "Entregar itens manual"
 * (`lib/admin-entregar-itens.ts`, que continua sendo o motor de verdade):
 * em vez de montar a lista de itens do zero toda vez, a staff monta um kit
 * uma vez e reusa depois — "Prêmio do evento X" vira 1 clique, não uma
 * grade inteira remontada.
 *
 * Tabela própria, separada de `kits` (a do Mercado) — ver o comentário da
 * migração 026 para o porquê. Sem preço e sem tabela de "compras": a
 * entrega usa o mesmo RCON síncrono de `entregarItensParaJogadores`, então
 * não há nada assíncrono para rastrear.
 */

export interface ItemDoKitPremio {
  itemId: string;
  quantidade: number;
}

export interface KitPremio {
  id: number;
  nome: string;
  descricao: string;
  itens: ItemDoKitPremio[];
  ativo: boolean;
}

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

const MAX_ITENS_POR_KIT = 30;
const MAX_QUANTIDADE_POR_ITEM = 99_999;

/* ----------------------------------------------------------------- leitura */

interface KitPremioRow {
  id: number;
  nome: string;
  descricao: string;
  itens: ItemDoKitPremio[];
  ativo: boolean;
}

const paraKit = (r: KitPremioRow): KitPremio => ({
  id: r.id,
  nome: r.nome,
  descricao: r.descricao,
  itens: r.itens,
  ativo: r.ativo,
});

/** Só os ativos — o que a tela de entrega oferece para escolher. */
export async function kitsPremioAtivos(): Promise<KitPremio[]> {
  const rows = (await sql`
    select id, nome, descricao, itens, ativo
    from kits_premio
    where ativo
    order by nome asc
  `) as KitPremioRow[];
  return rows.map(paraKit);
}

/** Todos, inclusive os arquivados — para a lista de gerenciamento. */
export async function todosOsKitsPremio(): Promise<KitPremio[]> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return [];

  const rows = (await sql`
    select id, nome, descricao, itens, ativo
    from kits_premio
    order by ativo desc, created_at desc
  `) as KitPremioRow[];
  return rows.map(paraKit);
}

/* --------------------------------------------------------------- permissão */

async function exigirCupula(): Promise<{ ok: true; discordId: string } | Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só a cúpula mexe em kit de prêmio." };
  }
  return { ok: true, discordId: session.user.discordId };
}

/* ------------------------------------------------------------ montar kit */

function validar(nome: string, itens: ItemDoKitPremio[]): string | null {
  if (!nome.trim()) return "O kit precisa de um nome.";
  if (nome.trim().length > 60) return "Nome longo demais — até 60 caracteres.";
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

export async function criarKitPremio(args: {
  nome: string;
  descricao: string;
  itens: ItemDoKitPremio[];
}): Promise<Resultado & { id?: number }> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;

  const erro = validar(args.nome, args.itens);
  if (erro) return { ok: false, mensagem: erro };

  const limpos = args.itens.map((i) => ({
    itemId: i.itemId.trim(),
    quantidade: i.quantidade,
  }));

  const [{ id }] = (await sql`
    insert into kits_premio (nome, descricao, itens, criado_por)
    values (${args.nome.trim()}, ${args.descricao.trim()}, ${JSON.stringify(limpos)}, ${staff.discordId})
    returning id
  `) as { id: number }[];

  return { ok: true, mensagem: `Kit "${args.nome.trim()}" criado.`, id };
}

export async function editarKitPremio(args: {
  id: number;
  nome: string;
  descricao: string;
  itens: ItemDoKitPremio[];
}): Promise<Resultado> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;

  const erro = validar(args.nome, args.itens);
  if (erro) return { ok: false, mensagem: erro };

  const limpos = args.itens.map((i) => ({
    itemId: i.itemId.trim(),
    quantidade: i.quantidade,
  }));

  const r = (await sql`
    update kits_premio
       set nome = ${args.nome.trim()},
           descricao = ${args.descricao.trim()},
           itens = ${JSON.stringify(limpos)},
           updated_at = now()
     where id = ${args.id}
    returning id
  `) as { id: number }[];

  if (!r.length) return { ok: false, mensagem: "Kit não encontrado." };
  return { ok: true, mensagem: `Kit "${args.nome.trim()}" atualizado.` };
}

/** Arquiva ou devolve à lista — nunca apaga de fato, mesmo raciocínio de `alternarKit`. */
export async function alternarKitPremio(id: number, ativo: boolean): Promise<Resultado> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;

  const r = (await sql`
    update kits_premio set ativo = ${ativo}, updated_at = now()
     where id = ${id}
    returning nome
  `) as { nome: string }[];

  if (!r.length) return { ok: false, mensagem: "Kit não encontrado." };
  return {
    ok: true,
    mensagem: ativo
      ? `"${r[0].nome}" voltou para a lista.`
      : `"${r[0].nome}" foi arquivado.`,
  };
}

/** Apaga de vez — sem histórico de "compra" prendendo o kit, pode apagar sempre. */
export async function excluirKitPremio(id: number): Promise<Resultado> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;

  const r = (await sql`
    delete from kits_premio where id = ${id} returning nome
  `) as { nome: string }[];

  if (!r.length) return { ok: false, mensagem: "Kit não encontrado." };
  return { ok: true, mensagem: `"${r[0].nome}" foi apagado.` };
}

/* ---------------------------------------------------------------- entregar */

/**
 * Entrega um kit de prêmio salvo para uma lista de jogadores — mesmo motor
 * de `entregarItensParaJogadores` (RCON síncrono, checagem de permissão e
 * de online já acontece lá dentro).
 */
export async function entregarKitPremio(
  kitId: number,
  alvos: { discordId: string; nome: string; uid: string; serverSlug: string }[],
): Promise<{ ok: boolean; mensagem: string; resultados: ResultadoEntrega[] }> {
  const kits = (await sql`
    select id, nome, descricao, itens, ativo from kits_premio where id = ${kitId}
  `) as KitPremioRow[];
  const kit = kits[0];
  if (!kit) return { ok: false, mensagem: "Kit não encontrado.", resultados: [] };

  const itens: ItemPedido[] = kit.itens.map((i) => ({ itemId: i.itemId, quantidade: i.quantidade }));
  return entregarItensParaJogadores(alvos, itens);
}
