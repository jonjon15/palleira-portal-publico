"use server";

import { revalidatePath } from "next/cache";
import { definirRegraDoRitual, cancelarRitual, type Resultado } from "@/lib/purificacao";

/**
 * Ponte entre a fila de aprovação e `lib/purificacao`. A checagem de staff
 * mora lá dentro (`exigirStaff`), nunca aqui.
 */

export type Estado = Resultado;

function atualiza() {
  revalidatePath("/admin/purificacao");
  revalidatePath("/purificacao");
}

export async function acaoDefinirRegra(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const ritualId = Number(form.get("ritualId") ?? 0);
  const passivas = form.getAll("passivas").map(String);
  const r = await definirRegraDoRitual(ritualId, passivas);
  atualiza();
  return r;
}

export async function acaoCancelarRitual(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await cancelarRitual(Number(form.get("ritualId") ?? 0));
  atualiza();
  return r;
}
