import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { meuVinculo } from "@/lib/linking";
import { serverBySlug } from "@/lib/servers";
import { getPals, getPal, ForaDoJogo, type PalCru } from "@/lib/palworld/paldefender";
import { delPal, givePalTemplate } from "@/lib/palworld/rcon";
import { paraTemplate, candidatosDeFiltro, nomeDoArquivo } from "@/lib/pal-template";
import { dispararWorkflow } from "@/lib/github";
import { ondeEstouOnline, type PersonagemOnline } from "@/lib/cofre";
import { isStaff, levelOf, slotsGratisDoCofre } from "@/lib/roles";
import { precoDoSlot } from "@/lib/cofre-regras";
import { lancar } from "@/lib/economia";

/**
 * O cofre de Pals, e a entrega em duas fases (§7.3 do PROMPT.md).
 *
 * A metade que **lê e retira** é idêntica em espírito ao cofre de item: tudo
 * roda da Vercel, síncrono, com `deletepals` por RCON. A metade que
 * **entrega** não é — `givepal_j` só aceita o nome de um arquivo que já
 * precisa existir no servidor, e escrever esse arquivo é SFTP, que a Vercel
 * não fala. Por isso o resgate de Pal tem uma parada no meio:
 *
 * ```
 * clicar "resgatar"
 *   → grava a intenção (pal_transfers: aguardando_arquivo)
 *   → dispara o GitHub Actions (escreve o arquivo por SFTP)
 *   → [a página fica de olho, com `continuarResgate`]
 *   → arquivo pronto → a Vercel chama givepal_j por RCON
 *   → concluído
 * ```
 *
 * ⚠️ **Isto ainda não foi testado contra o jogo de verdade.** As duas metades
 * foram testadas por si — `deletepals`/`givepal_j` respondem no formato
 * esperado (§7.3), e o script Python foi revisado linha a linha contra o
 * SFTP de `tools/import_save.py` — mas o caminho inteiro, incluindo o
 * GitHub Actions escrevendo de verdade num servidor, ainda não rodou.
 */

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/**
 * Migração 006 — guardar e resgatar de volta repetidas vezes, escolhendo um
 * servidor diferente a cada resgate, inflava contadores de captura do jogo
 * sem o jogador ter capturado nada de novo. A trava: um Pal guardado só
 * resgata no mesmo servidor de onde saiu (`vault_pals.server_slug`), e só
 * depois deste tempo mínimo dentro do cofre.
 */
export const COOLDOWN_RESGATE_HORAS = 3;

/* ------------------------------------------------------------------ leitura */

export interface PalNoCofre {
  id: number;
  palId: string;
  template: Record<string, unknown>;
  desde: string;
  /** De qual servidor este Pal saiu — nulo para Pal de antes da migração 006. */
  serverSlug: string | null;
  serverNome: string | null;
}

interface LinhaVaultPal {
  id: number;
  pal_id: string;
  template: Record<string, unknown>;
  imported_at: string;
  server_slug: string | null;
}

const paraPalNoCofre = (r: LinhaVaultPal): PalNoCofre => ({
  id: r.id,
  palId: r.pal_id,
  template: r.template,
  desde: r.imported_at,
  serverSlug: r.server_slug,
  serverNome: r.server_slug ? serverBySlug(r.server_slug)?.shortName ?? r.server_slug : null,
});

export interface EstadoDoCofreDePals {
  pals: PalNoCofre[];
  usados: number;
  total: number;
  precoDoProximo: number;
}

export async function meuCofreDePals(
  discordId: string,
  roles: string[],
): Promise<EstadoDoCofreDePals> {
  const [rows, extras] = await Promise.all([
    sql`
      select id, pal_id, template, imported_at, server_slug
      from vault_pals
      where discord_id = ${discordId}
      order by imported_at desc
    ` as unknown as Promise<LinhaVaultPal[]>,
    // Mesmo esquema do cofre de item: slot comprado é uma linha do extrato,
    // só que de origem "slotPal" — as duas contagens não se misturam.
    sql`
      select count(*)::int as n
      from ledger
      where discord_id = ${discordId} and kind = 'slotPal'
    ` as unknown as Promise<{ n: number }[]>,
  ]);

  const pals = rows.map(paraPalNoCofre);
  const gratis = slotsGratisDoCofre(roles);
  const total = gratis + (extras[0]?.n ?? 0);
  return {
    pals,
    usados: pals.length,
    total,
    precoDoProximo: precoDoSlot(total + 1, gratis),
  };
}

/** Quantos Pals a pessoa tem guardados — o mercado checa antes de entregar. */
export async function cofreDePalsCheio(
  discordId: string,
  roles: string[],
): Promise<boolean> {
  const c = await meuCofreDePals(discordId, roles);
  return c.usados >= c.total;
}

/**
 * Compra o próximo slot de Pal — mesmo mecanismo do slot de item
 * (`comprarSlot` em `lib/cofre.ts`), preço e sink incluídos.
 */
export async function comprarSlotDePal(
  discordId: string,
  roles: string[],
): Promise<Resultado> {
  const cofre = await meuCofreDePals(discordId, roles);
  const numero = cofre.total + 1;
  const preco = precoDoSlot(numero, slotsGratisDoCofre(roles));

  const r = await lancar({
    discordId,
    delta: -preco,
    origem: "slotPal",
    descricao: `Slot ${numero} do cofre de Pals`,
    refId: String(numero),
    chave: `slotPal:${discordId}:${numero}`,
  });

  if (r.status === "sem-saldo") {
    return {
      ok: false,
      mensagem: `O slot ${numero} custa ${preco} Paletas e você tem ${r.saldo}.`,
    };
  }
  if (r.status === "repetido") {
    return { ok: false, mensagem: "Esse slot já foi comprado." };
  }
  return {
    ok: true,
    mensagem: `Slot ${numero} liberado por ${preco} Paletas. Saldo: ${r.saldo}.`,
  };
}

export async function palDoCofre(
  discordId: string,
  id: number,
): Promise<PalNoCofre | null> {
  const rows = (await sql`
    select id, pal_id, template, imported_at, server_slug
    from vault_pals
    where id = ${id} and discord_id = ${discordId}
  `) as LinhaVaultPal[];
  const r = rows[0];
  return r ? paraPalNoCofre(r) : null;
}

export interface PalDisponivel {
  instanceId: string;
  palId: string;
  nickname: string;
  level: number;
  gender: string;
  shiny: boolean;
  /**
   * `CondensedPals` nunca é escrito pelo `givepal_j` — sempre volta 0, e não
   * existe comando de condensar Pal em lugar nenhum do PalDefender. As
   * estrelas de rank que o jogo mostra na tela vêm de `PartnerSkillLevel`
   * (teto real 5), achado confirmado em 14/09/2026.
   */
  partnerSkillLevel: number;
  ivs: Record<string, number>;
  passives: string[];
}

/** Os Pals do time e da palbox, prontos para escolher qual guardar. */
export async function palsNoJogo(
  discordId: string,
  serverSlug: string,
): Promise<{ pals: PalDisponivel[]; erro: string }> {
  const vinculo = await meuVinculo(discordId);
  const server = serverBySlug(serverSlug);
  if (!vinculo || !server) {
    return { pals: [], erro: "Vincule seu personagem primeiro." };
  }

  try {
    const lista = await getPals(server, vinculo.uid);
    return {
      pals: lista.map(({ instanceId, pal }) => ({
        instanceId,
        palId: String(pal.PalID ?? ""),
        nickname: String(pal.Nickname ?? ""),
        level: Number(pal.Level ?? 1),
        gender: String(pal.Gender ?? "Male"),
        shiny: pal.Shiny === true,
        partnerSkillLevel: Number(pal.PartnerSkillLevel ?? 0),
        ivs: (pal.IVs as Record<string, number>) ?? {},
        passives: Array.isArray(pal.Passives) ? (pal.Passives as string[]) : [],
      })),
      erro: "",
    };
  } catch (e) {
    if (e instanceof ForaDoJogo) {
      return {
        pals: [],
        erro: "Você precisa estar com o jogo aberto nesse servidor para o site enxergar seus Pals.",
      };
    }
    return {
      pals: [],
      erro: "Não consegui falar com o servidor agora. Tente de novo em instantes.",
    };
  }
}

/* -------------------------------------------------------------- importar */

/**
 * Jogo → cofre, síncrono — igual ao item, com uma ressalva sobre o filtro:
 * ver `filtroDeExclusao` em `lib/pal-template.ts`.
 */
export async function importarPalParaCofre(
  serverSlug: string,
  instanceId: string,
): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  const vinculo = await meuVinculo(discordId);
  if (!vinculo) {
    return { ok: false, mensagem: "Vincule seu personagem antes de usar o cofre." };
  }
  const server = serverBySlug(serverSlug);
  if (!server?.rconPort) {
    return { ok: false, mensagem: "Esse servidor não move Pal agora." };
  }

  // 1. Ler o Pal na fonte — nunca confiar no que o navegador mandou.
  let pal: PalCru | null;
  try {
    pal = await getPal(server, vinculo.uid, instanceId);
  } catch (e) {
    return {
      ok: false,
      mensagem:
        e instanceof ForaDoJogo
          ? "Você precisa estar no jogo nesse servidor para guardar Pal."
          : "Não consegui ler seus Pals agora. Tente de novo em instantes.",
    };
  }
  if (!pal) {
    return {
      ok: false,
      mensagem: "Esse Pal não está mais com você. Recarregue a página.",
    };
  }

  // 2. O slot só é checado aqui — cofre cheio não pode nem começar a mexer
  //    no jogo. Mesma disciplina do cofre de item.
  const cofre = await meuCofreDePals(discordId, session.user.roles);
  if (cofre.usados >= cofre.total) {
    return {
      ok: false,
      mensagem: `Seu cofre de Pals está cheio (${cofre.usados}/${cofre.total}). Compre um slot ou resgate algo primeiro.`,
    };
  }

  const template = paraTemplate(pal);
  const candidatos = candidatosDeFiltro(pal);

  // 3. Registro de intenção ANTES de tocar no jogo — mesma disciplina do
  //    cofre de item (`vault_transfers`).
  const [{ id: transferId }] = (await sql`
    insert into pal_transfers
      (discord_id, server_slug, palworld_uid, template, direction, status)
    values (${discordId}, ${serverSlug}, ${vinculo.uid}, ${JSON.stringify(template)},
            'importar', 'andando')
    returning id
  `) as { id: number }[];

  // 🔧 Bissecção temporária — ver `candidatosDeFiltro`. Tenta do mais
  // específico pro mais genérico e para no primeiro que apagar de verdade.
  let resposta: { ok: boolean; resposta: string } | undefined;
  const tentativas: string[] = [];
  try {
    for (let i = 0; i < candidatos.length; i++) {
      resposta = await delPal(server, vinculo.uid, candidatos[i]);
      tentativas.push(`#${i}(${candidatos[i].replace(/^ID \S+ /, "")}): ${resposta.resposta}`);
      if (resposta.ok) break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`
      update pal_transfers set status = 'andando', detail = ${`sem resposta: ${[...tentativas, msg].join(" | ")}`.slice(0, 500)}
      where id = ${transferId}
    `;
    return {
      ok: false,
      mensagem:
        "O servidor não respondeu. Confira seus Pals no jogo antes de tentar de novo — o registro ficou aberto para a administração conferir.",
    };
  }

  if (!resposta?.ok) {
    await sql`
      update pal_transfers set status = 'falhou', detail = ${tentativas.join(" | ").slice(0, 500)}, finished_at = now()
      where id = ${transferId}
    `;
    return { ok: false, mensagem: "O jogo recusou a retirada. Nada foi movido." };
  }

  // 4. O jogo já deletou de verdade — isto não tem mais volta. Se a gravação
  //    no cofre falhar daqui pra frente, o Pal não pode simplesmente
  //    desaparecer: marca um status próprio (não 'andando', que pareceria
  //    uma transferência normal em andamento) para a administração achar e
  //    recuperar na mão a partir do `template` já salvo em `pal_transfers`.
  try {
    await sql`
      insert into vault_pals (discord_id, pal_id, template, server_slug)
      values (${discordId}, ${template.PalID}, ${JSON.stringify(template)}, ${serverSlug})
    `;
    await sql`
      update pal_transfers set status = 'concluido', detail = ${tentativas.join(" | ").slice(0, 500)}, finished_at = now()
      where id = ${transferId}
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await sql`
        update pal_transfers set status = 'preso_sem_cofre', detail = ${`saiu do jogo mas não gravou no cofre: ${msg}`.slice(0, 500)}
        where id = ${transferId}
      `;
    } catch {
      // Nem isso — fica em 'andando' mesmo, mas o `template` já está salvo
      // ali dentro para recuperação manual.
    }
    return {
      ok: false,
      mensagem:
        "Seu Pal saiu do jogo, mas não consegui confirmar no cofre. Fale com a administração — o registro ficou salvo para recuperação manual.",
    };
  }

  return { ok: true, mensagem: `${template.PalID} guardado no cofre.` };
}

/* --------------------------------------------------------------- resgatar */

/**
 * Passo 1 do resgate: tira do cofre e manda o GitHub Actions escrever o
 * arquivo. Devolve o id da transferência para a página acompanhar.
 */
export async function iniciarResgateDePal(
  vaultPalId: number,
  serverSlug: string,
): Promise<Resultado & { transferId?: number }> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  const discordId = session.user.discordId;

  const vinculo = await meuVinculo(discordId);
  if (!vinculo) return { ok: false, mensagem: "Vincule seu personagem primeiro." };

  const server = serverBySlug(serverSlug);
  if (!server?.rconPort) {
    return { ok: false, mensagem: "Esse servidor não recebe Pal agora." };
  }

  // Lê antes de debitar: precisa saber se este Pal pode voltar para ESTE
  // servidor e se já passou o tempo mínimo guardado (migração 006) — fazer
  // isso já dentro do `delete` deixaria a mensagem de erro sem dizer qual
  // das duas travas pegou.
  const linha = (await sql`
    select pal_id, template, server_slug, imported_at,
           imported_at <= now() - (interval '1 hour' * ${COOLDOWN_RESGATE_HORAS}) as maduro
    from vault_pals
    where id = ${vaultPalId} and discord_id = ${discordId}
  `) as {
    pal_id: string;
    template: Record<string, unknown>;
    server_slug: string | null;
    imported_at: string;
    maduro: boolean;
  }[];
  const achado = linha[0];
  if (!achado) {
    return { ok: false, mensagem: "Esse Pal não está mais no seu cofre." };
  }
  if (achado.server_slug && achado.server_slug !== serverSlug) {
    const nomeOrigem = serverBySlug(achado.server_slug)?.shortName ?? achado.server_slug;
    return {
      ok: false,
      mensagem: `Esse Pal só pode ser resgatado no ${nomeOrigem} — foi guardado lá.`,
    };
  }
  if (!achado.maduro) {
    const libera = new Date(achado.imported_at).getTime() + COOLDOWN_RESGATE_HORAS * 3_600_000;
    const faltam = Math.max(1, Math.ceil((libera - Date.now()) / 3_600_000));
    return {
      ok: false,
      mensagem: `Ainda não — esse Pal libera para resgate em cerca de ${faltam}h.`,
    };
  }

  // Debita já, para dois cliques não resgatarem o mesmo Pal duas vezes. As
  // mesmas condições da leitura acima entram no `where` para a checagem não
  // virar uma corrida com este delete.
  const debitado = (await sql`
    delete from vault_pals
    where id = ${vaultPalId} and discord_id = ${discordId}
      and (server_slug is null or server_slug = ${serverSlug})
      and imported_at <= now() - (interval '1 hour' * ${COOLDOWN_RESGATE_HORAS})
    returning pal_id, template, server_slug, imported_at
  `) as { pal_id: string; template: Record<string, unknown>; server_slug: string | null; imported_at: string }[];

  if (!debitado.length) {
    return { ok: false, mensagem: "Esse Pal não está mais no seu cofre." };
  }
  const { pal_id: palId, template, server_slug: origemSlug, imported_at: origemDesde } = debitado[0];

  const [{ id: transferId }] = (await sql`
    insert into pal_transfers
      (discord_id, server_slug, palworld_uid, template, direction, status, arquivo)
    values (${discordId}, ${serverSlug}, ${vinculo.uid}, ${JSON.stringify(template)},
            'resgatar', 'aguardando_arquivo', '')
    returning id
  `) as { id: number }[];

  const arquivo = nomeDoArquivo(transferId);
  await sql`update pal_transfers set arquivo = ${arquivo} where id = ${transferId}`;

  try {
    await dispararWorkflow("deliver-pal-template.yml", {
      transfer_id: String(transferId),
      modo: "aplicar",
    });
  } catch (e) {
    // Não foi possível nem começar: devolve o Pal ao cofre, nada ficou pelo
    // meio do caminho. Preserva servidor de origem e data de entrada — essa
    // falha é técnica, não motivo para resetar a trava de cooldown.
    await sql`
      insert into vault_pals (discord_id, pal_id, template, server_slug, imported_at)
      values (${discordId}, ${palId}, ${JSON.stringify(template)}, ${origemSlug}, ${origemDesde})
    `;
    await sql`update pal_transfers set status = 'falhou', detail = ${(e instanceof Error ? e.message : String(e)).slice(0, 500)}, finished_at = now() where id = ${transferId}`;
    return {
      ok: false,
      mensagem: "Não consegui iniciar a entrega agora. Seu Pal continua no cofre.",
    };
  }

  return {
    ok: true,
    mensagem: `Preparando a entrega de ${palId}…`,
    transferId,
  };
}

export interface StatusResgate {
  status: string;
  detail: string;
  palId: string;
}

export interface ResgatePendente {
  transferId: number;
  palId: string;
}

/**
 * Resgates que ficaram pelo meio do caminho — a pessoa fechou a aba (ou a
 * internet caiu) antes do `Acompanhar` no navegador terminar o polling.
 *
 * Sem isso, uma transferência parada em `aguardando_arquivo`/`arquivo_pronto`
 * fica presa para sempre: o Pal já saiu do `vault_pals` mas o `givepal_j`
 * nunca é chamado. A página do cofre usa isto para retomar o acompanhamento
 * sozinha ao carregar.
 */
export async function meusResgatesPendentes(
  discordId: string,
): Promise<ResgatePendente[]> {
  const rows = (await sql`
    select id, template->>'PalID' as pal_id
    from pal_transfers
    where discord_id = ${discordId}
      and direction = 'resgatar'
      and status in ('aguardando_arquivo', 'arquivo_pronto')
    order by created_at desc
  `) as { id: number; pal_id: string }[];

  return rows.map((r) => ({ transferId: r.id, palId: r.pal_id }));
}

/** O estado de uma transferência — para a página que fica de olho nela. */
export async function statusDoResgate(
  transferId: number,
  discordId: string,
): Promise<StatusResgate | null> {
  const rows = (await sql`
    select status, detail, template->>'PalID' as pal_id
    from pal_transfers
    where id = ${transferId} and discord_id = ${discordId}
  `) as { status: string; detail: string; pal_id: string }[];
  const r = rows[0];
  return r ? { status: r.status, detail: r.detail, palId: r.pal_id } : null;
}

/**
 * Passo 2 do resgate: chamado quando o arquivo está pronto. Faz o
 * `givepal_j` por RCON, síncrono, e fecha a transferência.
 *
 * Idempotente por construção: só age se o status ainda for
 * `arquivo_pronto`. Chamar de novo depois de `concluido` não repete a
 * entrega — e chamar depois de um RCON sem resposta **também não repete**,
 * de propósito: sem confirmação de que a entrega anterior falhou de
 * verdade, tentar de novo arriscaria dar o Pal duas vezes.
 */
export async function continuarResgate(transferId: number): Promise<StatusResgate | null> {
  const rows = (await sql`
    select discord_id, server_slug, palworld_uid, arquivo, status, template->>'PalID' as pal_id
    from pal_transfers
    where id = ${transferId}
  `) as {
    discord_id: string;
    server_slug: string;
    palworld_uid: string;
    arquivo: string | null;
    status: string;
    pal_id: string;
  }[];
  const t = rows[0];
  if (!t) return null;
  if (t.status !== "arquivo_pronto") {
    return { status: t.status, detail: "", palId: t.pal_id };
  }

  const server = serverBySlug(t.server_slug);
  if (!server?.rconPort || !t.arquivo) {
    return { status: t.status, detail: "", palId: t.pal_id };
  }

  let resposta;
  try {
    resposta = await givePalTemplate(server, t.palworld_uid, t.arquivo);
  } catch (e) {
    // Sem resposta: não sabemos se entregou. Fica em `arquivo_pronto` — não
    // se marca `falhou` aqui, porque isso deixaria alguém tentar de novo e
    // arriscar duplicar o Pal.
    const msg = e instanceof Error ? e.message : String(e);
    await sql`update pal_transfers set detail = ${`RCON sem resposta: ${msg}`.slice(0, 500)} where id = ${transferId}`;
    return { status: "arquivo_pronto", detail: "sem resposta do servidor", palId: t.pal_id };
  }

  if (!resposta.ok) {
    await sql`
      update pal_transfers set status = 'falhou', detail = ${resposta.resposta.slice(0, 500)}, finished_at = now()
      where id = ${transferId} and status = 'arquivo_pronto'
    `;
    return { status: "falhou", detail: resposta.resposta, palId: t.pal_id };
  }

  await sql`
    update pal_transfers set status = 'concluido', detail = ${resposta.resposta.slice(0, 500)}, finished_at = now()
    where id = ${transferId} and status = 'arquivo_pronto'
  `;
  return { status: "concluido", detail: resposta.resposta, palId: t.pal_id };
}

export type { PersonagemOnline };
export { ondeEstouOnline };

/* ------------------------------------------------------- semear para teste */

/**
 * Põe um Pal no cofre **sem passar pelo jogo** — só para staff testar a
 * entrega (§9.2 do HANDOFF).
 *
 * Existe porque a metade que falta validar é justamente a de risco: escrever
 * o arquivo por SFTP e entregar por RCON, de verdade, contra um servidor.
 * Testar isso "importando" primeiro exigiria tirar um Pal de um jogador de
 * carne e osso — desnecessário, quando o que se quer confirmar é só se a
 * ENTREGA funciona. Um editor externo (paldeck.cc/palcreator, que gera o
 * mesmo formato `PalTemplate`) dá um JSON válido sem precisar de ninguém
 * online.
 *
 * O JSON colado passa pelo mesmo `paraTemplate()` que normaliza o que vem
 * da API — então um campo a mais, faltando ou com nome diferente não quebra
 * nem entra sujo: vira exatamente a forma que a entrega espera.
 *
 * 🔒 Só staff. Isso cria Pal do nada, sem retirar de ninguém — mesma
 * classe de poder de um ajuste de saldo (§7.8), e some do cofre assim que
 * for resgatado ou apagado.
 */
export async function semearPalDeTeste(jsonTexto: string): Promise<Resultado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!isStaff(levelOf(session.user.roles, session.user.isMember))) {
    return { ok: false, mensagem: "Só staff pode semear Pal de teste." };
  }

  let cru: unknown;
  try {
    cru = JSON.parse(jsonTexto);
  } catch {
    return { ok: false, mensagem: "Isso não é um JSON válido." };
  }
  if (!cru || typeof cru !== "object" || !("PalID" in cru) || !(cru as { PalID: unknown }).PalID) {
    return { ok: false, mensagem: "Falta o campo PalID no JSON." };
  }

  const template = paraTemplate(cru as PalCru);
  await sql`
    insert into vault_pals (discord_id, pal_id, template)
    values (${session.user.discordId}, ${template.PalID}, ${JSON.stringify(template)})
  `;

  return {
    ok: true,
    mensagem: `${template.PalID} de teste guardado no seu cofre — vá em "No cofre" para resgatar.`,
  };
}
