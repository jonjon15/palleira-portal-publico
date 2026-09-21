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
import { dispararWorkflow } from "@/lib/github";
import { sql } from "@/lib/db";
import {
  cancelarPedidoAdmin,
  estornarPedidoRecusado,
} from "@/lib/resgate-base";
import { entregarPalPorJson, continuarEntregaAdmin } from "@/lib/admin-entregar-pal";

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

/**
 * O nome sem espaços e em minúsculas, dos dois lados da busca.
 *
 * Existe porque em 06/09/2026 o dono não achou o jogador `C H R I S` — o nome
 * dele tem espaço entre cada letra, e digitar "chris" não casava com nada. Um
 * `ilike` sozinho compara texto cru, e nomes espaçados são comuns no jogo.
 */
function semEspaco(texto: string): string {
  return texto.toLowerCase().replace(/\s+/g, "");
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

/* ------------------------------------------------------- reset de jogador */

export interface Achado {
  uid: string;
  nome: string;
  level: number;
  guild: string | null;
}

export interface EstadoBusca extends Estado {
  achados?: Achado[];
}

/**
 * Procura jogador pelo nome, no servidor escolhido.
 *
 * Vem da tabela `players`, alimentada pelo robô de import de 2 em 2 horas —
 * então o nível pode estar algumas horas atrasado. O que importa aqui é o
 * `uid`, que não muda.
 */
export async function buscarJogador(
  _anterior: EstadoBusca,
  form: FormData,
): Promise<EstadoBusca> {
  await exigirEnergia();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const termo = String(form.get("termo") ?? "").trim();

  if (termo.length < 2) {
    return { ok: false, mensagem: "Escreva pelo menos 2 letras do nome." };
  }

  const linhas = (await sql`
    select palworld_uid, name, level, guild_id
    from players
    where server_slug = ${server.slug}
      and (name ilike ${"%" + termo + "%"}
           or replace(lower(name), ' ', '') like ${"%" + semEspaco(termo) + "%"})
    order by level desc
    limit 12
  `) as { palworld_uid: string; name: string; level: number; guild_id: string | null }[];

  if (linhas.length === 0) {
    return {
      ok: false,
      mensagem: `Ninguém com "${termo}" em ${server.shortName}. O nome vem do último import, que roda de 2 em 2 horas.`,
    };
  }

  return {
    ok: true,
    mensagem: `${linhas.length} encontrado(s).`,
    achados: linhas.map((l) => ({
      uid: l.palworld_uid,
      nome: l.name,
      level: l.level,
      guild: l.guild_id,
    })),
  };
}

const MODOS = ["verificar", "simular", "aplicar"] as const;
type Modo = (typeof MODOS)[number];

const MODO_TEXTO: Record<Modo, string> = {
  verificar: "Teste de integridade pedido — ele só lê o mundo e confere que reescrever não corrompe nada.",
  simular: "Simulação pedida — mostra o que seria removido, sem gravar.",
  aplicar: "Reset disparado. O servidor vai parar, o jogador será apagado do mundo e o servidor volta sozinho.",
};

/**
 * Dispara o reset no GitHub Actions.
 *
 * ⚠️ Não faz o trabalho aqui: descomprimir 339 MB de mundo não cabe em
 * função serverless (1 GB de RAM, 60s). O site é o botão; o motor é o
 * Actions. Ver `lib/github.ts`.
 */
export async function dispararReset(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirEnergia();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const modo = String(form.get("modo") ?? "") as Modo;
  const uid = String(form.get("uid") ?? "").trim().toUpperCase();
  const confirmacao = String(form.get("confirmacao") ?? "").trim();
  const nome = String(form.get("nome") ?? "").trim();

  if (!MODOS.includes(modo)) {
    return { ok: false, mensagem: "Modo inválido." };
  }
  if (modo !== "verificar" && !/^[0-9A-F]{32}$/.test(uid)) {
    return { ok: false, mensagem: "UID inválido — são 32 caracteres hexadecimais." };
  }

  // Apagar personagem não tem volta. Exigir o nome digitado à mão é o que
  // separa "cliquei sem querer" de "eu quis fazer isto".
  if (modo === "aplicar" && confirmacao.toLowerCase() !== nome.toLowerCase()) {
    return {
      ok: false,
      mensagem: `Para apagar, digite o nome do jogador exatamente: ${nome}`,
    };
  }

  return executar({
    actorId,
    server,
    action: "power",
    target: uid || undefined,
    detail: `reset (${modo})${nome ? " de " + nome : ""}`,
    rodar: () =>
      dispararWorkflow("reset-player.yml", {
        servidor: server.slug,
        modo,
        uid,
        parar_servidor: String(modo === "aplicar"),
      }),
    sucesso: MODO_TEXTO[modo] + " Acompanhe em Ações recentes ou no GitHub.",
  });
}

/* ------------------------------------------------------ reset de dias */

/**
 * Zera (ou ajusta) o contador de "Dias" do mundo — o mesmo número que
 * aparece no browser de servidor do jogo.
 *
 * Só existe um campo isolado (`GameTimeSaveData.GameDateTimeTicks`) sendo
 * tocado — personagens, cofres e bases não são mexidos. Ver
 * `tools/reset_dias.py` para como o campo foi achado e validado.
 */
export async function dispararResetDias(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirEnergia();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const modo = String(form.get("modo") ?? "") as Modo;
  const diasStr = String(form.get("dias") ?? "0").trim();
  const confirmacao = String(form.get("confirmacao") ?? "").trim();

  if (!MODOS.includes(modo)) {
    return { ok: false, mensagem: "Modo inválido." };
  }

  const dias = Number(diasStr);
  if (modo !== "verificar" && (!Number.isFinite(dias) || dias < 0 || dias > 100_000)) {
    return { ok: false, mensagem: "Dias inválido — use um número entre 0 e 100000." };
  }

  // Reescrever o Level.sav de todo mundo não tem volta. A frase fixa separa
  // "cliquei sem querer" de "eu quis fazer isto" — mesmo espírito do reset
  // de jogador, só que sem nome de pessoa para digitar aqui.
  if (modo === "aplicar" && confirmacao.toUpperCase() !== "ZERAR") {
    return { ok: false, mensagem: 'Para gravar, digite ZERAR.' };
  }

  return executar({
    actorId,
    server,
    action: "reset_days",
    detail: `dias → ${dias} (${modo})`,
    rodar: () =>
      dispararWorkflow("reset-dias.yml", {
        servidor: server.slug,
        modo,
        dias: diasStr || "0",
        parar_servidor: String(modo === "aplicar"),
      }),
    sucesso:
      modo === "verificar"
        ? "Teste de integridade pedido — só lê o mundo e confere que reescrever não corrompe nada."
        : modo === "simular"
          ? "Simulação pedida — mostra o valor atual e o novo, sem gravar."
          : `Reset disparado. O servidor vai parar, os dias viram ${dias} e ele volta sozinho. Acompanhe em Ações recentes ou no GitHub.`,
  });
}

/* ------------------------------------------------------------------ wipe */

const MODOS_WIPE = ["simular", "aplicar"] as const;
type ModoWipe = (typeof MODOS_WIPE)[number];

/**
 * Wipe de verdade: move a pasta do mundo para backup e deixa o Palworld
 * criar um mundo novo ao subir. Não tem "verificar" — diferente do reset de
 * jogador e do reset de dias, aqui não existe GVAS para ler e reescrever,
 * só uma pasta para mover. Ver `tools/wipe_mundo.py`.
 */
export async function dispararWipe(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirEnergia();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const modo = String(form.get("modo") ?? "") as ModoWipe;
  const confirmacao = String(form.get("confirmacao") ?? "").trim();

  if (!MODOS_WIPE.includes(modo)) {
    return { ok: false, mensagem: "Modo inválido." };
  }

  // O servidor já vem fixado pelas abas do topo da página — não há lista
  // para errar aqui. A trava mora só no popup do lado do cliente (ver
  // WipeMundo em formularios.tsx): ele pede o nome do servidor e manda a
  // resposta neste campo. É a ação mais destrutiva do painel, então confere
  // de novo aqui — nunca confiar só no que o cliente prometeu ter validado.
  if (modo === "aplicar" && confirmacao.toLowerCase() !== server.shortName.toLowerCase()) {
    return {
      ok: false,
      mensagem: `Para apagar o mundo inteiro, digite exatamente: ${server.shortName}`,
    };
  }

  return executar({
    actorId,
    server,
    action: "wipe",
    detail: `wipe (${modo})`,
    rodar: () =>
      dispararWorkflow("wipe-mundo.yml", {
        servidor: server.slug,
        modo,
        parar_servidor: String(modo === "aplicar"),
      }),
    sucesso:
      modo === "simular"
        ? "Simulação pedida — confere que o mundo existe, sem mover nada."
        : `Wipe disparado em ${server.shortName}. O servidor vai parar, o mundo atual é movido para backup, e ele sobe do zero. Acompanhe em Ações recentes ou no GitHub.`,
  });
}

/* ------------------------------------------- situação: Pals e bases */

export interface Situacao {
  uid: string;
  nome: string;
  level: number;
  pals: number;
  guild: string | null;
  bases: number;
  atualizado: string;
}

export interface EstadoSituacao extends Estado {
  situacoes?: Situacao[];
}

/** "há 3 h", "há 2 dias" — para o dono saber o quanto o número está velho. */
function desdeQuando(data: Date): string {
  const min = Math.floor((Date.now() - data.getTime()) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * Quantos Pals e quantas bases o jogador tem, para conferir antes e depois de
 * restaurar.
 *
 * Sai do banco, não do save: `players.pal_count` e `guilds.base_count` são
 * alimentados pelo import de 2 em 2 horas. Ler o `Level.sav` aqui não caberia
 * numa função serverless — são 280 MB descomprimidos. Por isso a resposta diz
 * de quando é o número em vez de fingir que é de agora.
 */
export async function consultarSituacao(
  _anterior: EstadoSituacao,
  form: FormData,
): Promise<EstadoSituacao> {
  await exigirModeracao();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const termo = String(form.get("termo") ?? "").trim();

  if (termo.length < 2) {
    return { ok: false, mensagem: "Escreva pelo menos 2 letras do nome." };
  }

  const linhas = (await sql`
    select p.palworld_uid, p.name, p.level, p.pal_count, p.updated_at,
           g.name as guild_name, g.base_count
    from players p
    left join guilds g
      on g.server_slug = p.server_slug and g.guild_id = p.guild_id
    where p.server_slug = ${server.slug}
      and (p.name ilike ${"%" + termo + "%"}
           or replace(lower(p.name), ' ', '') like ${"%" + semEspaco(termo) + "%"})
    order by p.level desc
    limit 12
  `) as {
    palworld_uid: string;
    name: string;
    level: number;
    pal_count: number;
    updated_at: string;
    guild_name: string | null;
    base_count: number | null;
  }[];

  if (linhas.length === 0) {
    return { ok: false, mensagem: `Ninguém com "${termo}" em ${server.shortName}.` };
  }

  return {
    ok: true,
    mensagem: `${linhas.length} encontrado(s).`,
    situacoes: linhas.map((l) => ({
      uid: l.palworld_uid,
      nome: l.name,
      level: l.level,
      pals: l.pal_count,
      guild: l.guild_name,
      bases: l.base_count ?? 0,
      atualizado: desdeQuando(new Date(l.updated_at)),
    })),
  };
}

/* ------------------------------------------------ restaurar jogador */

/**
 * Devolve a um jogador o que o servidor apagou: o save individual dele, os
 * Pals com as caixas, e a base.
 *
 * Os três passos rodam em sequência com o servidor parado UMA vez — subir no
 * meio acorda a limpeza do jogo, que apaga o que ainda está pela metade. Foi
 * assim que 260 Pals do Tenshi se perderam em 05/09/2026. Ver
 * `.github/workflows/restaurar-jogador.yml`.
 *
 * Nenhum nome de arquivo de backup aparece aqui de propósito: o script acha
 * sozinho o backup mais recente que ainda tem o que devolver (`auto`).
 */
export async function dispararRestauracao(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirEnergia();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const modo = String(form.get("modo") ?? "") as "simular" | "aplicar";
  const uid = String(form.get("uid") ?? "").trim().toUpperCase();
  const nome = String(form.get("nome") ?? "").trim();
  const confirmacao = String(form.get("confirmacao") ?? "").trim();
  const semBase = String(form.get("pular_base") ?? "") === "1";

  if (modo !== "simular" && modo !== "aplicar") {
    return { ok: false, mensagem: "Modo inválido." };
  }
  if (!/^[0-9A-F]{32}$/.test(uid)) {
    return { ok: false, mensagem: "Escolha um jogador na lista antes." };
  }
  // Restaurar não apaga nada do jogador, mas derruba o servidor de todo mundo
  // por alguns minutos. A confirmação é por isso, não pelo risco ao alvo.
  if (modo === "aplicar" && confirmacao.toLowerCase() !== nome.toLowerCase()) {
    return { ok: false, mensagem: `Para restaurar, digite o nome do jogador: ${nome}` };
  }

  return executar({
    actorId,
    server,
    action: "restore",
    target: uid,
    detail: `restauração (${modo})${semBase ? " sem base" : ""} de ${nome}`,
    rodar: () =>
      dispararWorkflow("restaurar-jogador.yml", {
        servidor: server.slug,
        uids: uid,
        modo,
        pular_base: String(semBase),
        backup_pals: "auto",
        backup_base: "auto",
      }),
    sucesso:
      modo === "simular"
        ? `Simulação pedida para ${nome} — mostra o que voltaria, sem gravar e sem derrubar ninguém. O resultado sai no GitHub, em uns 5 minutos.`
        : `Restauração de ${nome} disparada. O servidor para, os Pals e a base voltam, e ele sobe sozinho — uns 10 minutos ao todo.`,
  });
}

/* ------------------------------------------- conferir as bags da guild */

/**
 * Confere, membro a membro, se o inventário de cada jogador de uma guild
 * ainda está ligado aos containers do mundo.
 *
 * Existe porque em 05/09/2026 o jogo recriou os seis containers de item do
 * Tenshi com GUIDs novos e vazios — a bag não sumiu, se desligou. Quem
 * reclama é um; quem foi atingido pode ser a guild inteira, e ninguém
 * descobre isso esperando cada um reparar na falta.
 *
 * Só lê: não para o servidor, não grava nada. Por isso basta permissão de
 * moderação, e não a de energia que as restaurações exigem.
 */
export async function dispararSondagemBags(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirModeracao();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const guilda = String(form.get("guilda") ?? "").trim();
  const uid = String(form.get("uid") ?? "").trim().toUpperCase();

  // Sem guild (jogador solo) ainda dá para conferir só ele pelo uid.
  if (!guilda && !/^[0-9A-F]{32}$/.test(uid)) {
    return { ok: false, mensagem: "Escolha um jogador na lista antes." };
  }

  return executar({
    actorId,
    server,
    action: "probe",
    target: uid || undefined,
    detail: guilda ? `conferir bags da guild ${guilda}` : "conferir bag do jogador",
    rodar: () =>
      dispararWorkflow("sondar-inventario.yml", {
        servidor: server.slug,
        uids: guilda ? "" : uid,
        guildas: guilda,
        containers: "",
        detalhar: "false",
        // Só o save vivo: é o que responde "está ligado ou não". Vasculhar
        // backups multiplica o tempo por membro e não muda a resposta.
        limite: "0",
        arquivos: "",
      }),
    sucesso: guilda
      ? `Conferência das bags da guild ${guilda} pedida — só leitura, ninguém é derrubado. O resultado sai no GitHub em uns 3 minutos, com um RESUMO de quem está com container zerado.`
      : "Conferência da bag pedida — só leitura. O resultado sai no GitHub em uns 3 minutos.",
  });
}

/* ------------------------------------------------ devolver a bag */

/**
 * Devolve os itens de um jogador cuja bag se desligou.
 *
 * Separado da restauração de Pals porque é um conserto de outra natureza: em
 * vez de trazer objetos que sumiram, religa conteúdo que continuou existindo
 * nos backups sob GUIDs antigos. Ver `tools/restaurar_itens.py`.
 *
 * O que o jogador juntou desde a perda é somado nas pilhas que voltam — nada
 * dele é jogado fora sem aviso.
 */
export async function dispararRestauracaoBag(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirEnergia();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const modo = String(form.get("modo") ?? "") as "simular" | "aplicar";
  const uid = String(form.get("uid") ?? "").trim().toUpperCase();
  const nome = String(form.get("nome") ?? "").trim();
  const confirmacao = String(form.get("confirmacao") ?? "").trim();

  if (modo !== "simular" && modo !== "aplicar") {
    return { ok: false, mensagem: "Modo inválido." };
  }
  if (!/^[0-9A-F]{32}$/.test(uid)) {
    return { ok: false, mensagem: "Escolha um jogador na lista antes." };
  }
  if (modo === "aplicar" && confirmacao.toLowerCase() !== nome.toLowerCase()) {
    return { ok: false, mensagem: `Para devolver a bag, digite o nome do jogador: ${nome}` };
  }

  return executar({
    actorId,
    server,
    action: "restore",
    target: uid,
    detail: `bag (${modo}) de ${nome}`,
    rodar: () =>
      dispararWorkflow("restaurar-itens.yml", {
        servidor: server.slug,
        uids: uid,
        backup: "auto",
        sobrescrever: "false",
        modo,
      }),
    sucesso:
      modo === "simular"
        ? `Simulação pedida para ${nome} — lista item por item o que voltaria, sem gravar e sem derrubar ninguém. O resultado sai no GitHub.`
        : `Devolução da bag de ${nome} disparada. O servidor para, os itens voltam, e ele sobe sozinho.`,
  });
}

/* -------------------------------------------------- reverter o save */

/**
 * Devolve o `Level.sav` ao backup mais recente e sobe o servidor.
 *
 * É a saída de emergência para quando uma gravação deixa o servidor sem subir
 * — aconteceu em 05/09/2026, e a volta teve de ser feita à mão, arquivo por
 * arquivo, com o servidor no chão.
 *
 * ⚠️ Isto desfaz TUDO desde aquele backup, para todo mundo: o que os
 * jogadores fizeram depois some junto. Só faz sentido com o servidor já
 * quebrado.
 */
export async function dispararReversao(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirEnergia();
  const server = servidorOuFalha(String(form.get("servidor") ?? ""));
  const modo = String(form.get("modo") ?? "") as "listar" | "aplicar";
  const confirmacao = String(form.get("confirmacao") ?? "").trim();

  if (modo !== "listar" && modo !== "aplicar") {
    return { ok: false, mensagem: "Modo inválido." };
  }
  if (modo === "aplicar" && confirmacao.toUpperCase() !== "REVERTER") {
    return { ok: false, mensagem: "Para voltar o mundo, digite REVERTER." };
  }

  return executar({
    actorId,
    server,
    action: "revert",
    detail: `reversão (${modo})`,
    rodar: () =>
      dispararWorkflow("reverter-save.yml", {
        servidor: server.slug,
        backup: "",
        modo,
        religar: "true",
      }),
    sucesso:
      modo === "listar"
        ? "Lista dos backups pedida — nada é alterado. O resultado sai no GitHub."
        : `Reversão disparada em ${server.shortName}. O mundo volta ao último backup e o servidor sobe sozinho.`,
  });
}

/* ------------------------------------------------ fila de restauração paga */

/**
 * Cancela um pedido travado em `fila` — para quando o dono não quer esperar
 * a próxima janela de manutenção, ou o pedido não faz mais sentido. Estorna
 * sozinho, se tiver cobrado. Ver `cancelarPedidoAdmin` em `lib/resgate-base.ts`.
 *
 * Usa `exigirEnergia` (cúpula) porque mexe na carteira de outra pessoa —
 * mesmo padrão de `canManageEconomy`.
 */
export async function cancelarPedidoDeFila(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirEnergia();
  const id = Number(form.get("id"));
  const servidor = String(form.get("servidor") ?? "");
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, mensagem: "Pedido inválido." };
  }
  const server = servidorOuFalha(servidor);

  const r = await cancelarPedidoAdmin(id);
  await registrar({
    actorId,
    serverSlug: server.slug,
    action: "restore_queue",
    target: String(id),
    detail: "cancelado pelo admin",
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  if (r.ok) {
    await logarNoDiscord(
      `🛠️ **${server.shortName}** · Fila de restauração · \`${id}\` — <@${actorId}>\n> ${r.mensagem}`,
    );
  }
  revalidatePath("/admin/moderacao");
  return r;
}

/**
 * Devolve as Paletas de um pedido pago que virou `recusado` — o gap deixado
 * em aberto pela fase 2: `processar_fila.py` recusa sem mexer na carteira.
 */
export async function estornarPedidoDeFila(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirEnergia();
  const id = Number(form.get("id"));
  const servidor = String(form.get("servidor") ?? "");
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, mensagem: "Pedido inválido." };
  }
  const server = servidorOuFalha(servidor);

  const r = await estornarPedidoRecusado(id, actorId);
  await registrar({
    actorId,
    serverSlug: server.slug,
    action: "restore_queue",
    target: String(id),
    detail: "estorno de pedido recusado",
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  if (r.ok) {
    await logarNoDiscord(
      `🛠️ **${server.shortName}** · Fila de restauração · \`${id}\` — <@${actorId}>\n> ${r.mensagem}`,
    );
  }
  revalidatePath("/admin/moderacao");
  return r;
}

/* --------------------------------------------------------- entregar Pal */

export interface EstadoEntrega extends Estado {
  transferIds?: number[];
}

export async function acaoEntregarPal(
  _anterior: EstadoEntrega,
  form: FormData,
): Promise<EstadoEntrega> {
  const actorId = await exigirEnergia();
  const discordIdDestino = String(form.get("discordId") ?? "").trim();
  const json = String(form.get("json") ?? "");
  const quantidade = Number(form.get("quantidade") ?? 1);
  if (!discordIdDestino) {
    return { ok: false, mensagem: "Informe o Discord ID do jogador." };
  }

  let palId = "";
  try {
    palId = String((JSON.parse(json) as { PalID?: unknown }).PalID ?? "");
  } catch {
    // JSON inválido — `entregarPalPorJson` recusa e explica; o log só perde o PalID.
  }

  const r = await entregarPalPorJson(discordIdDestino, json, quantidade);

  // Sem `server` fixo aqui (a entrega vai para o servidor do vínculo do
  // destino, não do seletor do topo) — mesmo motivo de `cancelarPedidoDeFila`
  // não passar por `executar()`. É a única ação econômica "de graça" do
  // painel (cria valor do nada; resgates só devolvem o que já existia) e
  // ficava sem log e sem eco no Discord, ao contrário de todo o resto da
  // página — corrigido aqui.
  await registrar({
    actorId,
    serverSlug: "-",
    action: "deliver_pal",
    target: discordIdDestino,
    detail: `${palId || "PalID desconhecido"} × ${quantidade}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  if (r.ok) {
    await logarNoDiscord(
      `🛠️ Entrega de Pal manual · \`${palId || "?"}\` × ${quantidade} — <@${actorId}> → <@${discordIdDestino}>\n> ${r.mensagem}`,
    );
  }
  revalidatePath("/admin/moderacao");
  return r;
}

export async function acaoConsultarEntregaPal(
  transferId: number,
): Promise<{ status: string; detail: string; palId: string } | null> {
  return continuarEntregaAdmin(transferId);
}

// "Entregar itens manual" mudou de casa em 21/09/2026 — agora mora em
// app/admin/entregar-itens (página própria, pedido do dono), ao lado dos
// kits de prêmio que reusam o mesmo motor (`lib/admin-entregar-itens.ts`).
