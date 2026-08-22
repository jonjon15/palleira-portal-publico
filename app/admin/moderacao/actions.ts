"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canModerate, canPowerServer } from "@/lib/roles";
import { serverBySlug, type PalleiraServer } from "@/lib/servers";
import {
  announce,
  kickPlayer,
  banPlayer,
  unbanPlayer,
  saveWorld,
  shutdownServer,
} from "@/lib/palworld/rest";
import { registrar, ACAO_LABEL, type AcaoModeracao } from "@/lib/moderacao";
import { espelharAnuncio, logarNoDiscord } from "@/lib/discord";
import { enviarEnergia, SINAL_LABEL, type Sinal } from "@/lib/painel";

export interface Estado {
  ok: boolean;
  mensagem: string;
}

/** Todo mundo que mexe no servidor de verdade passa por aqui antes (§5.3). */
async function exigirModeracao() {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  const nivel = levelOf(session.user.roles, session.user.isMember);
  if (!canModerate(nivel)) throw new Error("Sem permissão");
  return session.user.discordId;
}

/** Energia é mais restrito que moderação: derruba todo mundo, não uma pessoa. */
async function exigirEnergia() {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  const nivel = levelOf(session.user.roles, session.user.isMember);
  if (!canPowerServer(nivel)) throw new Error("Sem permissão");
  return session.user.discordId;
}

function servidorOuFalha(slug: string): PalleiraServer {
  const server = serverBySlug(slug);
  if (!server) throw new Error("Servidor inválido ou desativado.");
  return server;
}

/**
 * Roda a ação, grava no log de auditoria (sucesso OU falha) e espelha no
 * Discord. Centralizado aqui para nenhuma ação esquecer de auditar.
 */
async function executar(args: {
  actorId: string;
  server: PalleiraServer;
  action: AcaoModeracao;
  target?: string;
  detail: string;
  rodar: () => Promise<unknown>;
  sucesso: string;
}): Promise<Estado> {
  try {
    await args.rodar();
    await registrar({
      actorId: args.actorId,
      serverSlug: args.server.slug,
      action: args.action,
      target: args.target,
      detail: args.detail,
      ok: true,
    });
    await logarNoDiscord(
      `🛠️ **${args.server.shortName}** · ${ACAO_LABEL[args.action]}` +
        `${args.target ? ` · \`${args.target}\`` : ""} — <@${args.actorId}>` +
        (args.detail ? `\n> ${args.detail}` : ""),
    );
    revalidatePath("/admin/moderacao");
    return { ok: true, mensagem: args.sucesso };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Erro desconhecido";
    await registrar({
      actorId: args.actorId,
      serverSlug: args.server.slug,
      action: args.action,
      target: args.target,
      detail: args.detail,
      ok: false,
      error: erro,
    });
    revalidatePath("/admin/moderacao");
    return { ok: false, mensagem: erro };
  }
}

/* ------------------------------------------------------------ salvar mundo */

export async function salvarMundo(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirModeracao();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));

  return executar({
    actorId,
    server,
    action: "save",
    detail: "",
    rodar: () => saveWorld(server),
    sucesso: `Mundo salvo em ${server.shortName}.`,
  });
}

/* ----------------------------------------------------------------- anúncio */

export async function enviarAnuncio(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirModeracao();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const mensagem = String(form.get("mensagem") ?? "").trim();

  if (!mensagem) return { ok: false, mensagem: "Escreva o anúncio antes de mandar." };
  if (mensagem.length > 300) {
    return { ok: false, mensagem: "Anúncio longo demais — resuma em até 300 caracteres." };
  }

  const r = await executar({
    actorId,
    server,
    action: "broadcast",
    detail: mensagem,
    rodar: () => announce(server, mensagem),
    sucesso: `Anúncio publicado em ${server.shortName}.`,
  });
  if (r.ok) await espelharAnuncio(server.shortName, mensagem);
  return r;
}

/* --------------------------------------------------- jogador online (kick/ban) */

/**
 * Uma ação só, com botão "kick" e "ban" no mesmo form (mesmo padrão do
 * importador de economia): evita duplicar toda a lógica de log/log-discord
 * para cada botão da linha do jogador.
 */
export async function agirSobreJogador(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirModeracao();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const userId = String(form.get("userId") ?? "").trim();
  const nome = String(form.get("nome") ?? "").trim() || userId;
  const acao = String(form.get("acao") ?? "");

  if (!userId) return { ok: false, mensagem: "Faltou o userId do jogador." };
  if (acao !== "kick" && acao !== "ban") {
    return { ok: false, mensagem: "Ação desconhecida." };
  }

  return executar({
    actorId,
    server,
    action: acao,
    target: userId,
    detail: nome,
    rodar: () =>
      acao === "kick" ? kickPlayer(server, userId) : banPlayer(server, userId),
    sucesso:
      acao === "kick"
        ? `${nome} expulso de ${server.shortName}.`
        : `${nome} banido de ${server.shortName}.`,
  });
}

/* --------------------------------------------------------- ban/unban manual */

const soUserId = (s: string) => /^(steam|gdk|ps5|mac)_\w{5,}$/.test(s);

export async function banirManual(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirModeracao();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const userId = String(form.get("userId") ?? "").trim();
  const motivo = String(form.get("motivo") ?? "").trim();

  if (!soUserId(userId)) {
    return {
      ok: false,
      mensagem:
        "Cole o userId completo, com prefixo — steam_76561198…, gdk_…, ps5_… (aparece na lista de jogadores online ou no /players da API).",
    };
  }
  if (!motivo) return { ok: false, mensagem: "O motivo é obrigatório e fica no log." };

  return executar({
    actorId,
    server,
    action: "ban",
    target: userId,
    detail: motivo,
    rodar: () => banPlayer(server, userId, motivo),
    sucesso: `${userId} banido em ${server.shortName}.`,
  });
}

export async function desbanirManual(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirModeracao();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const userId = String(form.get("userId") ?? "").trim();

  if (!soUserId(userId)) {
    return {
      ok: false,
      mensagem: "Cole o userId completo, com prefixo — steam_76561198…, gdk_…, ps5_…",
    };
  }

  return executar({
    actorId,
    server,
    action: "unban",
    target: userId,
    detail: "",
    rodar: () => unbanPlayer(server, userId),
    sucesso: `${userId} desbanido em ${server.shortName}.`,
  });
}

/* --------------------------------------------------------------- desligar */

export async function desligarServidor(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirModeracao();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const espera = Number(form.get("espera") ?? 60);
  const mensagem = String(form.get("mensagem") ?? "").trim();

  if (!Number.isInteger(espera) || espera < 0 || espera > 3600) {
    return { ok: false, mensagem: "A contagem tem que ser um número inteiro entre 0 e 3600 segundos." };
  }
  if (!mensagem) {
    return { ok: false, mensagem: "Escreva o motivo — ele aparece na contagem regressiva do jogo." };
  }

  return executar({
    actorId,
    server,
    action: "shutdown",
    detail: `${mensagem} (${espera}s)`,
    rodar: () => shutdownServer(server, espera, mensagem),
    sucesso: `Desligamento de ${server.shortName} iniciado — ${espera}s até cair.`,
  });
}

/* ----------------------------------------------------------------- energia */

/**
 * Liga, reinicia ou finaliza pelo painel da ENX.
 *
 * O `stop` do painel não está aqui de propósito: para desligar já existe o
 * `shutdown` da REST, que avisa o jogador com contagem regressiva antes de
 * cair. Cortar pelo painel sem aviso seria um jeito pior de fazer a mesma
 * coisa.
 */
export async function energiaServidor(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirEnergia();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const sinal = String(form.get("sinal") ?? "") as Sinal;

  if (sinal !== "start" && sinal !== "restart" && sinal !== "kill") {
    return { ok: false, mensagem: "Comando de energia inválido." };
  }

  if (!server.panelId) {
    return {
      ok: false,
      mensagem: `Falta cadastrar o ID do painel para ${server.shortName}.`,
    };
  }

  /*
   * Reiniciar corta o processo na hora — sem salvar antes, perde-se tudo
   * desde o último autosave. No teste de 22/08 isso foi feito na mão, e é
   * exatamente o tipo de passo que a mão esquece às 3h da manhã. Fica no
   * código.
   *
   * Um save que falha NÃO impede o reinício: servidor travado é justamente
   * quando mais se precisa reiniciar, e é quando o save tem mais chance de
   * não responder. O resultado vai para o log, para depois se saber se o
   * mundo estava salvo ou não.
   *
   * `kill` não salva de propósito (é para servidor que já não responde) e
   * `start` não tem o que salvar.
   */
  const salvou =
    sinal === "restart"
      ? await saveWorld(server).then(
          () => true,
          () => false,
        )
      : null;

  const nota =
    salvou === null ? "" : salvou ? " · mundo salvo antes" : " · o save falhou antes";

  return executar({
    actorId,
    server,
    action: "power",
    detail: SINAL_LABEL[sinal] + nota,
    rodar: () => enviarEnergia(server, sinal),
    // O painel aceita e executa em segundo plano — daí "pedido", não "feito".
    sucesso:
      `${SINAL_LABEL[sinal]} pedido ao painel para ${server.shortName}. Pode levar um minuto até voltar a responder.` +
      (salvou === false
        ? " ⚠️ O save não respondeu antes do reinício — o mundo voltou ao último autosave."
        : salvou
          ? " O mundo foi salvo antes."
          : ""),
  });
}
