"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { meuVinculo } from "@/lib/linking";
import { lancar, chaveDoDaily, DAILY_PALETAS } from "@/lib/economia";

export type Estado = { ok: boolean; mensagem: string };

/**
 * O `/daily` da §7.1 — 2 Paletas, uma vez por dia.
 *
 * Exige personagem vinculado de propósito (§7.8): sem isso, qualquer conta
 * descartável de Discord vira uma torneira nova, e a calibração inteira da
 * moeda vai por água abaixo.
 */
export async function pegarDaily(): Promise<Estado> {
  const session = await auth();
  if (!session) {
    return { ok: false, mensagem: "Entre com o Discord primeiro." };
  }
  if (!session.user.isMember) {
    return {
      ok: false,
      mensagem: "O daily é para quem está no Discord da Palleira.",
    };
  }

  const discordId = session.user.discordId;

  if (!(await meuVinculo(discordId))) {
    return {
      ok: false,
      mensagem: "Vincule seu personagem antes de pegar o daily.",
    };
  }

  const r = await lancar({
    discordId,
    delta: DAILY_PALETAS,
    origem: "daily",
    descricao: "Daily do dia",
    chave: chaveDoDaily(discordId),
  });

  revalidatePath("/painel/carteira");
  revalidatePath("/painel");

  if (r.status === "repetido") {
    return { ok: false, mensagem: "Você já pegou o daily hoje. Volta amanhã!" };
  }

  return {
    ok: true,
    mensagem: `+${DAILY_PALETAS} Paletas. Saldo: ${r.saldo}.`,
  };
}
