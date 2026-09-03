"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { temVinculo } from "@/lib/linking";
import { lancar, chaveDoDaily, dailyPaletas } from "@/lib/economia";

export type Estado = { ok: boolean; mensagem: string };

/**
 * O `/daily` da §7.1 — 2 a 12 Paletas conforme o plano VIP, uma vez por dia.
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

  if (!(await temVinculo(discordId))) {
    return {
      ok: false,
      mensagem: "Vincule seu personagem antes de pegar o daily.",
    };
  }

  const quanto = dailyPaletas(session.user.roles);

  const r = await lancar({
    discordId,
    delta: quanto,
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
    mensagem: `+${quanto} Paletas. Saldo: ${r.saldo}.`,
  };
}
