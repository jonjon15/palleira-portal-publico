"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  // O rádio manda "itemId|serverSlug" — a chave real da pilha no cofre
  // (migração 014): o mesmo item pode ter uma pilha "livre" e uma travada no
  // Dominantes ao mesmo tempo, e só o valor do rádio sabe qual foi marcada.
  const [itemId, serverSlug] = String(form.get("pilha") ?? "").split("|");
  const r = await anunciar(
    itemId ?? "",
    Number(form.get("qty") ?? 0),
    Number(form.get("preco") ?? 0),
    serverSlug ?? "",
  );
  atualiza();

  // Manda direto para a vitrine quando dá certo: sem isso, a pessoa ficava
  // na tela de "vender" e só via o próprio anúncio no ar depois de uma
  // navegação de verdade (sair/entrar, F5) — o cache do roteador do Next
  // segura a versão anterior de /mercado numa navegação por <Link> comum.
  // `redirect()` força uma renderização nova, então isso resolve de vez.
  if (r.ok) redirect("/mercado");
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
