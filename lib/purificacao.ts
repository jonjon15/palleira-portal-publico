import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { meuVinculo } from "@/lib/linking";
import { serverBySlug } from "@/lib/servers";
import { getPal, ForaDoJogo, type PalCru } from "@/lib/palworld/paldefender";
import { paraTemplate } from "@/lib/pal-template";
import { isStaff, levelOf } from "@/lib/roles";
import {
  IV_MINIMO_DOADOR,
  DOADORES_POR_RODADA,
  IV_TETO_RITUAL,
  ivAtaque,
  ivVida,
  ivDefesa,
  elegibilidadeDoador,
} from "@/lib/purificacao-regras";

/**
 * A Câmara de Purificação: o jogador escolhe 1 Pal da palbox para
 * "purificar", o staff define quais passivas os doadores precisam ter, e a
 * cada 4 doações confirmadas o Pal ganha +1 de IV em Vida/Ataque/Defesa até
 * o teto de 150. Ver `db/migrations/020-camara-de-purificacao.sql` para o
 * porquê de cada decisão de schema — em especial por que o Pal alvo é uma
 * fotografia (`template`) e não algo que se busca de novo no jogo, por que
 * "Ataque" é um eixo só, e por que o doador não sai da palbox.
 *
 * As constantes e a validação de elegibilidade moram em
 * `lib/purificacao-regras.ts` — módulo puro, sem `@/lib/db` nem `@/auth`,
 * para poder ser importado também de componente client (o formulário de
 * doação realça visualmente quem já atende a regra).
 *
 * ⚠️ Por agora é só registro no site — nada aqui edita `Level.sav`, chama
 * RCON de escrita nem dispara GitHub Actions. Isso fica para uma etapa
 * futura separada.
 */

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

export {
  IV_MINIMO_DOADOR,
  CONDENSADO_MINIMO_DOADOR,
  DOADORES_POR_RODADA,
  IV_TETO_RITUAL,
  IV_INICIAL_RITUAL,
  elegibilidadeDoador,
  type PalParaValidar,
} from "@/lib/purificacao-regras";

/* ------------------------------------------------------------------ leitura */

export interface DoadorConfirmado {
  id: number;
  rodada: number;
  discordId: string;
  palId: string;
  nickname: string;
  ivHealth: number;
  ivAttack: number;
  ivDefense: number;
  condensedPals: number;
  passivaUsada: string;
  doadoEm: string;
}

export interface RitualDePurificacao {
  id: number;
  discordId: string;
  serverSlug: string;
  palId: string;
  template: Record<string, unknown>;
  status: "aguardando_regra" | "ativo" | "completo" | "cancelado";
  passivasAceitas: string[];
  rodadasCompletas: number;
  ivHealth: number;
  ivAttack: number;
  ivDefense: number;
  criadoEm: string;
  doadoresDaRodada: DoadorConfirmado[];
}

interface LinhaRitual {
  id: number;
  discord_id: string;
  server_slug: string;
  pal_id: string;
  template: Record<string, unknown>;
  status: RitualDePurificacao["status"];
  passivas_aceitas: string[];
  rodadas_completas: number;
  iv_health: number;
  iv_attack: number;
  iv_defense: number;
  created_at: string;
}

interface LinhaDoador {
  id: number;
  rodada: number;
  discord_id: string;
  pal_id: string;
  nickname: string;
  iv_health: number;
  iv_attack: number;
  iv_defense: number;
  condensed_pals: number;
  passiva_usada: string;
  donated_at: string;
}

const paraDoador = (r: LinhaDoador): DoadorConfirmado => ({
  id: r.id,
  rodada: r.rodada,
  discordId: r.discord_id,
  palId: r.pal_id,
  nickname: r.nickname,
  ivHealth: r.iv_health,
  ivAttack: r.iv_attack,
  ivDefense: r.iv_defense,
  condensedPals: r.condensed_pals,
  passivaUsada: r.passiva_usada,
  doadoEm: r.donated_at,
});

async function montarRitual(r: LinhaRitual): Promise<RitualDePurificacao> {
  const doadores = (await sql`
    select id, rodada, discord_id, pal_id, nickname, iv_health, iv_attack,
           iv_defense, condensed_pals, passiva_usada, donated_at
    from purification_donors
    where ritual_id = ${r.id} and rodada = ${r.rodadas_completas}
    order by donated_at asc
  `) as LinhaDoador[];

  return {
    id: r.id,
    discordId: r.discord_id,
    serverSlug: r.server_slug,
    palId: r.pal_id,
    template: r.template,
    status: r.status,
    passivasAceitas: r.passivas_aceitas,
    rodadasCompletas: r.rodadas_completas,
    ivHealth: r.iv_health,
    ivAttack: r.iv_attack,
    ivDefense: r.iv_defense,
    criadoEm: r.created_at,
    doadoresDaRodada: doadores.map(paraDoador),
  };
}

/** O ritual em andamento (ou concluído mais recente) de um jogador. */
export async function meuRitualAtivo(discordId: string): Promise<RitualDePurificacao | null> {
  const rows = (await sql`
    select id, discord_id, server_slug, pal_id, template, status,
           passivas_aceitas, rodadas_completas, iv_health, iv_attack, iv_defense, created_at
    from purification_rituals
    where discord_id = ${discordId}
    order by created_at desc
    limit 1
  `) as LinhaRitual[];
  const r = rows[0];
  return r ? montarRitual(r) : null;
}

/* -------------------------------------------------------------- iniciar */

/**
 * Abre um ritual novo com o Pal escolhido na palbox. Falha se já houver um
 * ritual em `aguardando_regra`/`ativo` — a migração 020 tem o índice único
 * que faz valer isso mesmo sob corrida.
 */
export async function iniciarRitual(
  serverSlug: string,
  instanceId: string,
): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  const vinculo = await meuVinculo(discordId);
  if (!vinculo) {
    return { ok: false, mensagem: "Vincule seu personagem antes de usar a Câmara." };
  }
  const server = serverBySlug(serverSlug);
  if (!server) {
    return { ok: false, mensagem: "Servidor inválido." };
  }

  const emAndamento = await meuRitualAtivo(discordId);
  if (emAndamento && (emAndamento.status === "aguardando_regra" || emAndamento.status === "ativo")) {
    return { ok: false, mensagem: "Você já tem um Pal em purificação agora." };
  }

  let pal: PalCru | null;
  try {
    pal = await getPal(server, vinculo.uid, instanceId);
  } catch (e) {
    return {
      ok: false,
      mensagem:
        e instanceof ForaDoJogo
          ? "Você precisa estar no jogo nesse servidor para escolher o Pal."
          : "Não consegui ler seus Pals agora. Tente de novo em instantes.",
    };
  }
  if (!pal) {
    return { ok: false, mensagem: "Esse Pal não está mais com você. Recarregue a página." };
  }

  const template = paraTemplate(pal);

  try {
    await sql`
      insert into purification_rituals
        (discord_id, server_slug, pal_id, template, instance_id_inicial)
      values (${discordId}, ${serverSlug}, ${template.PalID}, ${JSON.stringify(template)}, ${instanceId})
    `;
  } catch {
    return { ok: false, mensagem: "Você já tem um Pal em purificação agora." };
  }

  return {
    ok: true,
    mensagem: `${template.PalID} entrou na câmara. Aguarde o staff definir as passivas aceitas.`,
  };
}

/* ------------------------------------------------------------------ doar */

/** Doa 1 Pal da palbox como doador da rodada atual do ritual. */
export async function doarPal(instanceId: string): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  const ritual = await meuRitualAtivo(discordId);
  if (!ritual || ritual.status !== "ativo") {
    return { ok: false, mensagem: "Você não tem um ritual ativo agora." };
  }

  const vinculo = await meuVinculo(discordId);
  const server = serverBySlug(ritual.serverSlug);
  if (!vinculo || !server) {
    return { ok: false, mensagem: "Vincule seu personagem antes de doar." };
  }

  let pal: PalCru | null;
  try {
    pal = await getPal(server, vinculo.uid, instanceId);
  } catch (e) {
    return {
      ok: false,
      mensagem:
        e instanceof ForaDoJogo
          ? "Você precisa estar no jogo nesse servidor para doar."
          : "Não consegui ler seus Pals agora. Tente de novo em instantes.",
    };
  }
  if (!pal) {
    return { ok: false, mensagem: "Esse Pal não está mais com você. Recarregue a página." };
  }

  const template = paraTemplate(pal);
  const elegivel = elegibilidadeDoador(
    { ivs: template.IVs, condensedPals: template.CondensedPals, passives: template.Passives },
    ritual.passivasAceitas,
  );
  if (!elegivel.ok) {
    return { ok: false, mensagem: elegivel.motivo };
  }

  try {
    await sql`
      insert into purification_donors
        (ritual_id, rodada, discord_id, instance_id, pal_id, nickname,
         iv_health, iv_attack, iv_defense, condensed_pals, passiva_usada)
      values (
        ${ritual.id}, ${ritual.rodadasCompletas}, ${discordId}, ${instanceId},
        ${template.PalID}, ${template.Nickname},
        ${ivVida(template.IVs)}, ${ivAtaque(template.IVs)}, ${ivDefesa(template.IVs)},
        ${template.CondensedPals}, ${elegivel.passivaUsada}
      )
    `;
  } catch {
    return { ok: false, mensagem: "Esse Pal já foi doado neste ritual." };
  }

  const doadoresNaRodada = ritual.doadoresDaRodada.length + 1;
  if (doadoresNaRodada < DOADORES_POR_RODADA) {
    return {
      ok: true,
      mensagem: `Doação registrada — ${doadoresNaRodada} de ${DOADORES_POR_RODADA} nesta rodada.`,
    };
  }

  // Fecha a rodada: soma +1 nos três eixos, respeitando o teto.
  const novoHealth = Math.min(IV_TETO_RITUAL, ritual.ivHealth + 1);
  const novoAttack = Math.min(IV_TETO_RITUAL, ritual.ivAttack + 1);
  const novoDefense = Math.min(IV_TETO_RITUAL, ritual.ivDefense + 1);
  const completou = novoHealth >= IV_TETO_RITUAL && novoAttack >= IV_TETO_RITUAL && novoDefense >= IV_TETO_RITUAL;

  if (completou) {
    await sql`
      update purification_rituals
      set rodadas_completas = rodadas_completas + 1,
          iv_health = ${novoHealth},
          iv_attack = ${novoAttack},
          iv_defense = ${novoDefense},
          status = 'completo',
          completed_at = now()
      where id = ${ritual.id}
    `;
  } else {
    await sql`
      update purification_rituals
      set rodadas_completas = rodadas_completas + 1,
          iv_health = ${novoHealth},
          iv_attack = ${novoAttack},
          iv_defense = ${novoDefense}
      where id = ${ritual.id}
    `;
  }

  return {
    ok: true,
    mensagem: completou
      ? "Rodada completa! O Pal chegou ao teto de IV 150."
      : "Rodada completa! O Pal ganhou +1 de IV em Vida, Ataque e Defesa.",
  };
}

/* ------------------------------------------------------------------ staff */

async function exigirStaff(): Promise<{ ok: true; discordId: string } | Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!isStaff(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só staff pode mexer na regra da Câmara." };
  }
  return { ok: true, discordId: session.user.discordId };
}

interface RitualPendente {
  id: number;
  discordId: string;
  serverSlug: string;
  palId: string;
  template: Record<string, unknown>;
  criadoEm: string;
}

/** Rituais aguardando o staff definir as passivas aceitas. */
export async function rituaisAguardandoRegra(): Promise<RitualPendente[]> {
  const rows = (await sql`
    select id, discord_id, server_slug, pal_id, template, created_at
    from purification_rituals
    where status = 'aguardando_regra'
    order by created_at asc
  `) as {
    id: number;
    discord_id: string;
    server_slug: string;
    pal_id: string;
    template: Record<string, unknown>;
    created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    discordId: r.discord_id,
    serverSlug: r.server_slug,
    palId: r.pal_id,
    template: r.template,
    criadoEm: r.created_at,
  }));
}

/** Define a lista de passivas aceitas e ativa o ritual. */
export async function definirRegraDoRitual(
  ritualId: number,
  passivas: string[],
): Promise<Resultado> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return staff;
  if (passivas.length === 0) {
    return { ok: false, mensagem: "Escolha pelo menos uma passiva aceita." };
  }

  const atualizado = (await sql`
    update purification_rituals
    set passivas_aceitas = ${passivas},
        regra_definida_por = ${staff.discordId},
        regra_definida_em = now(),
        status = 'ativo'
    where id = ${ritualId} and status = 'aguardando_regra'
    returning id
  `) as { id: number }[];

  if (!atualizado.length) {
    return { ok: false, mensagem: "Esse ritual não está mais aguardando regra." };
  }
  return { ok: true, mensagem: "Regra definida — o jogador já pode começar a doar." };
}

/** Cancela um ritual (staff) — usado para corrigir engano ou abuso. */
export async function cancelarRitual(ritualId: number): Promise<Resultado> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return staff;

  const atualizado = (await sql`
    update purification_rituals
    set status = 'cancelado'
    where id = ${ritualId} and status in ('aguardando_regra', 'ativo')
    returning id
  `) as { id: number }[];

  if (!atualizado.length) {
    return { ok: false, mensagem: "Esse ritual não pode mais ser cancelado." };
  }
  return { ok: true, mensagem: "Ritual cancelado." };
}
