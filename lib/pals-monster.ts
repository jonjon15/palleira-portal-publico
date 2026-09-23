import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { canPowerServer, levelOf } from "@/lib/roles";
import { lancar } from "@/lib/economia";
import { COOLDOWN_RESGATE_HORAS, cofreDePalsCheio } from "@/lib/pal-cofre";
import { paraTemplateDeJson } from "@/lib/admin-entregar-pal";
import type { PalTemplate } from "@/lib/pal-template";

/**
 * Pals Monster — o Pal que a cúpula monta a partir de um JSON e vende na loja
 * (pedido do dono em 23/09/2026). Tabela própria pelos mesmos motivos dos
 * kits (ver `db/migrations/027-pals-monster.sql` e `lib/kits.ts`):
 *
 *   1. **Molde, não peça única.** Cada compra gera uma cópia nova do JSON;
 *      o estoque é opcional (`null` = ilimitado).
 *   2. **Nasce do nada.** A Paleta paga é queimada, como no kit.
 *   3. **Qualquer servidor.** A cópia cai no cofre de Pals do comprador sem
 *      servidor de origem e já sem cooldown — resgata na hora, onde estiver
 *      jogando. Era justamente o que o Mercado não deixava: os Pals Monster
 *      anunciados do Dominantes só podiam ser comprados por quem joga lá.
 */

export interface PalMonster {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  template: PalTemplate;
  /** `null` = ilimitado. */
  estoque: number | null;
  vendidos: number;
  ativo: boolean;
}

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/** Quantos ainda restam — `null` quando o estoque é ilimitado. */
export const restantes = (p: PalMonster) =>
  p.estoque === null ? null : Math.max(0, p.estoque - p.vendidos);

/* ----------------------------------------------------------------- leitura */

interface Linha {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  template: PalTemplate;
  estoque: number | null;
  vendidos: number;
  ativo: boolean;
}

const paraPal = (r: Linha): PalMonster => ({ ...r, id: Number(r.id) });

/** O que a vitrine mostra: no ar e com estoque. */
export async function palsMonsterAVenda(): Promise<PalMonster[]> {
  const rows = (await sql`
    select id, nome, descricao, preco, template, estoque, vendidos, ativo
    from pals_monster
    where ativo and (estoque is null or vendidos < estoque)
    order by preco asc, created_at desc
  `) as Linha[];
  return rows.map(paraPal);
}

/** Todos, inclusive fora do ar e esgotados — só para a tela de admin. */
export async function todosOsPalsMonster(): Promise<PalMonster[]> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return [];
  const rows = (await sql`
    select id, nome, descricao, preco, template, estoque, vendidos, ativo
    from pals_monster
    order by ativo desc, created_at desc
  `) as Linha[];
  return rows.map(paraPal);
}

/* --------------------------------------------------------------- permissão */

async function exigirCupula(): Promise<{ ok: true; discordId: string } | Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só a cúpula monta Pal Monster." };
  }
  return { ok: true, discordId: session.user.discordId };
}

/* ------------------------------------------------------------ montar e editar */

interface Dados {
  nome: string;
  descricao: string;
  preco: number;
  /** Texto do campo: vazio = ilimitado. */
  estoque: string;
  json: string;
}

function validar(d: Dados): { erro: string } | { template: PalTemplate; estoque: number | null } {
  if (!d.nome.trim()) return { erro: "O Pal Monster precisa de um nome." };
  if (d.nome.trim().length > 60) return { erro: "Nome longo demais — até 60 caracteres." };
  if (!Number.isInteger(d.preco) || d.preco < 1) {
    return { erro: "O preço precisa ser um número inteiro de Paletas, a partir de 1." };
  }
  let estoque: number | null = null;
  if (d.estoque.trim()) {
    estoque = Number(d.estoque);
    if (!Number.isInteger(estoque) || estoque < 0) {
      return { erro: "Estoque precisa ser um número inteiro — ou vazio para ilimitado." };
    }
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(d.json);
  } catch {
    return { erro: "JSON inválido — confira a vírgula ou chave faltando." };
  }
  const template = paraTemplateDeJson(bruto);
  if (!template) return { erro: "O JSON precisa ter pelo menos um PalID." };
  return { template, estoque };
}

export async function criarPalMonster(d: Dados): Promise<Resultado & { id?: number }> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;
  const v = validar(d);
  if ("erro" in v) return { ok: false, mensagem: v.erro };

  const [{ id }] = (await sql`
    insert into pals_monster (nome, descricao, preco, template, estoque, criado_por)
    values (${d.nome.trim()}, ${d.descricao.trim()}, ${d.preco},
            ${JSON.stringify(v.template)}, ${v.estoque}, ${staff.discordId})
    returning id
  `) as { id: number }[];
  return { ok: true, mensagem: `"${d.nome.trim()}" está na vitrine.`, id: Number(id) };
}

export async function editarPalMonster(id: number, d: Dados): Promise<Resultado> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;
  const v = validar(d);
  if ("erro" in v) return { ok: false, mensagem: v.erro };

  // O molde pode mudar à vontade: quem já comprou tem a cópia no próprio
  // cofre, e ela não é tocada. Só as próximas compras saem do molde novo.
  const r = (await sql`
    update pals_monster
       set nome = ${d.nome.trim()}, descricao = ${d.descricao.trim()},
           preco = ${d.preco}, template = ${JSON.stringify(v.template)},
           estoque = ${v.estoque}, updated_at = now()
     where id = ${id}
    returning id
  `) as { id: number }[];
  if (!r.length) return { ok: false, mensagem: "Pal Monster não encontrado." };
  return { ok: true, mensagem: `"${d.nome.trim()}" atualizado.` };
}

/** Tira do ar ou devolve à vitrine. Nunca apaga: o histórico de compra aponta para cá. */
export async function alternarPalMonster(id: number, ativo: boolean): Promise<Resultado> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;
  const r = (await sql`
    update pals_monster set ativo = ${ativo}, updated_at = now()
     where id = ${id}
    returning nome
  `) as { nome: string }[];
  if (!r.length) return { ok: false, mensagem: "Pal Monster não encontrado." };
  return {
    ok: true,
    mensagem: ativo ? `"${r[0].nome}" voltou para a vitrine.` : `"${r[0].nome}" saiu da vitrine.`,
  };
}

/** Apaga de vez — só se ninguém comprou. Mesmo motivo de `excluirKit`. */
export async function excluirPalMonster(id: number): Promise<Resultado> {
  const staff = await exigirCupula();
  if (!("discordId" in staff)) return staff;
  const [{ n }] = (await sql`
    select count(*)::int as n from pal_monster_purchases where pal_monster_id = ${id}
  `) as { n: number }[];
  if (n > 0) {
    return {
      ok: false,
      mensagem: `Já foi comprado ${n} ${n === 1 ? "vez" : "vezes"} — apagar apagaria o histórico de quem pagou. Use "Tirar da vitrine".`,
    };
  }
  const r = (await sql`delete from pals_monster where id = ${id} returning nome`) as { nome: string }[];
  if (!r.length) return { ok: false, mensagem: "Pal Monster não encontrado." };
  return { ok: true, mensagem: `"${r[0].nome}" foi apagado.` };
}

/* ---------------------------------------------------------------- comprar */

/**
 * Compra: reserva o estoque, cobra e põe a cópia no cofre de Pals.
 *
 * O estoque é reservado primeiro, num `update ... where vendidos < estoque`:
 * dois cliques no último Pal disputam a mesma linha no banco, e só um leva.
 * Sem saldo, a reserva é desfeita.
 */
export async function comprarPalMonster(id: number): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) {
    return { ok: false, mensagem: "Só quem está no Discord da Palleira compra." };
  }
  const discordId = session.user.discordId;

  // Antes de cobrar: diferente do Mercado, aqui não há vendedor esperando,
  // então dá para simplesmente pedir que a pessoa abra espaço.
  if (await cofreDePalsCheio(discordId, session.user.roles)) {
    return {
      ok: false,
      mensagem: "Seu cofre de Pals está cheio. Compre um slot ou resgate algo antes de comprar.",
    };
  }

  // 1. Reservar uma unidade.
  const reservado = (await sql`
    update pals_monster
       set vendidos = vendidos + 1
     where id = ${id} and ativo and (estoque is null or vendidos < estoque)
    returning nome, preco, template
  `) as { nome: string; preco: number; template: PalTemplate }[];
  if (!reservado.length) {
    return { ok: false, mensagem: "Esse Pal Monster esgotou ou saiu da vitrine." };
  }
  const pal = reservado[0];
  const desfazerReserva = () => sql`
    update pals_monster set vendidos = greatest(vendidos - 1, 0) where id = ${id}
  `;

  // 2. Rastro antes do dinheiro.
  const [{ id: compraId }] = (await sql`
    insert into pal_monster_purchases (pal_monster_id, discord_id, preco)
    values (${id}, ${discordId}, ${pal.preco})
    returning id
  `) as { id: number }[];

  // 3. Cobrar — a chave é a compra: clique duplo não vira cobrança dupla.
  const pagamento = await lancar({
    discordId,
    delta: -pal.preco,
    origem: "compra",
    descricao: `Pal Monster "${pal.nome}"`,
    refId: String(compraId),
    chave: `pal-monster:${compraId}`,
  });
  if (pagamento.status === "sem-saldo") {
    await desfazerReserva();
    await sql`
      update pal_monster_purchases
         set status = 'falhou', detail = 'saldo insuficiente', finished_at = now()
       where id = ${compraId}
    `;
    return { ok: false, mensagem: `Custa ${pal.preco} Paletas e você tem ${pagamento.saldo}.` };
  }

  // 4. A cópia no cofre: sem servidor (resgata em qualquer um) e com
  //    `imported_at` já vencido (resgata na hora) — o cooldown do cofre é
  //    anti-farm de quem guarda o próprio Pal, não de quem comprou.
  //
  //    ⚠️ Daqui para baixo o pagamento já está no extrato. Se o banco cair
  //    agora, a linha em `pal_monster_purchases` fica 'andando' com o
  //    pagamento feito — o conserto é inserir a cópia à mão.
  const [{ id: vaultId }] = (await sql`
    insert into vault_pals (discord_id, pal_id, template, server_slug, imported_at)
    values (${discordId}, ${pal.template.PalID}, ${JSON.stringify(pal.template)}, null,
            now() - (interval '1 hour' * ${COOLDOWN_RESGATE_HORAS}))
    returning id
  `) as { id: number }[];

  await sql`
    update pal_monster_purchases
       set status = 'concluido', vault_pal_id = ${vaultId}, finished_at = now()
     where id = ${compraId}
  `;

  return {
    ok: true,
    mensagem: `"${pal.nome}" está no seu cofre de Pals — resgate no jogo, em qualquer servidor. Saldo: ${pagamento.saldo}.`,
  };
}
