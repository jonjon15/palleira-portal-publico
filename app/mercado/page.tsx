import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { vitrine, type Anuncio, type TipoAnuncio } from "@/lib/mercado";
import { nomeDoItem, categoriaDoItem, CATEGORIA_LABEL } from "@/lib/itens";
import { nomeDoPal } from "@/lib/pals";
import { Comprar, NomeDoItem } from "./formularios";
import { ItemIcon } from "@/components/item-icon";
import { PalCard } from "@/components/pal-card";

export const metadata: Metadata = {
  title: "Mercado",
  description:
    "Compre e venda itens e Pals entre jogadores da Palleira BR, pagos em Paletas.",
};

// Vitrine com preço e disponibilidade: cache aqui é anúncio fantasma na tela.
export const dynamic = "force-dynamic";

const FILTROS: { valor: TipoAnuncio | undefined; rotulo: string }[] = [
  { valor: undefined, rotulo: "Todos" },
  { valor: "item", rotulo: "Itens" },
  { valor: "pal", rotulo: "Pals" },
];

export default async function Mercado({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string }>;
}) {
  const [{ q, tipo: tipoCru }, session, anuncios] = await Promise.all([
    searchParams,
    auth(),
    vitrine(),
  ]);

  const tipo = tipoCru === "item" || tipoCru === "pal" ? tipoCru : undefined;
  const busca = (q ?? "").trim().toLowerCase();

  const lista = anuncios.filter((a) => {
    if (tipo && a.kind !== tipo) return false;
    if (!busca) return true;
    // Busca pelo nome traduzido E pela chave crua: quem só conhece o item ou
    // o Pal pelo ID do jogo acha do mesmo jeito.
    if (a.kind === "pal") {
      const palId = a.palId ?? "";
      return (
        nomeDoPal(palId).toLowerCase().includes(busca) ||
        palId.toLowerCase().includes(busca)
      );
    }
    const itemId = a.itemId ?? "";
    return (
      nomeDoItem(itemId).toLowerCase().includes(busca) ||
      itemId.toLowerCase().includes(busca)
    );
  });

  return (
    <>
      <PageHeader
        kicker="Mercado"
        title="Mercado"
        description="Comprado aqui, o item ou Pal cai no seu cofre na hora — e você resgata no jogo quando entrar. Ninguém precisa estar online ao mesmo tempo."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* ------------------------------------------------------- controles */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-[var(--radius-control)] border border-line-strong p-1">
              {FILTROS.map((f) => (
                <Link
                  key={f.rotulo}
                  href={
                    f.valor
                      ? `/mercado?tipo=${f.valor}${q ? `&q=${encodeURIComponent(q)}` : ""}`
                      : `/mercado${q ? `?q=${encodeURIComponent(q)}` : ""}`
                  }
                  className={`rounded-[calc(var(--radius-control)-4px)] px-3 py-1.5 text-sm font-semibold transition-colors ${
                    tipo === f.valor
                      ? "bg-gold text-[#14120f]"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {f.rotulo}
                </Link>
              ))}
            </div>

            <form className="flex gap-2">
              {tipo && <input type="hidden" name="tipo" value={tipo} />}
              <label htmlFor="q" className="sr-only">
                Buscar
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q ?? ""}
                placeholder="Buscar item ou Pal…"
                className="w-56 rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 py-2 text-sm outline-none focus:border-gold"
              />
              <button
                type="submit"
                className="rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
              >
                Buscar
              </button>
            </form>
          </div>

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
    <li className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      {anuncio.kind === "pal" ? (
        <div className="p-5">
          <PalCard
            pal={{
              palId: anuncio.palId ?? "",
              level: Number(anuncio.palTemplate?.Level ?? 1),
              gender: anuncio.palTemplate?.Gender as string | undefined,
              shiny: anuncio.palTemplate?.Shiny as boolean | undefined,
              condensedPals: anuncio.palTemplate?.CondensedPals as
                | number
                | undefined,
              ivs: anuncio.palTemplate?.IVs as Record<string, number> | undefined,
              passives: anuncio.palTemplate?.Passives as string[] | undefined,
            }}
            detalhado
          />
          <p className="tabular mt-3 text-sm text-muted">{anuncio.vendedor}</p>
        </div>
      ) : (
        <div className="flex items-center justify-center border-b border-line bg-surface-2 py-7">
          <ItemIcon itemId={anuncio.itemId ?? ""} bare className="size-20" />
        </div>
      )}

      <div className="flex flex-1 flex-col p-5 pt-0">
        {anuncio.kind === "item" && (
          <>
            <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">
              {CATEGORIA_LABEL[categoriaDoItem(anuncio.itemId ?? "")]}
            </p>
            <h2 className="leading-snug font-semibold">
              <NomeDoItem itemId={anuncio.itemId ?? ""} />
            </h2>
            <p className="tabular text-sm text-muted">
              {anuncio.qty} unidade{anuncio.qty === 1 ? "" : "s"} ·{" "}
              {anuncio.vendedor}
            </p>
          </>
        )}

        <div className="mt-4 flex items-center gap-1.5">
          <Pick className="size-5" withLetter={false} />
          <span className="tabular text-2xl font-bold">{anuncio.preco}</span>
          <span className="text-sm text-muted">
            Paleta{anuncio.preco === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-auto pt-3">
          {meu ? (
            <p className="rounded-[var(--radius-control)] border border-dashed border-line-strong px-4 py-2 text-center text-sm text-muted">
              Seu anúncio
            </p>
          ) : euSou ? (
            <Comprar id={anuncio.id} preco={anuncio.preco} />
          ) : (
            <Link
              href="/entrar"
              className="block rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-center text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
            >
              Entrar para comprar
            </Link>
          )}
        </div>
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
