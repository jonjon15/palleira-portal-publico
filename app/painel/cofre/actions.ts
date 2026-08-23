"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  importarParaCofre,
  resgatarDoCofre,
  comprarSlot,
  type Resultado,
} from "@/lib/cofre";

/**
 * Ponte entre os formulários do cofre e o `lib/cofre`.
 *
 * ⚠️ Todo arquivo `"use server"` vira endpoint público: qualquer coisa
 * exportada daqui pode ser chamada direto pelo navegador, com os argumentos
 * que a pessoa quiser. Por isso a checagem de sessão, de vínculo e de posse
 * mora dentro do `lib/cofre`, na função que age — nunca só na tela.
 */

export type Estado = Resultado;

function atualiza() {
  revalidatePath("/painel/cofre");
  revalidatePath("/painel/carteira");
  revalidatePath("/mercado/vender");
}

const qtd = (form: FormData) => Number(form.get("qty") ?? 0);
const item = (form: FormData) => String(form.get("itemId") ?? "");
const servidor = (form: FormData) => String(form.get("servidor") ?? "");

export async function acaoGuardar(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await importarParaCofre(servidor(form), item(form), qtd(form));
  atualiza();
  return r;
}

export async function acaoResgatar(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await resgatarDoCofre(servidor(form), item(form), qtd(form));
  atualiza();
  return r;
}

export async function acaoComprarSlot(): Promise<Estado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };

  const r = await comprarSlot(session.user.discordId);
  atualiza();
  return r;
}

/** Botão "atualizar": a mochila muda no jogo enquanto a página está aberta. */
export async function acaoAtualizar(): Promise<void> {
  atualiza();
}
