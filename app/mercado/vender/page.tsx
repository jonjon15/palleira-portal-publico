import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { meuCofre } from "@/lib/cofre";
import { meusAnuncios } from "@/lib/mercado";
import { MAX_ANUNCIOS_ATIVOS } from "@/lib/mercado-regras";
import { Anunciar } from "../formularios";

export const metadata: Metadata = {
  title: "Anunciar",
  description: "Coloque à venda o que está guardado no seu cofre.",
};

export const dynamic = "force-dynamic";

export default async function Vender() {
  const session = await auth();
  if (!session) redirect("/entrar");
  const discordId = session.user.discordId;

  const [cofre, anuncios] = await Promise.all([
    meuCofre(discordId),
    meusAnuncios(discordId),
  ]);
  const ativos = anuncios.filter((a) => a.status === "ativo").length;

  return (
    <>
      <PageHeader
        kicker="Vender"
        title="Anunciar do cofre"
        description="O lote sai do cofre e fica em custódia do anúncio. Cancelou? Volta inteiro para o cofre."
      />

      <div className="mx-auto max-w-3xl px-4 py-12">
        {cofre.itens.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8">
            <h2 className="font-semibold">Seu cofre está vazio</h2>
            <p className="mt-2 max-w-md text-sm text-muted">
              Só dá para anunciar o que já está guardado — é isso que garante ao
              comprador que o item existe e vai ser entregue. Entre no jogo e
              leve para o cofre o que quiser vender.
            </p>
            <Link
              href="/painel/cofre"
              className="mt-5 inline-flex rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
            >
              Abrir o cofre
            </Link>
          </div>
        ) : ativos >= MAX_ANUNCIOS_ATIVOS ? (
          <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-6">
            <h2 className="font-semibold">
              Você já tem {MAX_ANUNCIOS_ATIVOS} anúncios no ar
            </h2>
            <p className="mt-2 text-sm text-muted">
              É o limite por pessoa, para a vitrine não virar mural de um
              vendedor só. Cancele um anúncio para liberar espaço.
            </p>
            <Link
              href="/painel/anuncios"
              className="mt-4 inline-flex rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
            >
              Ver meus anúncios
            </Link>
          </div>
        ) : (
          <>
            <Anunciar itens={cofre.itens} />
            <p className="mt-8 text-xs text-muted">
              {ativos} de {MAX_ANUNCIOS_ATIVOS} anúncios usados ·{" "}
              <Link href="/painel/anuncios" className="text-gold hover:text-gold-hi">
                gerenciar
              </Link>
            </p>
          </>
        )}
      </div>
    </>
  );
}
