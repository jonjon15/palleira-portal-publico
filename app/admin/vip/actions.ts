"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canManageEconomy } from "@/lib/roles";
import { registrar } from "@/lib/moderacao";
import { salvarTag, salvarPlano, reentregar } from "@/lib/vip";
import { salvarConfigBooster } from "@/lib/booster";

export interface Estado {
  ok: boolean;
  mensagem: string;
}

async function exigirCupula(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  if (!canManageEconomy(levelOf(session.user.roles, session.user.isMember))) {
    throw new Error("Sem permissão");
  }
  return session.user.discordId;
}

function atualiza() {
  revalidatePath("/admin/vip");
  revalidatePath("/vip");
}

export async function acaoSalvarTag(_a: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirCupula();
  const tag = String(form.get("tag") ?? "");
  const r = await salvarTag(tag);
  await registrar({
    actorId, serverSlug: "-", action: "vip", detail: `InfiniteTag: "${tag.trim()}"`,
    ok: r.ok, error: r.ok ? undefined : r.mensagem,
  });
  atualiza();
  return r;
}

export async function acaoSalvarPlano(_a: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirCupula();
  const key = String(form.get("key") ?? "");
  const nome = String(form.get("nome") ?? "");
  const precoReais = Number(String(form.get("preco") ?? "").replace(",", "."));
  const paletasNoMes = Number(form.get("paletas") ?? 0);
  const beneficios = String(form.get("beneficios") ?? "").split(/\r?\n/);
  let itens: { itemId: string; quantidade: number }[];
  try {
    const bruto = JSON.parse(String(form.get("itens") ?? "[]"));
    if (!Array.isArray(bruto)) throw new Error();
    itens = bruto.map((i) => ({ itemId: String(i?.itemId ?? ""), quantidade: Number(i?.quantidade) }));
  } catch {
    return { ok: false, mensagem: "A lista de itens chegou quebrada. Recarregue a página." };
  }
  const r = await salvarPlano({
    key, nome, precoReais, paletasNoMes, beneficios, itens,
    boosters: Number(form.get("boosters") ?? 0),
    destaque: form.get("destaque") === "1",
    ativo: form.get("ativo") === "1",
  });
  await registrar({
    actorId, serverSlug: "-", action: "vip", target: key,
    detail: `editou ${nome}: R$ ${precoReais}, ${paletasNoMes} Paletas, ${itens.length} itens do jogo`,
    ok: r.ok, error: r.ok ? undefined : r.mensagem,
  });
  atualiza();
  return r;
}

export async function acaoSalvarBooster(_a: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirCupula();
  const precoReais = Number(String(form.get("preco") ?? "").replace(",", "."));
  const multiplicador = Number(String(form.get("multiplicador") ?? "").replace(",", "."));
  const ativo = form.get("ativo") === "1";
  const r = await salvarConfigBooster({ precoReais, multiplicador, ativo });
  await registrar({
    actorId, serverSlug: "-", action: "vip", target: "booster",
    detail: `booster: R$ ${precoReais}, ${multiplicador}x, ${ativo ? "ligado" : "desligado"}`,
    ok: r.ok, error: r.ok ? undefined : r.mensagem,
  });
  atualiza();
  return r;
}

export async function acaoReentregar(_a: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: "Doação inválida." };
  const r = await reentregar(id);
  await registrar({
    actorId, serverSlug: "-", action: "vip", target: String(id),
    detail: "tentou entregar de novo", ok: r.ok, error: r.ok ? undefined : r.mensagem,
  });
  atualiza();
  return r;
}
