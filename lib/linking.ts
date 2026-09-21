import { randomInt } from "node:crypto";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { serverBySlug, activeServers } from "@/lib/servers";
import { getPlayers } from "@/lib/palworld/paldefender";
import { sendToPlayer } from "@/lib/palworld/rcon";
import { normalizarUid } from "@/lib/palworld/uid";

/**
 * Vínculo entre a conta do Discord e o personagem do jogo (§4.2 do PROMPT.md).
 *
 * A prova é entregue **dentro do jogo**: o site manda um código de 6 dígitos
 * por RCON direto para aquele personagem. Para roubar o personagem de alguém
 * seria preciso estar com o Discord dela E com o jogo dela aberto ao mesmo
 * tempo — que é o nível de prova que a carteira de Paletas exige.
 *
 * 📌 **O vínculo vale na comunidade inteira, não num servidor.** O
 * `palworld_uid` é da conta e não muda de mundo para mundo — medido em
 * 22/08/2026: o mesmo UID responde nos três servidores. O `serverSlug`
 * guardado é só o registro de **onde a prova aconteceu**.
 *
 * Só server-side: RCON abre socket TCP com a senha de admin.
 */

const VALIDADE_MIN = 10;
const MAX_TENTATIVAS = 5;

export interface Personagem {
  serverSlug: string;
  serverName: string;
  uid: string;
  name: string;
  guildName: string;
}

export interface Vinculo {
  /** Canônico, sem hífen — o mesmo formato de `players` (uid.ts) */
  uid: string;
  playerName: string;
  linkedAt: string;
  /** Onde o código foi entregue. Registro de origem, não limite de alcance. */
  serverSlug: string;
  serverName: string;
}

/**
 * Como a pessoa aparece em cada servidor.
 *
 * Vem da tabela `players`, alimentada pelo save (§3.8) — então mostra
 * **também quem está offline**, que é justamente o que a API não sabe.
 * Só encontra alguém porque os dois lados agora falam o mesmo formato de
 * UID; foi o descasamento entre eles que deixava este perfil vazio.
 */
export interface PersonagemNoServidor {
  serverSlug: string;
  serverName: string;
  name: string;
  level: number;
  palCount: number;
}

export interface Pendente {
  serverSlug: string;
  serverName: string;
  playerName: string;
  tentativasRestantes: number;
}

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/* --------------------------------------------------------------- consultas */

const nomeDoServidor = (slug: string) => serverBySlug(slug)?.shortName ?? slug;

/** A conta de jogo do usuário, se ele já provou alguma. Vale nos três servidores. */
export async function meuVinculo(discordId: string): Promise<Vinculo | null> {
  const rows = (await sql`
    select server_slug, palworld_uid, player_name, linked_at
    from account_links
    where discord_id = ${discordId}
  `) as {
    server_slug: string;
    palworld_uid: string;
    player_name: string;
    linked_at: string;
  }[];

  const r = rows[0];
  if (!r) return null;
  return {
    uid: r.palworld_uid,
    playerName: r.player_name,
    linkedAt: r.linked_at,
    serverSlug: r.server_slug,
    serverName: nomeDoServidor(r.server_slug),
  };
}

/** Só a pergunta "essa pessoa já provou um personagem?" — sem trazer o resto. */
export async function temVinculo(discordId: string): Promise<boolean> {
  const rows = (await sql`
    select 1 from account_links where discord_id = ${discordId}
  `) as unknown[];
  return rows.length > 0;
}

/**
 * Uma linha por conta do Discord vinculada — para o seletor de jogador do
 * ajuste manual de Paletas (`/admin/economia`), no lugar de digitar o ID na
 * mão. `distinct on` porque a mesma conta pode ter linhas em mais de um
 * servidor (§017 acima); mostra o vínculo mais recente de cada um.
 */
export async function todosOsVinculos(): Promise<
  { discordId: string; playerName: string }[]
> {
  const rows = (await sql`
    select distinct on (discord_id) discord_id, player_name
    from account_links
    order by discord_id, linked_at desc
  `) as { discord_id: string; player_name: string }[];
  return rows.map((r) => ({ discordId: r.discord_id, playerName: r.player_name }));
}

/**
 * Os personagens da pessoa, um por servidor onde ela jogou.
 *
 * Um vínculo só, vários personagens: é o UID que os liga. Quem joga no Free
 * e no VIP aparece nos dois, com o nome e o level de cada mundo.
 */
export async function meusPersonagens(
  discordId: string,
): Promise<PersonagemNoServidor[]> {
  const rows = (await sql`
    select p.server_slug, p.name, p.level, p.pal_count
    from account_links a
    join players p on p.palworld_uid = a.palworld_uid
    where a.discord_id = ${discordId}
    order by p.level desc, p.pal_count desc
  `) as {
    server_slug: string;
    name: string;
    level: number;
    pal_count: number;
  }[];

  return rows.map((r) => ({
    serverSlug: r.server_slug,
    serverName: nomeDoServidor(r.server_slug),
    name: r.name,
    level: r.level,
    palCount: r.pal_count,
  }));
}

/**
 * Se a conta já tem personagem visto naquele servidor específico.
 *
 * Existe para a trava de mercado do Dominantes (§ 11/09/2026,
 * `PalleiraServer.mercadoRestrito`): o vínculo em si vale a comunidade
 * inteira (comentário no topo do arquivo), então não dá para usar
 * `meuVinculo` para saber se a pessoa "está" num servidor — só `players`
 * sabe onde ela de fato apareceu, porque é populado pelo import do save
 * daquele mundo.
 */
export async function jogouNoServidor(
  discordId: string,
  serverSlug: string,
): Promise<boolean> {
  const rows = (await sql`
    select 1
    from account_links a
    join players p on p.palworld_uid = a.palworld_uid
    where a.discord_id = ${discordId} and p.server_slug = ${serverSlug}
    limit 1
  `) as unknown[];
  return rows.length > 0;
}

/** Código já enviado, esperando confirmação. Expirado conta como inexistente. */
export async function meuPedido(discordId: string): Promise<Pendente | null> {
  const rows = (await sql`
    select server_slug, player_name, attempts
    from link_codes
    where discord_id = ${discordId} and expires_at > now()
  `) as { server_slug: string; player_name: string; attempts: number }[];

  const p = rows[0];
  if (!p) return null;
  return {
    serverSlug: p.server_slug,
    serverName: nomeDoServidor(p.server_slug),
    playerName: p.player_name,
    tentativasRestantes: Math.max(0, MAX_TENTATIVAS - p.attempts),
  };
}

/**
 * Personagens conectados agora, nos servidores com RCON ligado.
 *
 * Só quem está online aparece: o código chega pelo chat do jogo, então não
 * adianta oferecer um personagem que ninguém está segurando. Quem já
 * pertence a algum Discord também some da lista — a checagem é pelo UID
 * puro, não pelo par com o servidor, porque a mesma conta responde nos três.
 */
export async function personagensOnline(): Promise<Personagem[]> {
  const lista: Personagem[] = [];

  await Promise.all(
    activeServers().map(async (server) => {
      // Sem RCON não há como entregar o código — nem adianta listar.
      if (!server.rconPort) return;
      try {
        for (const p of await getPlayers(server)) {
          if (!p.online || !p.name || !p.playerUid) continue;
          lista.push({
            serverSlug: server.slug,
            serverName: server.shortName,
            uid: p.playerUid,
            name: p.name,
            guildName: p.guildName,
          });
        }
      } catch {
        // Um servidor mudo não pode derrubar a lista dos outros.
      }
    }),
  );

  const tomados = new Set(
    (
      (await sql`select palworld_uid from account_links`) as {
        palworld_uid: string;
      }[]
    ).map((r) => r.palworld_uid),
  );

  return lista
    .filter((c) => !tomados.has(c.uid))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Servidores que ainda não aceitam vínculo, para explicar quem ficou de fora. */
export const servidoresSemRcon = () =>
  activeServers().filter((s) => !s.rconPort);

/* ------------------------------------------------------------------- ações */

export async function pedirCodigo(
  serverSlug: string,
  uidCru: string,
): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) {
    return {
      ok: false,
      mensagem: "Só quem está no Discord da Palleira pode vincular.",
    };
  }

  const discordId = session.user.discordId;

  // Vem do formulário: normaliza antes de comparar com qualquer coisa.
  const uid = normalizarUid(uidCru);

  if (await temVinculo(discordId)) {
    return {
      ok: false,
      mensagem:
        "Sua conta já tem personagem, e ele vale nos três servidores. Desvincule antes de trocar.",
    };
  }

  const server = serverBySlug(serverSlug);
  if (!server?.rconPort) {
    return { ok: false, mensagem: "Esse servidor não aceita vínculo agora." };
  }

  // O nome vem da fonte, não do navegador: o formulário só escolhe o alvo.
  const alvo = (await getPlayers(server)).find(
    (p) => p.playerUid === uid && p.online,
  );
  if (!alvo) {
    return {
      ok: false,
      mensagem:
        "Esse personagem não está mais online. Entre no jogo e recarregue a página.",
    };
  }

  // Sem `server_slug` na condição de propósito: o UID é o mesmo nos três
  // servidores, então checar só o par deixaria outro Discord reivindicar a
  // mesma pessoa em outro mundo.
  const tomado = (await sql`
    select 1 from account_links where palworld_uid = ${uid}
  `) as unknown[];
  if (tomado.length) {
    return { ok: false, mensagem: "Esse personagem já é de outra conta." };
  }

  const codigo = String(randomInt(100_000, 1_000_000));

  // Um pedido por pessoa: pedir de novo apaga o anterior. O `on conflict`
  // cobre o caso raro de dois jogadores sorteando o mesmo número.
  await sql`delete from link_codes where discord_id = ${discordId}`;
  await sql`
    insert into link_codes
      (code, discord_id, server_slug, palworld_uid, player_name, expires_at)
    values (${codigo}, ${discordId}, ${serverSlug}, ${uid}, ${alvo.name},
            now() + make_interval(mins => ${VALIDADE_MIN}))
    on conflict (code) do update
      set discord_id   = excluded.discord_id,
          server_slug  = excluded.server_slug,
          palworld_uid = excluded.palworld_uid,
          player_name  = excluded.player_name,
          attempts     = 0,
          expires_at   = excluded.expires_at,
          created_at   = now()
  `;

  const entregue = await sendToPlayer(
    server,
    uid,
    `PALLEIRA: seu codigo eh ${codigo} - digite no site em ${VALIDADE_MIN} min`,
  ).catch(() => false);

  if (!entregue) {
    await sql`delete from link_codes where discord_id = ${discordId}`;
    return {
      ok: false,
      mensagem:
        "Não consegui falar com o servidor do jogo agora. Tenta de novo em instantes.",
    };
  }

  return {
    ok: true,
    mensagem: `Código enviado para ${alvo.name} no chat do jogo.`,
  };
}

export async function confirmarCodigo(digitado: string): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  const limpo = digitado.replace(/\D/g, "");
  if (limpo.length !== 6) {
    return { ok: false, mensagem: "O código tem 6 dígitos." };
  }

  const rows = (await sql`
    select code, server_slug, palworld_uid, player_name, attempts,
           expires_at < now() as expirado
    from link_codes
    where discord_id = ${discordId}
  `) as {
    code: string;
    server_slug: string;
    palworld_uid: string;
    player_name: string;
    attempts: number;
    expirado: boolean;
  }[];

  const pedido = rows[0];
  if (!pedido) {
    return { ok: false, mensagem: "Nenhum código pendente. Peça um novo." };
  }
  if (pedido.expirado) {
    await sql`delete from link_codes where discord_id = ${discordId}`;
    return { ok: false, mensagem: "O código expirou. Peça outro." };
  }
  if (pedido.attempts >= MAX_TENTATIVAS) {
    await sql`delete from link_codes where discord_id = ${discordId}`;
    return { ok: false, mensagem: "Tentativas demais. Peça um código novo." };
  }

  if (pedido.code !== limpo) {
    await sql`
      update link_codes set attempts = attempts + 1
      where discord_id = ${discordId}
    `;
    const restam = MAX_TENTATIVAS - pedido.attempts - 1;
    return {
      ok: false,
      mensagem:
        restam > 0
          ? `Código errado. Restam ${restam} tentativa${restam > 1 ? "s" : ""}.`
          : "Código errado. Peça um novo.",
    };
  }

  // Corrida: dois Discords mirando o mesmo personagem. O índice único da
  // tabela decide, e o perdedor recebe uma mensagem honesta. Vale para
  // qualquer servidor: `palworld_uid` é único na tabela inteira.
  try {
    await sql`
      insert into account_links
        (discord_id, server_slug, palworld_uid, player_name)
      values (${discordId}, ${pedido.server_slug}, ${pedido.palworld_uid},
              ${pedido.player_name})
    `;
  } catch {
    await sql`delete from link_codes where discord_id = ${discordId}`;
    return {
      ok: false,
      mensagem: "Esse personagem acabou de ser vinculado a outra conta.",
    };
  }

  await sql`delete from link_codes where discord_id = ${discordId}`;
  return {
    ok: true,
    mensagem: `Pronto! ${pedido.player_name} é você — nos três servidores.`,
  };
}

export async function cancelarPedido(): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  await sql`delete from link_codes where discord_id = ${session.user.discordId}`;
  return { ok: true, mensagem: "Pedido cancelado." };
}

/** Desfaz o vínculo inteiro: ele é um só, e vale em todos os servidores. */
export async function desvincular(): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  await sql`delete from account_links where discord_id = ${discordId}`;
  await sql`delete from link_codes   where discord_id = ${discordId}`;
  return { ok: true, mensagem: "Personagem desvinculado." };
}
