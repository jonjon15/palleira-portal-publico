"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canPowerServer } from "@/lib/roles";
import { registrar } from "@/lib/moderacao";
import { logarNoDiscord } from "@/lib/discord";
import { nomeDoItem } from "@/lib/itens";
import {
  criarKit,
  editarKit,
  alternarKit,
  excluirKit,
  type ItemDoKit,
} from "@/lib/kits";

export interface Estado {
  ok: boolean;
  mensagem: string;
}

async function exigirCupula(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    throw new Error("Sem permissão");
  }
  return session.user.discordId;
}

function lerItens(form: FormData): ItemDoKit[] {
  try {
    const bruto = JSON.parse(String(form.get("itens") ?? "[]")) as ItemDoKit[];
    return bruto.map((i) => ({
      itemId: String(i.itemId ?? ""),
      quantidade: Math.max(1, Math.floor(Number(i.quantidade) || 1)),
    }));
  } catch {
    return [];
  }
}

const resumo = (itens: ItemDoKit[]) =>
  itens.map((i) => `${nomeDoItem(i.itemId)} ×${i.quantidade}`).join(", ");

export async function acaoCriarKit(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirCupula();
  const nome = String(form.get("nome") ?? "");
  const descricao = String(form.get("descricao") ?? "");
  const preco = Number(form.get("preco") ?? 0);
  const itens = lerItens(form);

  const r = await criarKit({ nome, descricao, preco, itens });

  await registrar({
    actorId,
    serverSlug: "-",
    action: "kit",
    target: r.id ? String(r.id) : undefined,
    detail: `criou "${nome}" por ${preco} Paletas — ${resumo(itens)}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  if (r.ok) {
    await logarNoDiscord(
      `🧰 Kit criado · **${nome}** · ${preco} Paletas — <@${actorId}>\n> ${resumo(itens)}`,
    );
  }
  revalidatePath("/admin/kits");
  revalidatePath("/mercado");
  return r;
}

export async function acaoEditarKit(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));
  const nome = String(form.get("nome") ?? "");
  const descricao = String(form.get("descricao") ?? "");
  const preco = Number(form.get("preco") ?? 0);
  const itens = lerItens(form);

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, mensagem: "Kit inválido." };
  }

  const r = await editarKit({ id, nome, descricao, preco, itens });

  await registrar({
    actorId,
    serverSlug: "-",
    action: "kit",
    target: String(id),
    detail: `editou "${nome}" para ${preco} Paletas — ${resumo(itens)}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  revalidatePath("/admin/kits");
  revalidatePath("/mercado");
  return r;
}

export async function acaoAlternarKit(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));
  const ativo = String(form.get("ativo") ?? "") === "1";

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, mensagem: "Kit inválido." };
  }

  const r = await alternarKit(id, ativo);

  await registrar({
    actorId,
    serverSlug: "-",
    action: "kit",
    target: String(id),
    detail: ativo ? "voltou para a vitrine" : "saiu da vitrine",
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  revalidatePath("/admin/kits");
  revalidatePath("/mercado");
  return r;
}

/**
 * Apagar de vez. Só passa se o kit nunca foi comprado — a trava mora em
 * `excluirKit`, perto do banco, e não aqui.
 */
export async function acaoExcluirKit(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, mensagem: "Kit inválido." };
  }

  const r = await excluirKit(id);

  // Auditado mesmo dando certo: apagar é a única ação daqui que não deixa
  // rastro na própria tabela, então o log é o único lugar onde o kit
  // apagado continua existindo.
  await registrar({
    actorId,
    serverSlug: "-",
    action: "kit",
    target: String(id),
    detail: r.ok ? `apagou o kit — ${r.mensagem}` : "tentou apagar",
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  if (r.ok) {
    await logarNoDiscord(`🗑️ Kit apagado · ${r.mensagem} — <@${actorId}>`);
  }
  revalidatePath("/admin/kits");
  revalidatePath("/mercado");
  return r;
}
