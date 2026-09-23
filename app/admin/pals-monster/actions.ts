"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canPowerServer } from "@/lib/roles";
import { registrar } from "@/lib/moderacao";
import { logarNoDiscord } from "@/lib/discord";
import {
  criarPalMonster,
  editarPalMonster,
  alternarPalMonster,
  excluirPalMonster,
} from "@/lib/pals-monster";

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

function lerDados(form: FormData) {
  return {
    nome: String(form.get("nome") ?? ""),
    descricao: String(form.get("descricao") ?? ""),
    preco: Number(form.get("preco") ?? 0),
    estoque: String(form.get("estoque") ?? ""),
    json: String(form.get("json") ?? ""),
  };
}

const estoqueLegivel = (e: string) => (e.trim() ? `estoque ${e.trim()}` : "estoque ilimitado");

function atualiza() {
  revalidatePath("/admin/pals-monster");
  revalidatePath("/mercado");
}

export async function acaoCriarPalMonster(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirCupula();
  const d = lerDados(form);
  const r = await criarPalMonster(d);
  await registrar({
    actorId,
    serverSlug: "-",
    action: "pal_monster",
    target: r.id ? String(r.id) : undefined,
    detail: `criou "${d.nome}" por ${d.preco} Paletas, ${estoqueLegivel(d.estoque)}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  if (r.ok) {
    await logarNoDiscord(
      `🐉 Pal Monster na vitrine · **${d.nome}** · ${d.preco} Paletas, ${estoqueLegivel(d.estoque)} — <@${actorId}>`,
    );
  }
  atualiza();
  return r;
}

export async function acaoEditarPalMonster(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: "Pal Monster inválido." };
  const d = lerDados(form);
  const r = await editarPalMonster(id, d);
  await registrar({
    actorId,
    serverSlug: "-",
    action: "pal_monster",
    target: String(id),
    detail: `editou "${d.nome}" para ${d.preco} Paletas, ${estoqueLegivel(d.estoque)}`,
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  atualiza();
  return r;
}

export async function acaoAlternarPalMonster(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));
  const ativo = String(form.get("ativo") ?? "") === "1";
  if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: "Pal Monster inválido." };
  const r = await alternarPalMonster(id, ativo);
  await registrar({
    actorId,
    serverSlug: "-",
    action: "pal_monster",
    target: String(id),
    detail: ativo ? "voltou para a vitrine" : "saiu da vitrine",
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  atualiza();
  return r;
}

export async function acaoExcluirPalMonster(_anterior: Estado, form: FormData): Promise<Estado> {
  const actorId = await exigirCupula();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: "Pal Monster inválido." };
  const r = await excluirPalMonster(id);
  await registrar({
    actorId,
    serverSlug: "-",
    action: "pal_monster",
    target: String(id),
    detail: r.ok ? `apagou — ${r.mensagem}` : "tentou apagar",
    ok: r.ok,
    error: r.ok ? undefined : r.mensagem,
  });
  atualiza();
  return r;
}
