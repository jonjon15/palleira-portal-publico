"use server";

import { revalidatePath } from "next/cache";
import {
  pedirCodigo,
  confirmarCodigo,
  cancelarPedido,
  desvincular,
  type Resultado,
} from "@/lib/linking";

/**
 * Ponte entre os formulários e o `lib/linking`.
 *
 * Fica separado porque um arquivo `"use server"` vira endpoint público: tudo
 * que é exportado daqui pode ser chamado pelo navegador. Por isso a checagem
 * de sessão mora dentro de cada função do `lib/linking`, não aqui.
 */

// Só tipos e funções async podem sair daqui — um arquivo "use server" vira
// endpoint, e o Next recusa qualquer outro tipo de export.
export type Estado = Resultado;

function atualiza() {
  revalidatePath("/vincular");
  revalidatePath("/painel");
}

export async function acaoPedirCodigo(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  // "pve-free|steam_7656…" — o UID do Palworld nunca tem "|", então o corte
  // no primeiro separador é seguro.
  const alvo = String(form.get("alvo") ?? "");
  const corte = alvo.indexOf("|");
  const servidor = corte > 0 ? alvo.slice(0, corte) : "";
  const uid = corte > 0 ? alvo.slice(corte + 1) : "";

  if (!servidor || !uid) {
    return { ok: false, mensagem: "Escolha o seu personagem na lista." };
  }

  const r = await pedirCodigo(servidor, uid);
  atualiza();
  return r;
}

export async function acaoConfirmar(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await confirmarCodigo(String(form.get("codigo") ?? ""));
  atualiza();
  return r;
}

export async function acaoCancelar(): Promise<void> {
  await cancelarPedido();
  atualiza();
}

export async function acaoDesvincular(): Promise<void> {
  await desvincular();
  atualiza();
}

/** Botão "recarregar": um <Link> para a própria rota serviria cache velho. */
export async function acaoAtualizarLista(): Promise<void> {
  atualiza();
}
