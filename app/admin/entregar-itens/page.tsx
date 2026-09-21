import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canPowerServer } from "@/lib/roles";
import { jogadoresOnlineParaItens } from "@/lib/admin-entregar-itens";
import { catalogoDeItens } from "@/lib/itens";
import { todosOsKitsPremio } from "@/lib/kits-premio";
import { EntregarItens, FormularioDeKitPremio, LinhaDeKitPremio } from "./formularios";

export const metadata: Metadata = { title: "Entregar itens" };
export const dynamic = "force-dynamic";

/**
 * Entregar itens de graça, dentro do jogo — migrado de
 * `app/admin/moderacao` para página própria em 21/09/2026 (pedido do dono).
 *
 * Duas formas de entregar, lado a lado:
 *   1. Avulso: monta o lote na hora, clicando na grade de itens.
 *   2. Kit de prêmio: um lote salvo de antemão ("Prêmio do evento X"),
 *      criado uma vez e reusado sempre que precisar — sem remontar a lista
 *      de itens toda vez.
 *
 * As duas usam o mesmo motor por baixo (`entregarItensParaJogadores`, RCON
 * síncrono) — ver `lib/admin-entregar-itens.ts` e `lib/kits-premio.ts`.
 */
export default async function EntregarItensPage() {
  const session = await auth();
  if (!session) redirect("/entrar");

  // Mesmo critério de "Entregar Pal manual" e kits do Mercado — dar item de
  // graça é econômico, não é moderação comum.
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const [online, kits] = await Promise.all([
    jogadoresOnlineParaItens().catch(() => []),
    todosOsKitsPremio(),
  ]);
  const catalogo = catalogoDeItens();

  const ativos = kits.filter((k) => k.ativo).length;

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="Entregar itens"
        description="Dá item de graça para quem está no jogo agora — avulso ou por um kit de prêmio salvo."
      />

      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* ------------------------------------------------- entrega avulsa */}
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Entrega avulsa</h2>
          <p className="mt-1.5 max-w-3xl text-sm text-muted">
            A versão mascarada do{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              /giveitems
            </code>{" "}
            do jogo: escolha jogadores online e monte o lote de itens
            buscando por nome — para quando é só uma vez.
          </p>
          <div className="mt-5">
            <EntregarItens online={online} catalogo={catalogo} />
          </div>
        </section>

        {/* --------------------------------------------- montar kit de prêmio */}
        <section className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Montar um kit de prêmio novo</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Monte a lista de itens uma vez e ela fica salva — útil para
            prêmio de evento, que costuma se repetir. Diferente do kit do
            Mercado, este nunca tem preço e nunca aparece à venda: só a
            cúpula usa, para entregar de graça.
          </p>
          <div className="mt-5">
            <FormularioDeKitPremio catalogo={catalogo} />
          </div>
        </section>

        {/* ------------------------------------------------- kits salvos */}
        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Kits de prêmio salvos</h2>
            <span className="text-sm text-muted">
              {ativos} ativo{ativos === 1 ? "" : "s"} · {kits.length} no total
            </span>
          </div>

          {kits.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nenhum kit de prêmio ainda. Monte o primeiro acima.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {kits.map((k) => (
                <LinhaDeKitPremio key={k.id} kit={k} catalogo={catalogo} online={online} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
