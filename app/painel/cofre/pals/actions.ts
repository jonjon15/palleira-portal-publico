"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  importarPalParaCofre,
  iniciarResgateDePal,
  continuarResgate,
  statusDoResgate,
  semearPalDeTeste,
  comprarSlotDePal,
  type Resultado,
  type StatusResgate,
} from "@/lib/pal-cofre";
import { anunciarPal } from "@/lib/mercado";
import { auth } from "@/auth";
import { MENSAGEM_SO_MEMBRO } from "@/lib/roles";

/**
 * Ponte entre as telas de Pal e o `lib/pal-cofre`. Mesma disciplina do
 * cofre de item: sessão, posse e estado do jogo são conferidos lá dentro,
 * nunca aqui — um arquivo `"use server"` vira endpoint público.
 */

export type Estado = Resultado;

function atualiza() {
  revalidatePath("/painel/cofre");
  revalidatePath("/painel/carteira");
  revalidatePath("/mercado");
  revalidatePath("/painel/anuncios");
}

/**
 * Anunciar fica no cofre de Pals, não numa página `/mercado/vender/pal`
 * separada — o pedido era Jogador → Cofre → Itens/Pals, direto.
 */
export async function acaoAnunciarPal(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await anunciarPal(
    Number(form.get("vaultPalId") ?? 0),
    Number(form.get("preco") ?? 0),
  );
  atualiza();

  // Mesmo motivo do redirect em acaoAnunciar (item): sem isso, a pessoa não
  // vê o próprio anúncio no ar sem uma navegação de verdade.
  if (r.ok) redirect("/mercado?tipo=pal");
  return r;
}

/** Staff apenas — checagem de verdade mora em `semearPalDeTeste` (§9.2). */
export async function acaoSemearTeste(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await semearPalDeTeste(String(form.get("json") ?? ""));
  atualiza();
  return r;
}

export async function acaoComprarSlotDePal(): Promise<Estado> {
  const session = await auth();
  if (!session) return { ok: false, mensagem: "Entre com o Discord primeiro." };
  if (!session.user.isMember) return { ok: false, mensagem: MENSAGEM_SO_MEMBRO };

  const r = await comprarSlotDePal(session.user.discordId, session.user.roles);
  atualiza();
  return r;
}

export async function acaoGuardarPal(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await importarPalParaCofre(
    String(form.get("servidor") ?? ""),
    String(form.get("instanceId") ?? ""),
  );
  atualiza();
  return r;
}

export type EstadoResgate = Resultado & { transferId?: number };

export async function acaoResgatarPal(
  _anterior: EstadoResgate,
  form: FormData,
): Promise<EstadoResgate> {
  const r = await iniciarResgateDePal(
    Number(form.get("vaultPalId") ?? 0),
    String(form.get("servidor") ?? ""),
  );
  atualiza();
  return r;
}

/**
 * Chamado pelo polling do cliente. Devolve `null` quando a transferência não
 * é do usuário logado.
 *
 * ⚠️ A confirmação de dono vem ANTES de `continuarResgate`, de propósito:
 * aquela função não filtra por `discordId` — ela só existe para ser chamada
 * daqui. Invertido, qualquer sessão logada que soubesse o número de um `id`
 * alheio conseguiria disparar o `givepal_j` de outra pessoa.
 */
export async function consultarResgate(
  transferId: number,
): Promise<StatusResgate | null> {
  const session = await auth();
  if (!session) return null;

  const meu = await statusDoResgate(transferId, session.user.discordId);
  if (!meu) return null;

  // Enquanto o arquivo não está pronto, `continuarResgate` só devolve o
  // estado atual; ao chegar em `arquivo_pronto`, é aqui que ele dispara o
  // `givepal_j`.
  const atual = (await continuarResgate(transferId)) ?? meu;

  if (atual.status === "concluido" || atual.status === "falhou") {
    revalidatePath("/painel/carteira");
  }
  return atual;
}
