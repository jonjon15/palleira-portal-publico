import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { vitrine, type Anuncio } from "@/lib/mercado";
import { nomeDoItem, categoriaDoItem, CATEGORIA_LABEL } from "@/lib/itens";
import { Comprar, NomeDoItem } from "./formularios";

export const metadata: Metadata = {
  title: "Mercado",
  description:
    "Compre e venda itens entre jogadores da Palleira BR, pagos em Paletas.",
};

// Vitrine com preço e disponibilidade: cache aqui é anúncio fantasma na tela.
export const dynamic = "force-dynamic";

export default async function Mercado({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, session, anuncios] = await Promise.all([
    searchParams,
    auth(),
    vitrine(),
  ]);

  const busca = (q ?? "").trim().toLowerCase();
  // Busca pelo nome traduzido E pela chave crua: quem só conhece o item pelo
  // ID do jogo acha do mesmo jeito.
  const lista = busca
    ? anuncios.filter(
        (a) =>
          nomeDoItem(a.itemId).toLowerCase().includes(busca) ||
          a.itemId.toLowerCase().includes(busca),
      )
    : anuncios;

  return (
    <>
      <PageHeader
        kicker="Mercado"
        title="Mercado de itens"
        description="Comprado aqui, o lote cai no seu cofre na hora — e você resgata no jogo quando entrar. Ninguém precisa estar online ao mesmo tempo."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* ------------------------------------------------------- controles */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <form className="flex gap-2">
            <label htmlFor="q" className="sr-only">
              Buscar item
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Buscar item…"
              className="w-56 rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 py-2 text-sm outline-none focus:border-gold"
            />
            <button
              type="submit"
              className="rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
            >
              Buscar
            </button>
          </form>

          {session && (
            <div className="flex gap-2">
              <Link
                href="/painel/cofre"
                className="rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
              >
                Meu cofre
              </Link>
              <Link
                href="/mercado/vender"
                className="rounded-[var(--radius-control)] bg-gold px-4 py-2 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
              >
                Vender
              </Link>
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- vitrine */}
        {lista.length === 0 ? (
          <Vazio temBusca={Boolean(busca)} logado={Boolean(session)} />
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((a) => (
              <CardAnuncio
                key={a.id}
                anuncio={a}
                euSou={session?.user.discordId}
              />
            ))}
          </ul>
        )}

        {!session && lista.length > 0 && (
          <p className="mt-8 text-sm text-muted">
            <Link href="/entrar" className="font-semibold text-gold hover:text-gold-hi">
              Entre com o Discord
            </Link>{" "}
            para comprar e para anunciar o que está no seu cofre.
          </p>
        )}
      </div>
    </>
  );
}

function CardAnuncio({
  anuncio,
  euSou,
}: {
  anuncio: Anuncio;
  euSou?: string;
}) {
  const meu = euSou === anuncio.vendedorId;

  return (
    <li className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">
        {CATEGORIA_LABEL[categoriaDoItem(anuncio.itemId)]}
      </p>

      <h2 className="mt-1.5 leading-snug font-semibold">
        <NomeDoItem itemId={anuncio.itemId} />
      </h2>

      <p className="tabular mt-0.5 text-sm text-muted">
        {anuncio.qty} unidade{anuncio.qty === 1 ? "" : "s"} · {anuncio.vendedor}
      </p>

      <div className="mt-4 flex items-center gap-1.5">
        <Pick className="size-5" withLetter={false} />
        <span className="tabular text-2xl font-bold">{anuncio.preco}</span>
        <span className="text-sm text-muted">
          Paleta{anuncio.preco === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-auto">
        {meu ? (
          <p className="mt-3 rounded-[var(--radius-control)] border border-dashed border-line-strong px-4 py-2 text-center text-sm text-muted">
            Seu anúncio
          </p>
        ) : euSou ? (
          <Comprar id={anuncio.id} preco={anuncio.preco} />
        ) : (
          <Link
            href="/entrar"
            className="mt-3 block rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-center text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
          >
            Entrar para comprar
          </Link>
        )}
      </div>
    </li>
  );
}

function Vazio({ temBusca, logado }: { temBusca: boolean; logado: boolean }) {
  if (temBusca) {
    return (
      <p className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-muted">
        Nenhum anúncio com esse nome. Tente outra palavra ou limpe a busca.
      </p>
    );
  }

  return (
    <div className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8 text-center">
      <h2 className="font-semibold">O mercado está vazio — por enquanto</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Ninguém anunciou nada ainda. Quem chegar primeiro escolhe o preço: leve
        um item da mochila para o cofre e coloque à venda.
      </p>
      {logado && (
        <Link
          href="/painel/cofre"
          className="mt-5 inline-flex rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
        >
          Abrir meu cofre
        </Link>
      )}
    </div>
  );
}
