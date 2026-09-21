"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canManageEconomy } from "@/lib/roles";
import { buscarMembro } from "@/lib/discord";
import { ajustar, definirSaldo } from "@/lib/economia";

/** Todo mundo que mexe em economia passa por aqui antes (§7.8). */
async function exigirCupula() {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  const nivel = levelOf(session.user.roles, session.user.isMember);
  if (!canManageEconomy(nivel)) throw new Error("Sem permissão");
  return session.user.discordId;
}

/* ------------------------------------------------------------------ ajuste */

export interface EstadoAjuste {
  ok: boolean;
  mensagem: string;
}

/**
 * Ajuste único de saldo — junta o que antes eram duas telas separadas
 * ("migrar em lote" via checkpoint do Palbot e "ajustar saldo" com delta),
 * depois que o servidor deixou de usar o Palbot (21/09/2026). Um só
 * formulário, dois modos:
 *
 *   - `delta`: soma/subtrai um valor do saldo atual (uso do dia a dia).
 *   - `definir`: fixa o saldo final da pessoa (era o papel da migração).
 *
 * Os dois passam por `lib/economia.ajustar`, então os dois exigem motivo e
 * ficam no extrato — nunca existiu ajuste "silencioso" (§7.8), e a fusão
 * não abre exceção para isso.
 */
export async function ajustarSaldo(
  _anterior: EstadoAjuste,
  form: FormData,
): Promise<EstadoAjuste> {
  const actorId = await exigirCupula();

  const discordId = String(form.get("discordId") ?? "").trim();
  const modo = String(form.get("modo") ?? "delta");
  const valor = Number(form.get("valor"));
  const motivo = String(form.get("motivo") ?? "").trim();

  if (!discordId) {
    return { ok: false, mensagem: "Escolha um jogador na lista." };
  }
  if (!Number.isInteger(valor)) {
    return { ok: false, mensagem: "O valor tem que ser um número inteiro." };
  }
  if (modo === "delta" && valor === 0) {
    return { ok: false, mensagem: "Escolha um valor diferente de zero para somar/subtrair." };
  }
  if (modo === "definir" && valor < 0) {
    return { ok: false, mensagem: "O saldo final não pode ser negativo." };
  }
  if (motivo.length < 5) {
    return { ok: false, mensagem: "Escreva o motivo. Ele fica no extrato da pessoa." };
  }

  const membro = await buscarMembro(discordId).catch(() => null);

  const r =
    modo === "definir"
      ? await definirSaldo({ discordId, alvo: valor, motivo, actorId })
      : await ajustar({ discordId, delta: valor, motivo, actorId });

  revalidatePath("/admin/economia");
  revalidatePath("/painel/carteira");

  if (r.status === "sem-saldo") {
    return {
      ok: false,
      mensagem: `Não dá: ${membro?.displayName ?? discordId} tem ${r.saldo} e isso deixaria a carteira negativa.`,
    };
  }

  return {
    ok: true,
    mensagem:
      modo === "definir"
        ? `Saldo de ${membro?.displayName ?? discordId} definido para ${r.saldo}.`
        : `${valor > 0 ? "+" : ""}${valor} para ${membro?.displayName ?? discordId}. Saldo agora: ${r.saldo}.`,
  };
}
