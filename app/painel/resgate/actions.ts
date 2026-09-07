"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { meuVinculo } from "@/lib/linking";
import {
  pedirRestauracao,
  cancelarPedidoDeRestauracao,
  type Resultado,
} from "@/lib/resgate-base";

/**
 * Ponte entre os formulários e `lib/resgate-base`.
 *
 * ⚠️ Todo arquivo `"use server"` vira endpoint público — por isso a sessão e
 * o vínculo são conferidos aqui, e o UID nunca vem do formulário: mesmo que
 * alguém edite o HTML, o UID usado é sempre o da conta que está logada.
 */

export type Estado = Resultado;

function atualiza() {
  revalidatePath("/painel/resgate");
  revalidatePath("/painel/carteira");
}

export async function acaoPedirRestauracao(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };

  const vinculo = await meuVinculo(session.user.discordId);
  if (!vinculo) {
    return { ok: false, mensagem: "Vincule seu personagem primeiro." };
  }

  const serverSlug = String(form.get("servidor") ?? "");
  const snapshotId = Number(form.get("snapshotId") ?? 0);
  if (!serverSlug || !snapshotId) {
    return { ok: false, mensagem: "Pedido inválido." };
  }

  const r = await pedirRestauracao({
    discordId: session.user.discordId,
    uid: vinculo.uid,
    serverSlug,
    snapshotId,
  });
  atualiza();
  return r;
}

export async function acaoCancelarPedido(): Promise<Estado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };

  const r = await cancelarPedidoDeRestauracao(session.user.discordId);
  atualiza();
  return r;
}
