"use server";

import { revalidatePath } from "next/cache";
import {
  comprar,
  anunciar,
  cancelarAnuncio,
  type Resultado,
} from "@/lib/mercado";

/**
 * Ponte entre as telas do mercado e o `lib/mercado`.
 *
 * ⚠️ Arquivo `"use server"` é endpoint público — o navegador pode chamar
 * qualquer export daqui com os argumentos que quiser. Sessão, posse do lote,
 * saldo e estado do anúncio são conferidos dentro do `lib/mercado`, na
 * função que age, e não aqui.
 */

export type Estado = Resultado;

function atualiza() {
  revalidatePath("/mercado");
  revalidatePath("/mercado/vender");
  revalidatePath("/painel/anuncios");
  revalidatePath("/painel/cofre");
  revalidatePath("/painel/carteira");
}

export async function acaoComprar(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await comprar(Number(form.get("id") ?? 0));
  atualiza();
  return r;
}

export async function acaoAnunciar(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await anunciar(
    String(form.get("itemId") ?? ""),
    Number(form.get("qty") ?? 0),
    Number(form.get("preco") ?? 0),
  );
  atualiza();
  return r;
}

export async function acaoCancelar(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const r = await cancelarAnuncio(Number(form.get("id") ?? 0));
  atualiza();
  return r;
}
