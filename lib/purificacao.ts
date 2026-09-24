import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { meuVinculo } from "@/lib/linking";
import { serverBySlug } from "@/lib/servers";
import { getPal, ForaDoJogo, semEspacoParaPal, type PalCru } from "@/lib/palworld/paldefender";
import { delPal } from "@/lib/palworld/rcon";
import { paraTemplate, candidatosDeFiltro, nomeDoArquivo, type PalTemplate } from "@/lib/pal-template";
import { dispararWorkflow } from "@/lib/github";
import { isStaff, levelOf } from "@/lib/roles";
import { COOLDOWN_RESGATE_HORAS } from "@/lib/pal-cofre";
import {
  IV_MINIMO_DOADOR,
  DOADORES_POR_RODADA,
  IV_TETO_RITUAL,
  IV_INICIAL_RITUAL,
  IV_MINIMO_RESGATE_PADRAO,
  MINUTOS_REFERENCIA_MINIMO,
  MINUTOS_REFERENCIA_MAXIMO,
  DIAS_REFERENCIA_MAXIMO,
  ivAtaque,
  ivVida,
  ivDefesa,
  elegibilidadeDoador,
  elegibilidadeAlvo,
} from "@/lib/purificacao-regras";
import { todasAsPassivas } from "@/lib/passivas";

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
  PARTNER_SKILL_MINIMO_DOADOR,
  DOADORES_POR_RODADA,
  IV_TETO_RITUAL,
  IV_INICIAL_RITUAL,
  MINUTOS_REFERENCIA_MINIMO,
  MINUTOS_REFERENCIA_MAXIMO,
  elegibilidadeDoador,
  elegibilidadeAlvo,
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
  status: "aguardando_regra" | "ativo" | "completo" | "resgatado" | "cancelado";
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

/**
 * O histórico completo de doadores de um ritual — todas as rodadas, não só
 * a aberta (`montarRitual`/`doadoresDaRodada` mostra só a atual, para o
 * formulário de doação). Usado pelo "Ver ritual completo" e pelo contador
 * total de Pals já consumidos.
 */
export async function historicoDoRitual(ritualId: number): Promise<DoadorConfirmado[]> {
  const rows = (await sql`
    select id, rodada, discord_id, pal_id, nickname, iv_health, iv_attack,
           iv_defense, condensed_pals, passiva_usada, donated_at
    from purification_donors
    where ritual_id = ${ritualId}
    order by donated_at desc
  `) as LinhaDoador[];
  return rows.map(paraDoador);
}

/**
 * As passivas sugeridas para a rodada atual — mostrada na tela de "escolher
 * Pal" (antes de existir ritual, e portanto antes de existir regra de
 * verdade) como orientação do que a staff costuma pedir. Não é uma regra
 * fixa: o staff ainda define do zero a cada ritual novo, em
 * `definirRegraDoRitual`.
 *
 * Vive em `purification_referencia` — tabela própria, singleton (migração
 * 025), independente de qualquer ritual existir. Primeira versão
 * reaproveitava `passivas_aceitas` de um ritual antigo cancelado/completo;
 * errada, porque sem nenhum ritual encerrado ainda não havia linha nenhuma
 * pra editar.
 *
 * Tem prazo de validade (`expira_em`) — passado ele, a sugestão simplesmente
 * some da tela, como se nunca tivesse sido definida. Pedido do dono em
 * 21/09/2026: sem isso, uma sugestão de meses atrás continuava aparecendo
 * como se ainda valesse.
 */
export interface ReferenciaDeRegra {
  passivasAceitas: string[];
  expiraEm: string;
}

/** Quantas passivas o sorteio automático escolhe quando a sugestão expira sem a staff renovar. */
const PASSIVAS_POR_SORTEIO = 4;
/** Validade (em dias) da sugestão sorteada automaticamente — mesmo teto do editor manual. */
const DIAS_VALIDADE_SORTEIO = DIAS_REFERENCIA_MAXIMO;

/** `N` chaves distintas sorteadas do catálogo de passivas (Fisher-Yates parcial). */
function sortearPassivas(n: number): string[] {
  const chaves = todasAsPassivas().map((p) => p.chave);
  for (let i = chaves.length - 1; i > 0 && i >= chaves.length - n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chaves[i], chaves[j]] = [chaves[j], chaves[i]];
  }
  return chaves.slice(-n);
}

/**
 * Sorteia uma sugestão nova e grava — só quando a linha ainda está expirada
 * na hora de escrever (`and expira_em ... `), para duas requisições
 * simultâneas não sortearem duas sugestões diferentes uma sobre a outra.
 * Quem perde a corrida simplesmente lê o que a outra gravou.
 */
async function sortearEGravarReferencia(): Promise<ReferenciaDeRegra> {
  const passivas = sortearPassivas(PASSIVAS_POR_SORTEIO);
  const rows = (await sql`
    update purification_referencia
    set passivas_aceitas = ${passivas},
        definida_por = null,
        definida_em = now(),
        expira_em = now() + (${DIAS_VALIDADE_SORTEIO} || ' days')::interval
    where id = 1 and (expira_em is null or expira_em <= now())
    returning passivas_aceitas, expira_em
  `) as { passivas_aceitas: string[]; expira_em: string }[];

  if (rows[0]) return { passivasAceitas: rows[0].passivas_aceitas, expiraEm: rows[0].expira_em };

  // Perdeu a corrida: outra requisição já sorteou e gravou antes. Lê o que
  // ficou — nunca `null` aqui, porque a linha singleton sempre existe
  // (migração 025 insere id=1 na criação) e acabou de ser preenchida.
  const atual = (await sql`
    select passivas_aceitas, expira_em from purification_referencia where id = 1
  `) as { passivas_aceitas: string[]; expira_em: string }[];
  return { passivasAceitas: atual[0].passivas_aceitas, expiraEm: atual[0].expira_em };
}

export async function passivasDoUltimoRitual(): Promise<ReferenciaDeRegra> {
  const rows = (await sql`
    select passivas_aceitas, expira_em
    from purification_referencia
    where id = 1 and expira_em is not null and expira_em > now()
  `) as { passivas_aceitas: string[]; expira_em: string }[];
  const r = rows[0];
  if (r) return { passivasAceitas: r.passivas_aceitas, expiraEm: r.expira_em };

  // Expirou (ou nunca houve sugestão): sorteia uma nova em vez de devolver
  // vazio — pedido do dono em 21/09/2026, a Câmara nunca fica sem sugestão
  // por muito tempo mesmo sem a staff mexer. A staff continua podendo
  // substituir na hora que quiser, em `atualizarReferenciaDeRegra`.
  return sortearEGravarReferencia();
}

/**
 * Qual Pal mostrar na vitrine da home — o ritual em andamento mais recente,
 * de qualquer jogador (a cápsula na home é pública, não pessoal). `null`
 * quando não há nenhuma purificação rolando agora.
 */
export async function ritualEmDestaque(): Promise<{ palId: string } | null> {
  const rows = (await sql`
    select pal_id
    from purification_rituals
    where status in ('aguardando_regra', 'ativo')
    order by created_at desc
    limit 1
  `) as { pal_id: string }[];
  return rows[0] ? { palId: rows[0].pal_id } : null;
}

/**
 * Define (ou redefine) a "sugestão de passivas" da Câmara — configuração
 * única e global, sem depender de nenhum ritual existir. Diferente de
 * `definirRegraDoRitual`, que é a regra que vale de verdade para um ritual
 * em andamento.
 *
 * `minutosValidade`: por quantos minutos a sugestão vale a partir de agora
 * — passado isso, `passivasDoUltimoRitual` para de devolvê-la e sorteia
 * outra. O formulário soma dias + horas + minutos antes de chamar isto;
 * aceita minutos de propósito (não só dias) para o dono poder testar/dar
 * validades curtas, pedido de 21/09/2026.
 */
export async function atualizarReferenciaDeRegra(
  passivas: string[],
  minutosValidade: number,
): Promise<Resultado> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return staff;
  if (passivas.length === 0) {
    return { ok: false, mensagem: "Escolha pelo menos uma passiva aceita." };
  }
  if (
    !Number.isFinite(minutosValidade) ||
    minutosValidade < MINUTOS_REFERENCIA_MINIMO ||
    minutosValidade > MINUTOS_REFERENCIA_MAXIMO
  ) {
    return {
      ok: false,
      mensagem: `A validade precisa ser entre ${MINUTOS_REFERENCIA_MINIMO} minutos e ${DIAS_REFERENCIA_MAXIMO} dias.`,
    };
  }

  await sql`
    update purification_referencia
    set passivas_aceitas = ${passivas},
        definida_por = ${staff.discordId},
        definida_em = now(),
        expira_em = now() + (${minutosValidade} || ' minutes')::interval
    where id = 1
  `;
  return { ok: true, mensagem: "Sugestão atualizada." };
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
 * Grava o ritual novo — comum à entrada pela palbox (`iniciarRitual`) e pelo
 * cofre (`iniciarRitualDoCofre`). Devolve se já nasceu com a regra de
 * referência. Lança se o insert falhar; quem chama decide como desfazer.
 */
async function gravarRitual(
  discordId: string,
  serverSlug: string,
  template: PalTemplate,
  instanceId: string,
): Promise<boolean> {
  // Se já existe uma regra de referência (o staff já definiu isso antes,
  // mesmo que num ritual anterior), o ritual novo nasce direto `ativo` com
  // ela — não faz sentido esperar o staff repetir um clique que já deu.
  // "aguardando_regra" só acontece de verdade no primeiro ritual da
  // história da Câmara, antes de qualquer referência existir.
  const referencia = await passivasDoUltimoRitual();

  // O ritual parte do IV que o Pal JÁ tem, não de 100 fixo — um Pal que já
  // passou pela Câmara (ex: resgatado com 110) e entra de novo para chegar
  // mais perto de 150 perdia tudo o que tinha ganho, porque a coluna nascia
  // com o default 100 e cancelar/resgatar gravava esse 100 por cima
  // (Felbat do Handoroki, ritual 61, 22/09/2026).
  const ivInicial = (iv: number) => Math.min(IV_TETO_RITUAL, Math.max(IV_INICIAL_RITUAL, iv));
  const ivHealth = ivInicial(ivVida(template.IVs));
  const ivAttack = ivInicial(ivAtaque(template.IVs));
  const ivDefense = ivInicial(ivDefesa(template.IVs));

  if (referencia) {
    await sql`
      insert into purification_rituals
        (discord_id, server_slug, pal_id, template, instance_id_inicial,
         status, passivas_aceitas, regra_definida_por, regra_definida_em,
         iv_health, iv_attack, iv_defense)
      values (${discordId}, ${serverSlug}, ${template.PalID}, ${JSON.stringify(template)}, ${instanceId},
              'ativo', ${referencia.passivasAceitas}, ${discordId}, now(),
              ${ivHealth}, ${ivAttack}, ${ivDefense})
    `;
  } else {
    await sql`
      insert into purification_rituals
        (discord_id, server_slug, pal_id, template, instance_id_inicial,
         iv_health, iv_attack, iv_defense)
      values (${discordId}, ${serverSlug}, ${template.PalID}, ${JSON.stringify(template)}, ${instanceId},
              ${ivHealth}, ${ivAttack}, ${ivDefense})
    `;
  }
  return Boolean(referencia);
}

/**
 * Abre um ritual novo com o Pal escolhido na palbox. Falha se já houver um
 * ritual em `aguardando_regra`/`ativo` — a migração 020 tem o índice único
 * que faz valer isso mesmo sob corrida.
 */
export async function iniciarRitual(
  serverSlug: string,
  instanceId: string,
  aceitaPerderDespertar = false,
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

  const elegivel = elegibilidadeAlvo({
    ivs: template.IVs,
    partnerSkillLevel: template.PartnerSkillLevel,
    passives: template.Passives,
    palId: template.PalID,
  });
  if (!elegivel.ok) {
    return { ok: false, mensagem: elegivel.motivo };
  }
  // `IsAwakening` não faz parte do `PalTemplate` (ver `lib/pal-template.ts`),
  // só da resposta crua da API — e é lido da palbox agora, não do que o
  // navegador mandou: se o Pal despertou depois de a página abrir, o aceite
  // ainda é exigido.
  if (pal.IsAwakening === true && !aceitaPerderDespertar) {
    return {
      ok: false,
      mensagem: "Esse Pal está despertado — confirme que entende que ele sai da Câmara sem o despertar.",
    };
  }

  // O Pal sai da palbox de verdade — mesma disciplina do cofre
  // (`importarPalParaCofre`): tenta os filtros candidatos do mais
  // específico pro mais genérico, para no primeiro que apagar de fato.
  const candidatos = candidatosDeFiltro(pal);
  let resposta: { ok: boolean; resposta: string } | undefined;
  try {
    for (const candidato of candidatos) {
      resposta = await delPal(server, vinculo.uid, candidato);
      if (resposta.ok) break;
    }
  } catch {
    return {
      ok: false,
      mensagem: "O servidor não respondeu. Confira seus Pals no jogo antes de tentar de novo.",
    };
  }
  if (!resposta?.ok) {
    return { ok: false, mensagem: "O jogo recusou a retirada. Nada foi movido." };
  }

  // O jogo já removeu de verdade — se o insert falhar daqui pra frente, o
  // Pal não pode simplesmente sumir: registrar o erro é o mínimo, mas não
  // existe caminho de volta automático (mesmo risco documentado no cofre).
  let referencia: boolean;
  try {
    referencia = await gravarRitual(discordId, serverSlug, template, instanceId);
  } catch {
    return {
      ok: false,
      mensagem:
        "Seu Pal saiu da palbox mas o registro falhou — fale com o staff, o template ficou salvo.",
    };
  }

  return {
    ok: true,
    mensagem: referencia
      ? `${template.PalID} entrou na câmara, já com a regra de sempre. Pode começar a doar.`
      : `${template.PalID} entrou na câmara. Aguarde o staff definir as passivas aceitas.`,
  };
}

/**
 * Começa a purificação com um Pal que está no cofre de Pals do site, sem
 * passar pelo jogo (pedido do dono em 23/09/2026). Serve a quem está com a
 * palbox cheia — a Handoroki, com 960/960 — ou longe do jogo.
 *
 * Mesma barra de entrada (`elegibilidadeAlvo`). O Pal sai do cofre e entra
 * no ritual num passo só do lado do banco; se gravar o ritual falhar, volta
 * para o cofre com o mesmo `imported_at` (ver a memória
 * gotcha-tirar-do-cofre-zera-a-trava).
 *
 * O ritual fica no servidor de onde o Pal saiu (`vault_pals.server_slug`) —
 * é lá que ele volta ao resgatar. Pal sem origem (ex: Pal Monster) fica no
 * servidor do vínculo.
 */
export async function iniciarRitualDoCofre(vaultPalId: number): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  const vinculo = await meuVinculo(discordId);
  if (!vinculo) {
    return { ok: false, mensagem: "Vincule seu personagem antes de usar a Câmara." };
  }

  const emAndamento = await meuRitualAtivo(discordId);
  if (emAndamento && (emAndamento.status === "aguardando_regra" || emAndamento.status === "ativo")) {
    return { ok: false, mensagem: "Você já tem um Pal em purificação agora." };
  }

  const [linha] = (await sql`
    select id, template, server_slug from vault_pals
    where id = ${vaultPalId} and discord_id = ${discordId}
  `) as { id: number; template: PalTemplate; server_slug: string | null }[];
  if (!linha) return { ok: false, mensagem: "Esse Pal não está mais no seu cofre." };

  const template = linha.template;
  const elegivel = elegibilidadeAlvo({
    ivs: template.IVs,
    partnerSkillLevel: template.PartnerSkillLevel,
    passives: template.Passives,
    palId: template.PalID,
  });
  if (!elegivel.ok) return { ok: false, mensagem: elegivel.motivo };

  const serverSlug = linha.server_slug ?? vinculo.serverSlug;
  if (!serverBySlug(serverSlug)) return { ok: false, mensagem: "Servidor inválido." };

  // Tira do cofre primeiro — o `delete ... returning` é a trava contra dois
  // cliques: só um deles leva a linha.
  const saiu = (await sql`
    delete from vault_pals where id = ${vaultPalId} and discord_id = ${discordId}
    returning pal_id, template, server_slug, imported_at
  `) as { pal_id: string; template: PalTemplate; server_slug: string | null; imported_at: string }[];
  if (!saiu.length) return { ok: false, mensagem: "Esse Pal não está mais no seu cofre." };

  let referencia: boolean;
  try {
    referencia = await gravarRitual(discordId, serverSlug, template, `cofre-${vaultPalId}`);
  } catch {
    const s = saiu[0];
    await sql`
      insert into vault_pals (discord_id, pal_id, template, server_slug, imported_at)
      values (${discordId}, ${s.pal_id}, ${JSON.stringify(s.template)}, ${s.server_slug}, ${s.imported_at})
    `;
    return { ok: false, mensagem: "Não consegui começar agora — o Pal continua no seu cofre." };
  }

  return {
    ok: true,
    mensagem: referencia
      ? `${template.PalID} saiu do cofre e entrou na câmara. Pode começar a doar.`
      : `${template.PalID} saiu do cofre e entrou na câmara. Aguarde o staff definir as passivas aceitas.`,
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
    { ivs: template.IVs, partnerSkillLevel: template.PartnerSkillLevel, passives: template.Passives, palId: template.PalID },
    ritual.passivasAceitas,
    ritual.palId,
  );
  if (!elegivel.ok) {
    return { ok: false, mensagem: elegivel.motivo };
  }

  // O doador sai da palbox de verdade — mesmo padrão de `iniciarRitual`.
  const candidatos = candidatosDeFiltro(pal);
  let resposta: { ok: boolean; resposta: string } | undefined;
  try {
    for (const candidato of candidatos) {
      resposta = await delPal(server, vinculo.uid, candidato);
      if (resposta.ok) break;
    }
  } catch {
    return {
      ok: false,
      mensagem: "O servidor não respondeu. Confira seus Pals no jogo antes de tentar de novo.",
    };
  }
  if (!resposta?.ok) {
    return { ok: false, mensagem: "O jogo recusou a retirada. Nada foi movido." };
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
        ${template.PartnerSkillLevel}, ${elegivel.passivaUsada}
      )
    `;
  } catch (e) {
    // `unique (ritual_id, instance_id)` bloqueando um clique duplo/reenvio
    // do mesmo Pal não é perda de verdade: a primeira tentativa já
    // registrou a doação, o Pal está seguro no histórico. Qualquer outro
    // erro de banco é grave — o Pal saiu da palbox sem nenhum registro.
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate key|unique constraint/i.test(msg)) {
      return { ok: false, mensagem: "Esse Pal já tinha sido doado nesta rodada." };
    }
    console.error("[purificacao] insert de doador falhou depois do delPal:", {
      ritualId: ritual.id,
      instanceId,
      palId: template.PalID,
      erro: msg,
    });
    return {
      ok: false,
      mensagem: "Seu Pal saiu da palbox mas o registro falhou — fale com o staff.",
    };
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

/**
 * Define a lista de passivas aceitas e ativa o ritual — ou, se o ritual já
 * estiver `ativo`, redefine a regra no meio do caminho (staff mudou de
 * ideia). Doadores já confirmados em rodadas anteriores não são afetados:
 * a nova regra só vale para quem ainda vai doar.
 */
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
    where id = ${ritualId} and status in ('aguardando_regra', 'ativo')
    returning id
  `) as { id: number }[];

  if (!atualizado.length) {
    return { ok: false, mensagem: "Esse ritual não pode mais ter a regra alterada." };
  }
  return { ok: true, mensagem: "Regra atualizada." };
}

/**
 * O IV mínimo pra resgatar o Pal purificado — configuração ÚNICA e global
 * da Câmara inteira (`purification_config`, migração 021), não por ritual:
 * com vários jogadores ao mesmo tempo, editar ritual por ritual seria
 * inviável para o staff. Padrão 110 se a linha de config ainda não existir
 * por algum motivo.
 */
export async function ivMinimoResgateAtual(): Promise<number> {
  const rows = (await sql`
    select iv_minimo_resgate from purification_config where id = 1
  `) as { iv_minimo_resgate: number }[];
  return rows[0]?.iv_minimo_resgate ?? IV_MINIMO_RESGATE_PADRAO;
}

/** Staff muda o IV mínimo de resgate para TODA a Câmara, de uma vez. */
export async function atualizarIvMinimoResgate(ivMinimo: number): Promise<Resultado> {
  const staff = await exigirStaff();
  if (!("discordId" in staff)) return staff;

  if (!Number.isInteger(ivMinimo) || ivMinimo < IV_INICIAL_RITUAL || ivMinimo > IV_TETO_RITUAL) {
    return {
      ok: false,
      mensagem: `O IV mínimo precisa estar entre ${IV_INICIAL_RITUAL} e ${IV_TETO_RITUAL}.`,
    };
  }

  await sql`
    insert into purification_config (id, iv_minimo_resgate)
    values (1, ${ivMinimo})
    on conflict (id) do update set iv_minimo_resgate = ${ivMinimo}
  `;
  return { ok: true, mensagem: `IV mínimo de resgate agora é ${ivMinimo}, pra todo mundo.` };
}

/**
 * Cancela um ritual — o próprio dono pode desistir e trocar de Pal a
 * qualquer momento, e staff pode cancelar qualquer um, para corrigir engano
 * ou abuso.
 *
 * 🔴 Corrigido em 21/09/2026: até então, cancelar só mudava `status` no
 * banco e NUNCA devolvia o Pal — mas o Pal já tinha saído da palbox de
 * verdade em `iniciarRitual` (`delPal`), e nada no cancelamento chamava um
 * resgate de volta. Resultado: o Pal ficava perdido para sempre, sem nenhum
 * aviso disso na tela — foi assim que o Felbat do SantØs sumiu ao cancelar,
 * e teve que ser devolvido na mão.
 *
 * Agora cancelar guarda o Pal no cofre (`vault_pals`) — mesmo lugar e mesma
 * trava de `COOLDOWN_RESGATE_HORAS` que qualquer outro Pal guardado, em vez
 * de devolver direto pra palbox (pedido do dono, 21/09/2026: cancelar não
 * deveria ser um "givepal" instantâneo). Sem RCON nem GitHub Actions: o Pal
 * já não está mais no jogo desde `iniciarRitual`, então "guardar no cofre"
 * aqui é só a mesma linha que `resgatarDoCofre` grava depois do `delPal` —
 * ver `lib/pal-cofre.ts`. Sai com o IV que o ritual já tinha alcançado até
 * aquele momento (não o original de entrada): perder progresso de IV ao
 * cancelar continua sendo o risco de quem doou, perder o Pal em si nunca
 * deveria ter sido possível.
 */
/**
 * O template de saída da Câmara (cancelar → cofre, resgatar → palbox):
 * clone inteiro do Pal que entrou, Gênero travado em "None", e os três
 * eixos de IV no valor do ritual. Nunca abaixo do que o Pal já tinha ao
 * entrar — rituais antigos nasciam em 100 mesmo com o Pal em 110.
 */
function templateComIvsDoRitual(ritual: {
  template: PalTemplate;
  iv_health: number;
  iv_attack: number;
  iv_defense: number;
}): PalTemplate {
  const ivsOriginais = ritual.template.IVs;
  const atacaCorpoACorpo = Number(ivsOriginais.AttackMelee ?? 0) >= Number(ivsOriginais.AttackShot ?? 0);
  return {
    ...ritual.template,
    Gender: "None",
    IVs: {
      ...ivsOriginais,
      Health: Math.max(ritual.iv_health, ivVida(ivsOriginais)),
      Defense: Math.max(ritual.iv_defense, ivDefesa(ivsOriginais)),
      ...(atacaCorpoACorpo
        ? { AttackMelee: Math.max(ritual.iv_attack, ivAtaque(ivsOriginais)) }
        : { AttackShot: Math.max(ritual.iv_attack, ivAtaque(ivsOriginais)) }),
    },
  };
}

export async function cancelarRitual(ritualId: number): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;
  const staff = isStaff(levelOf(session.user.roles, session.user.isMember));

  const rows = (await sql`
    select id, discord_id, server_slug, template, status, iv_health, iv_attack, iv_defense
    from purification_rituals
    where id = ${ritualId}
  `) as {
    id: number;
    discord_id: string;
    server_slug: string;
    template: PalTemplate;
    status: string;
    iv_health: number;
    iv_attack: number;
    iv_defense: number;
  }[];
  const ritual = rows[0];
  if (!ritual) return { ok: false, mensagem: "Ritual não encontrado." };
  if (!staff && ritual.discord_id !== discordId) {
    return { ok: false, mensagem: "Essa purificação não é sua." };
  }
  if (ritual.status !== "aguardando_regra" && ritual.status !== "ativo") {
    return { ok: false, mensagem: "Esse ritual não pode mais ser cancelado." };
  }

  // Um resgate já pode estar em voo (workflow do GitHub Actions/RCON já
  // disparado por `resgatarPalPurificado`) — não tem como abortar isso a
  // meio caminho, e cancelar por cima guardaria o Pal duas vezes.
  const emVoo = (await sql`
    select id from pal_transfers
    where ritual_id = ${ritualId}
      and direction = 'resgatar'
      and status in ('aguardando_arquivo', 'arquivo_pronto')
    limit 1
  `) as { id: number }[];
  if (emVoo.length) {
    return { ok: false, mensagem: "O resgate desse Pal já começou — não é mais possível cancelar." };
  }

  // Mesmo clone de `resgatarPalPurificado`: só os IVs atuais mudam, Gênero
  // travado em "None" (peça única da purificação, não entra em incubadora).
  const templateAtualizado = templateComIvsDoRitual(ritual);

  try {
    await sql`
      insert into vault_pals (discord_id, pal_id, template, server_slug)
      values (${ritual.discord_id}, ${templateAtualizado.PalID}, ${JSON.stringify(templateAtualizado)}, ${ritual.server_slug})
    `;
  } catch {
    return {
      ok: false,
      mensagem: "Não consegui guardar o Pal no cofre agora — o ritual continua ativo. Tente cancelar de novo em instantes.",
    };
  }

  const atualizado = (await sql`
    update purification_rituals
    set status = 'cancelado'
    where id = ${ritualId} and status in ('aguardando_regra', 'ativo')
    returning id
  `) as { id: number }[];

  if (!atualizado.length) {
    return { ok: false, mensagem: "Esse ritual não pode mais ser cancelado." };
  }
  return {
    ok: true,
    mensagem: `Ritual cancelado — o Pal foi para o seu cofre (libera em ${COOLDOWN_RESGATE_HORAS}h).`,
  };
}

/* --------------------------------------------------------------- resgatar */

export interface ResgateDaCamaraPendente {
  transferId: number;
  palId: string;
}

/**
 * Resgate da Câmara que ficou pelo meio do caminho — mesmo motivo de
 * `pal-cofre.ts::meusResgatesPendentes`: a pessoa fechou a aba, ou o
 * `useActionState` do formulário perdeu o `transferId` num remount (ex: o
 * `router.refresh()` do `DoarPal`), antes do polling no navegador terminar.
 * `pal_transfers` não sabe que veio da Câmara — filtra pelas transferências
 * do jogador cujo `direction` é 'resgatar' e que ainda não fecharam.
 *
 * Precisa travar por `ritualId` também: sem isso, um resgate de um ritual
 * já cancelado (o jogador clicou "Resgatar", cancelou o ritual antes do
 * workflow terminar, e começou outro) ficava "órfão" e era devolvido como
 * se fosse do ritual novo em exibição — o Pal errado voltando pra palbox.
 */
export async function meuResgatePendenteDaCamara(
  discordId: string,
  ritualId: number,
): Promise<ResgateDaCamaraPendente | null> {
  const rows = (await sql`
    select id, template->>'PalID' as pal_id
    from pal_transfers
    where discord_id = ${discordId}
      and direction = 'resgatar'
      and ritual_id = ${ritualId}
      and status in ('aguardando_arquivo', 'arquivo_pronto')
    order by created_at desc
    limit 1
  `) as { id: number; pal_id: string }[];
  const r = rows[0];
  return r ? { transferId: r.id, palId: r.pal_id } : null;
}

/**
 * Resgata o Pal purificado de volta pra palbox — a partir do IV mínimo
 * global da Câmara (`ivMinimoResgateAtual`, padrão 110, editável pelo
 * staff em `atualizarIvMinimoResgate`), não precisa esperar o teto de 150.
 * Mesmo mecanismo de duas fases do cofre (`pal_transfers` + GitHub Actions
 * + RCON): não dá pra chamar `givepal_j` direto, o arquivo precisa existir
 * no servidor primeiro.
 *
 * O template preserva TODOS os campos originais do Pal (gênero, nível,
 * passivas, nickname…) — só os três eixos de IV são elevados ao valor
 * atual do ritual. Perder `Gender` aqui faria o Pal voltar sem sexo
 * definido, por isso o template é clonado por inteiro, nunca reconstruído
 * campo a campo.
 */
export async function resgatarPalPurificado(ritualId: number): Promise<Resultado & { transferId?: number }> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  const rows = (await sql`
    select id, discord_id, server_slug, template, status, iv_health, iv_attack, iv_defense
    from purification_rituals
    where id = ${ritualId} and discord_id = ${discordId}
  `) as {
    id: number;
    discord_id: string;
    server_slug: string;
    template: PalTemplate;
    status: string;
    iv_health: number;
    iv_attack: number;
    iv_defense: number;
  }[];
  const ritual = rows[0];
  if (!ritual) return { ok: false, mensagem: "Essa purificação não é sua." };
  if (ritual.status !== "ativo" && ritual.status !== "completo") {
    return { ok: false, mensagem: "Essa purificação não está mais em andamento." };
  }

  const ivMinimo = await ivMinimoResgateAtual();
  const ivMedio = Math.round((ritual.iv_health + ritual.iv_attack + ritual.iv_defense) / 3);
  if (ivMedio < ivMinimo) {
    return {
      ok: false,
      mensagem: `Só dá para resgatar a partir de IV ${ivMinimo} — está em ${ivMedio}.`,
    };
  }

  const vinculo = await meuVinculo(discordId);
  const server = serverBySlug(ritual.server_slug);
  if (!vinculo || !server) {
    return { ok: false, mensagem: "Vincule seu personagem antes de resgatar." };
  }

  // Mesmo cuidado do cofre (`semEspacoParaPal`): palbox e time lotados
  // deixariam o Pal purificado sem lugar para cair.
  try {
    if (await semEspacoParaPal(server, vinculo.uid)) {
      return {
        ok: false,
        mensagem: "Sua palbox e seu time estão cheios — solte ou guarde um Pal no jogo antes de resgatar.",
      };
    }
  } catch {
    /* sem resposta da REST: segue, como antes */
  }

  // Clona o template inteiro — só os IVs mudam, e o Gênero é travado em
  // "None" de propósito (§pedido do dono, 14/09/2026): um Pal purificado
  // sai infértil, nunca entra em incubadora — é a peça única que evita
  // alguém resgatar, escolher o mesmo Pal de novo (voltou pra palbox) e
  // repetir o ritual pra fabricar cópias purificadas sem limite.
  const templateAtualizado = templateComIvsDoRitual(ritual);

  // Um resgate só por ritual: o status 'completo' continua aceito acima
  // para permitir tentar de novo depois de uma entrega que FALHOU, mas um
  // segundo clique com a primeira ainda na fila (ou já entregue) duplicava
  // o Pal — o ritual 60 do Handoroki gerou duas transferências 13s uma da
  // outra e as duas deram "Granted Pal" (22/09/2026). O `not exists` no
  // mesmo insert fecha a janela entre conferir e gravar.
  const inseridos = (await sql`
    insert into pal_transfers
      (discord_id, server_slug, palworld_uid, template, direction, status, arquivo, ritual_id)
    select ${discordId}, ${ritual.server_slug}, ${vinculo.uid},
           ${JSON.stringify(templateAtualizado)}, 'resgatar', 'aguardando_arquivo', '', ${ritualId}
    where not exists (
      select 1 from pal_transfers
      where ritual_id = ${ritualId}
        and direction = 'resgatar'
        and status <> 'falhou'
    )
    returning id
  `) as { id: number }[];
  if (!inseridos.length) {
    return { ok: false, mensagem: "O resgate desse Pal já foi feito — confira sua palbox." };
  }
  const transferId = inseridos[0].id;

  const arquivo = nomeDoArquivo(transferId);
  await sql`update pal_transfers set arquivo = ${arquivo} where id = ${transferId}`;

  try {
    await dispararWorkflow("deliver-pal-template.yml", {
      transfer_id: String(transferId),
      modo: "aplicar",
    });
  } catch (e) {
    await sql`update pal_transfers set status = 'falhou', detail = ${(e instanceof Error ? e.message : String(e)).slice(0, 500)}, finished_at = now() where id = ${transferId}`;
    return { ok: false, mensagem: "Não consegui iniciar o resgate agora. Tente de novo." };
  }

  await sql`
    update purification_rituals
    set status = 'completo', completed_at = coalesce(completed_at, now())
    where id = ${ritualId}
  `;

  return {
    ok: true,
    mensagem: "Resgate iniciado — aguarde o Pal chegar na sua palbox.",
    transferId,
  };
}

/**
 * Promove o ritual de `completo` para `resgatado` assim que o `givepal_j`
 * confirma de verdade — chamado pelo polling da Câmara (`acaoConsultarResgate`)
 * a cada `"concluido"` recebido. Sem isso, `status = 'completo'` marcava só
 * "o resgate começou", e a tela continuava mostrando a cápsula com o Pal já
 * de volta na palbox, sem opção de começar uma purificação nova — porque
 * `meuRitualAtivo` sempre pega o ritual mais recente, e nada distinguia
 * "resgate em andamento" de "resgate concluído, cápsula livre".
 */
export async function marcarRitualResgatadoSeConcluido(transferId: number): Promise<void> {
  await sql`
    update purification_rituals
    set status = 'resgatado'
    where id = (select ritual_id from pal_transfers where id = ${transferId})
      and status = 'completo'
  `;
}
