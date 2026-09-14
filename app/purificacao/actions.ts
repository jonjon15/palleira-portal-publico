"use server";

import { revalidatePath } from "next/cache";
import { iniciarRitual, doarPal, type Resultado } from "@/lib/purificacao";

/**
 * Ponte entre a tela do jogador e `lib/purificacao`. Sessão, vínculo e
 * estado do jogo são conferidos lá dentro, nunca aqui — mesma disciplina do
 * cofre de Pals (`app/painel/cofre/pals/actions.ts`).
 */

export type Estado = Resultado;

function atualiza() {
  revalidatePath("/purificacao");
  revalidatePath("/admin/purificacao");
}

export async function acaoIniciarRitual(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await iniciarRitual(
    String(form.get("servidor") ?? ""),
    String(form.get("instanceId") ?? ""),
  );
  atualiza();
  return r;
}

export async function acaoDoarPal(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await doarPal(String(form.get("instanceId") ?? ""));
  atualiza();
  return r;
}
