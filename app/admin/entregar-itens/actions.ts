"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canPowerServer } from "@/lib/roles";
import { registrar } from "@/lib/moderacao";
import { logarNoDiscord } from "@/lib/discord";
import { nomeDoItem } from "@/lib/itens";
import {
  entregarItensParaJogadores,
  type ItemPedido,
  type ResultadoEntrega,
} from "@/lib/admin-entregar-itens";
import {
  criarKitPremio,
  editarKitPremio,
  alternarKitPremio,
  excluirKitPremio,
  entregarKitPremio,
  type ItemDoKitPremio,
} from "@/lib/kits-premio";

export interface Estado {
  ok: boolean;
  mensagem: string;
}

/** Mesmo nível de "Entregar Pal manual" e kits do Mercado — dar item de graça é econômico, não é moderação comum. */
async function exigirCupula(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    throw new Error("Sem permissão");
  }
  return session.user.discordId;
}

/* ------------------------------------------------------------ entrega avulsa */

export interface EstadoEntregaItens extends Estado {
  resultados?: ResultadoEntrega[];
}

/**
 * A versão mascarada do `/giveitems` do jogo — migrado de
 * `app/admin/moderacao` em 21/09/2026 para ter página própria (pedido do
 * dono), agora ao lado dos kits de prêmio que reusam o mesmo motor.
 */
export async function acaoEntregarItens(
  _anterior: EstadoEntregaItens,
  form: FormData,
): Promise<EstadoEntregaItens> {
  const actorId = await exigirCupula();

  let alvos: { discordId: string; nome: string; uid: string; serverSlug: string }[] = [];
  let itens: ItemPedido[] = [];
  try {
    alvos = JSON.parse(String(form.get("alvos") ?? "[]"));
    itens = JSON.parse(String(form.get("itens") ?? "[]"));
  } catch {
    return { ok: false, mensagem: "Formulário corrompido — recarregue a página e tente de novo." };
  }

  const r = await entregarItensParaJogadores(alvos, itens);

  const resumoItens = itens.map((i) => `${nomeDoItem(i.itemId)} ×${i.quantidade}`).join(", ");
  const resumoAlvos = alvos.map((a) => a.nome).join(", ");

  await registrar({
    actorId,
    serverSlug: "-",
    action: "deliver_items",
    target: alvos.map((a) => a.discordId).join(","),
    detail: `${resumoItens || "nenhum item"} → ${resumoAlvos || "ninguém"}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  if (r.resultados.length > 0) {
    await logarNoDiscord(
      `🛠️ Entrega de itens manual · ${resumoItens} — <@${actorId}> → ${alvos
        .map((a) => `<@${a.discordId}>`)
        .join(", ")}\n> ${r.mensagem}`,
    );
  }
  revalidatePath("/admin/entregar-itens");
  return r;
}

/* ------------------------------------------------------------ kits de prêmio */

function lerItens(form: FormData): ItemDoKitPremio[] {
  try {
    const bruto = JSON.parse(String(form.get("itens") ?? "[]")) as ItemDoKitPremio[];
    return bruto.map((i) => ({
      itemId: String(i.itemId ?? ""),
      quantidade: Math.max(1, Math.floor(Number(i.quantidade) || 1)),
    }));
  } catch {
    return [];
  }
}

const resumo = (itens: ItemDoKitPremio[]) =>
  itens.map((i) => `${nomeDoItem(i.itemId)} ×${i.quantidade}`).join(", ");

export async function acaoCriarKitPremio(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirCupula();
  const nome = String(form.get("nome") ?? "");
  const descricao = String(form.get("descricao") ?? "");
  const itens = lerItens(form);

  const r = await criarKitPremio({ nome, descricao, itens });

  await registrar({
    actorId,
    serverSlug: "-",
    action: "kit_premio",
    target: r.id ? String(r.id) : undefined,
    detail: `criou "${nome}" — ${resumo(itens)}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  revalidatePath("/admin/entregar-itens");
  return r;
}

export async function acaoEditarKitPremio(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));
  const nome = String(form.get("nome") ?? "");
  const descricao = String(form.get("descricao") ?? "");
  const itens = lerItens(form);

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, mensagem: "Kit inválido." };
  }

  const r = await editarKitPremio({ id, nome, descricao, itens });

  await registrar({
    actorId,
    serverSlug: "-",
    action: "kit_premio",
    target: String(id),
    detail: `editou "${nome}" — ${resumo(itens)}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  revalidatePath("/admin/entregar-itens");
  return r;
}

export async function acaoAlternarKitPremio(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));
  const ativo = String(form.get("ativo") ?? "") === "1";

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, mensagem: "Kit inválido." };
  }

  const r = await alternarKitPremio(id, ativo);

  await registrar({
    actorId,
    serverSlug: "-",
    action: "kit_premio",
    target: String(id),
    detail: ativo ? "voltou para a lista" : "foi arquivado",
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  revalidatePath("/admin/entregar-itens");
  return r;
}

export async function acaoExcluirKitPremio(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, mensagem: "Kit inválido." };
  }

  const r = await excluirKitPremio(id);

  await registrar({
    actorId,
    serverSlug: "-",
    action: "kit_premio",
    target: String(id),
    detail: r.ok ? `apagou o kit — ${r.mensagem}` : "tentou apagar",
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  revalidatePath("/admin/entregar-itens");
  return r;
}

export interface EstadoEntregaKit extends Estado {
  resultados?: ResultadoEntrega[];
}

/** Entrega um kit de prêmio já salvo — mesmo motor RCON da entrega avulsa. */
export async function acaoEntregarKitPremio(
  _anterior: EstadoEntregaKit,
  form: FormData,
): Promise<EstadoEntregaKit> {
  const actorId = await exigirCupula();
  const kitId = Number(form.get("kitId"));

  let alvos: { discordId: string; nome: string; uid: string; serverSlug: string }[] = [];
  try {
    alvos = JSON.parse(String(form.get("alvos") ?? "[]"));
  } catch {
    return { ok: false, mensagem: "Formulário corrompido — recarregue a página e tente de novo." };
  }

  if (!Number.isInteger(kitId) || kitId <= 0) {
    return { ok: false, mensagem: "Kit inválido." };
  }

  const r = await entregarKitPremio(kitId, alvos);
  const resumoAlvos = alvos.map((a) => a.nome).join(", ");

  await registrar({
    actorId,
    serverSlug: "-",
    action: "deliver_kit_premio",
    target: alvos.map((a) => a.discordId).join(","),
    detail: `kit #${kitId} → ${resumoAlvos || "ninguém"}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  if (r.resultados.length > 0) {
    await logarNoDiscord(
      `🎁 Kit de prêmio entregue — <@${actorId}> → ${alvos
        .map((a) => `<@${a.discordId}>`)
        .join(", ")}\n> ${r.mensagem}`,
    );
  }
  revalidatePath("/admin/entregar-itens");
  return r;
}
