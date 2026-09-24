"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { iniciarDoacao, minhaDoacao, resgatarItensVip, type StatusDaDoacao } from "@/lib/vip";

export interface Estado {
  ok: boolean;
  mensagem: string;
}

/**
 * Abre o checkout da InfinitePay. Sessão, aceite e plano são conferidos em
 * `iniciarDoacao`, não aqui — arquivo "use server" é endpoint público.
 */
export async function acaoDoar(_anterior: Estado, form: FormData): Promise<Estado> {
  const r = await iniciarDoacao(
    String(form.get("plano") ?? ""),
    form.get("aceite") === "1",
  );
  if (r.ok && r.url) redirect(r.url);
  return { ok: r.ok, mensagem: r.mensagem };
}

/** Dono da doação, vínculo e online são conferidos em `resgatarItensVip`. */
export async function acaoResgatarItens(_anterior: Estado, form: FormData): Promise<Estado> {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: "Doação inválida." };
  const r = await resgatarItensVip(id);
  revalidatePath("/vip");
  return r;
}

export async function acaoStatusDaDoacao(id: number): Promise<StatusDaDoacao | null> {
  return minhaDoacao(id);
}
