import { sql } from "@/lib/db";
import { serverBySlug } from "@/lib/servers";
import { getPlayers } from "@/lib/palworld/paldefender";
import { lancar } from "@/lib/economia";

/**
 * Resgate de base pelo próprio jogador, pagando com Paletas (§ restauração
 * paga — handoff `restauracao-paga-fase-2.md`).
 *
 * Decisões já tomadas:
 * - **Destino: só "minha posição atual".** O save não guarda o relevo do
 *   mundo, então a única altura confiável é a de alguém pisando ali agora.
 *   Por isso a posição nunca vem do formulário — é lida ao vivo do
 *   PalDefender, no momento exato da confirmação.
 * - **Preço: primeira restauração grátis (uma vez na vida), da segunda em
 *   diante 100 Paletas fixo.** Decidido em 07/09/2026.
 * - Quem processa o pedido é `tools/processar_fila.py`, pelo cron
 *   `processar-fila` — este arquivo só abre e fecha a linha em
 *   `base_restore_requests`. Nada aqui toca no servidor do jogo.
 */

const PRECO_RESTAURACAO = 100;

export interface BaseResgatavel {
  serverSlug: string;
  serverName: string;
  snapshotId: number;
  pieceCount: number;
  takenAt: string;
}

export interface PedidoAberto {
  id: number;
  serverSlug: string;
  serverName: string;
  status: "fila" | "rodando";
  createdAt: string;
}

export interface PedidoPassado {
  id: number;
  serverSlug: string;
  serverName: string;
  status: string;
  detail: string;
  paletas: number;
  createdAt: string;
  doneAt: string | null;
}

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

const nomeDoServidor = (slug: string) => serverBySlug(slug)?.shortName ?? slug;

/**
 * Uma base por servidor: a de mais peças entre as que este UID é membro.
 *
 * Cobre tanto o arquivo diário (desde 06/09/2026) quanto o backfill de 22/08
 * — para quem procura, as duas fontes são a mesma tabela, sem diferença.
 */
export async function basesResgataveis(uid: string): Promise<BaseResgatavel[]> {
  const rows = (await sql`
    select distinct on (server_slug)
      server_slug, id, piece_count, taken_at
    from base_snapshots
    where ${uid} = any(member_uids) and formato >= 2
    order by server_slug, piece_count desc, taken_at desc
  `) as {
    server_slug: string;
    id: number;
    piece_count: number;
    taken_at: string;
  }[];

  return rows.map((r) => ({
    serverSlug: r.server_slug,
    serverName: nomeDoServidor(r.server_slug),
    snapshotId: r.id,
    pieceCount: r.piece_count,
    takenAt: r.taken_at,
  }));
}

/** O pedido em andamento desta pessoa, se tiver — só um por vez. */
export async function pedidoAberto(discordId: string): Promise<PedidoAberto | null> {
  const rows = (await sql`
    select id, server_slug, status, created_at
    from base_restore_requests
    where discord_id = ${discordId} and status in ('fila', 'rodando')
  `) as {
    id: number;
    server_slug: string;
    status: "fila" | "rodando";
    created_at: string;
  }[];

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    serverSlug: r.server_slug,
    serverName: nomeDoServidor(r.server_slug),
    status: r.status,
    createdAt: r.created_at,
  };
}

/** Os últimos pedidos desta pessoa, feitos ou não — para "o que aconteceu?". */
export async function meuHistorico(discordId: string): Promise<PedidoPassado[]> {
  const rows = (await sql`
    select id, server_slug, status, detail, paletas, created_at, done_at
    from base_restore_requests
    where discord_id = ${discordId} and status in ('feito', 'recusado')
    order by created_at desc
    limit 10
  `) as {
    id: number;
    server_slug: string;
    status: string;
    detail: string;
    paletas: number;
    created_at: string;
    done_at: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    serverSlug: r.server_slug,
    serverName: nomeDoServidor(r.server_slug),
    status: r.status,
    detail: r.detail,
    paletas: r.paletas,
    createdAt: r.created_at,
    doneAt: r.done_at,
  }));
}

/** Já teve alguma restauração concluída? Decide se a próxima é grátis. */
async function jaTeveRestauracaoFeita(discordId: string): Promise<boolean> {
  const rows = (await sql`
    select 1 from base_restore_requests
    where discord_id = ${discordId} and status = 'feito'
    limit 1
  `) as unknown[];
  return rows.length > 0;
}

/** Quanto custaria a próxima restauração desta pessoa, sem gravar nada. */
export async function precoDaProximaRestauracao(discordId: string): Promise<number> {
  return (await jaTeveRestauracaoFeita(discordId)) ? PRECO_RESTAURACAO : 0;
}

/**
 * Pede a restauração: abre a linha em `base_restore_requests` e cobra, se
 * for o caso. A posição nunca vem do formulário — é lida ao vivo agora, do
 * PalDefender, porque só um chão em que alguém está pisando tem altura
 * confiável.
 */
export async function pedirRestauracao(opts: {
  discordId: string;
  uid: string;
  serverSlug: string;
  snapshotId: number;
}): Promise<Resultado> {
  const server = serverBySlug(opts.serverSlug);
  if (!server) return { ok: false, mensagem: "Servidor inválido." };

  // Checagem cedo por mensagem melhor — o índice único do banco garante o
  // mesmo, mas devolve um erro genérico de unique_violation.
  if (await pedidoAberto(opts.discordId)) {
    return {
      ok: false,
      mensagem: "Você já tem um pedido em andamento. Espere ele terminar.",
    };
  }

  const jogadores = await getPlayers(server).catch(() => []);
  const eu = jogadores.find((p) => p.playerUid === opts.uid);
  if (!eu?.online) {
    return {
      ok: false,
      mensagem:
        "Você precisa estar dentro do jogo, no lugar certo, no momento de confirmar. Entre e tente de novo.",
    };
  }

  const gratis = !(await jaTeveRestauracaoFeita(opts.discordId));
  const custo = gratis ? 0 : PRECO_RESTAURACAO;

  let requestId: number;
  try {
    const rows = (await sql`
      insert into base_restore_requests
        (discord_id, server_slug, palworld_uid, snapshot_id,
         dest_x, dest_y, dest_z, status, paletas)
      values (${opts.discordId}, ${opts.serverSlug}, ${opts.uid}, ${opts.snapshotId},
              ${eu.worldX}, ${eu.worldY}, ${eu.worldZ}, 'fila', ${custo})
      returning id
    `) as { id: number }[];
    requestId = rows[0].id;
  } catch {
    // Corrida: dois cliques quase juntos. O índice único decide, o segundo
    // recebe uma mensagem que faz sentido em vez do erro cru do banco.
    return {
      ok: false,
      mensagem: "Você já tem um pedido em andamento. Espere ele terminar.",
    };
  }

  if (custo > 0) {
    const r = await lancar({
      discordId: opts.discordId,
      delta: -custo,
      origem: "restauracao",
      descricao: `Restauração de base — ${server.shortName}`,
      refId: String(requestId),
      chave: `restauracao:${requestId}`,
    });
    if (r.status === "sem-saldo") {
      await sql`delete from base_restore_requests where id = ${requestId}`;
      return {
        ok: false,
        mensagem: `Isso custa ${custo} Paletas e você tem ${r.saldo}.`,
      };
    }
  }

  return {
    ok: true,
    mensagem: gratis
      ? "Pedido na fila — sua primeira restauração é grátis. Entra na próxima janela de manutenção (~06:00 UTC)."
      : `Pedido na fila por ${custo} Paletas. Entra na próxima janela de manutenção (~06:00 UTC).`,
  };
}

/* --------------------------------------------------------- visão do admin */

export interface PedidoAdmin {
  id: number;
  discordId: string;
  serverSlug: string;
  serverName: string;
  status: string;
  detail: string;
  paletas: number;
  estornado: boolean;
  guildName: string | null;
  pieceCount: number | null;
  createdAt: string;
  doneAt: string | null;
}

/**
 * Os pedidos que importam olhar: os em andamento primeiro (`rodando`,
 * `fila`), depois o histórico recente. Junta com `base_snapshots` só para
 * mostrar de qual base/guild se trata — o pedido em si não guarda isso.
 */
export async function filaAdmin(limite = 50): Promise<PedidoAdmin[]> {
  const rows = (await sql`
    select r.id, r.discord_id, r.server_slug, r.status, r.detail, r.paletas,
           r.estornado, r.created_at, r.done_at,
           s.guild_name, s.piece_count
    from base_restore_requests r
    left join base_snapshots s on s.id = r.snapshot_id
    order by
      case r.status when 'rodando' then 0 when 'fila' then 1 else 2 end,
      r.created_at desc
    limit ${limite}
  `) as {
    id: number;
    discord_id: string;
    server_slug: string;
    status: string;
    detail: string;
    paletas: number;
    estornado: boolean;
    created_at: string;
    done_at: string | null;
    guild_name: string | null;
    piece_count: number | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    discordId: r.discord_id,
    serverSlug: r.server_slug,
    serverName: nomeDoServidor(r.server_slug),
    status: r.status,
    detail: r.detail,
    paletas: r.paletas,
    estornado: r.estornado,
    guildName: r.guild_name,
    pieceCount: r.piece_count,
    createdAt: r.created_at,
    doneAt: r.done_at,
  }));
}

/**
 * Cancela um pedido pelo `id`, de qualquer pessoa — para quando um pedido
 * fica travado e o dono quer destravar sem esperar. Só funciona em `fila`,
 * pelo mesmo motivo do cancelamento do próprio jogador: uma vez `rodando`,
 * o servidor já está parado por causa dele.
 */
export async function cancelarPedidoAdmin(id: number): Promise<Resultado> {
  const rows = (await sql`
    select id, discord_id, status, paletas from base_restore_requests where id = ${id}
  `) as { id: number; discord_id: string; status: string; paletas: number }[];

  const p = rows[0];
  if (!p) return { ok: false, mensagem: "Pedido não encontrado." };
  if (p.status !== "fila") {
    return {
      ok: false,
      mensagem: `Só dá para cancelar pedido ainda em fila — este está "${p.status}".`,
    };
  }

  await sql`delete from base_restore_requests where id = ${p.id}`;

  if (p.paletas > 0) {
    await lancar({
      discordId: p.discord_id,
      delta: p.paletas,
      origem: "ajuste",
      descricao: `Estorno: pedido de restauração #${p.id} cancelado pelo admin`,
      refId: String(p.id),
      chave: `restauracao:estorno:${p.id}`,
    });
  }

  return {
    ok: true,
    mensagem:
      `Pedido #${p.id} cancelado.` +
      (p.paletas > 0 ? ` ${p.paletas} Paletas devolvidas.` : ""),
  };
}

/**
 * Devolve as Paletas de um pedido pago que virou `recusado` — o gap
 * conhecido da fase 2: `processar_fila.py` recusa sem mexer na carteira,
 * porque quem escreve o `Level.sav` não é quem sabe de saldo. A coluna
 * `estornado` trava contra clicar duas vezes.
 */
export async function estornarPedidoRecusado(
  id: number,
  actorId: string,
): Promise<Resultado> {
  const rows = (await sql`
    select id, discord_id, status, paletas, estornado
    from base_restore_requests where id = ${id}
  `) as {
    id: number;
    discord_id: string;
    status: string;
    paletas: number;
    estornado: boolean;
  }[];

  const p = rows[0];
  if (!p) return { ok: false, mensagem: "Pedido não encontrado." };
  if (p.status !== "recusado") {
    return { ok: false, mensagem: "Só dá para estornar pedido recusado." };
  }
  if (p.estornado) {
    return { ok: false, mensagem: "Este pedido já foi estornado." };
  }
  if (p.paletas <= 0) {
    return { ok: false, mensagem: "Este pedido não cobrou Paletas." };
  }

  const r = await lancar({
    discordId: p.discord_id,
    delta: p.paletas,
    origem: "ajuste",
    descricao: `Estorno: pedido de restauração #${p.id} recusado`,
    refId: String(p.id),
    chave: `restauracao:estorno:${p.id}`,
    actorId,
  });

  await sql`update base_restore_requests set estornado = true where id = ${p.id}`;

  return {
    ok: r.status !== "sem-saldo",
    mensagem: `${p.paletas} Paletas devolvidas a ${p.discord_id}.`,
  };
}

/**
 * Cancela um pedido AINDA em `fila` (não dá para cancelar o que já está
 * `rodando` — a essa altura o servidor já está parado por causa dele).
 * Devolve as Paletas, se tiver cobrado.
 */
export async function cancelarPedidoDeRestauracao(discordId: string): Promise<Resultado> {
  const rows = (await sql`
    select id, paletas from base_restore_requests
    where discord_id = ${discordId} and status = 'fila'
  `) as { id: number; paletas: number }[];

  const p = rows[0];
  if (!p) {
    return {
      ok: false,
      mensagem: "Nenhum pedido em fila para cancelar — se já está rodando, é tarde.",
    };
  }

  await sql`delete from base_restore_requests where id = ${p.id}`;

  if (p.paletas > 0) {
    await lancar({
      discordId,
      delta: p.paletas,
      origem: "ajuste",
      descricao: "Estorno: pedido de restauração cancelado",
      refId: String(p.id),
      chave: `restauracao:estorno:${p.id}`,
    });
  }

  return {
    ok: true,
    mensagem:
      "Pedido cancelado." +
      (p.paletas > 0 ? ` ${p.paletas} Paletas devolvidas.` : ""),
  };
}
