import { redirect } from "next/navigation";

/**
 * Os Pals viraram uma aba de `/painel/cofre` (não mais uma tela à parte),
 * pra quem abre "Meu cofre" já ver itens e Pals juntos. Isso aqui fica só
 * como redirecionamento, para nenhum link/favorito antigo quebrar.
 */
export default async function CofreDePalsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ srv?: string }>;
}) {
  const { srv } = await searchParams;
  redirect(`/painel/cofre?tab=pals${srv ? `&srv=${srv}` : ""}`);
}
