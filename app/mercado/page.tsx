import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { vitrine, type Anuncio, type TipoAnuncio } from "@/lib/mercado";
import { nomeDoItem, categoriaDoItem, CATEGORIA_LABEL } from "@/lib/itens";
import { nomeDoPal } from "@/lib/pals";
import { kitsAtivos, type Kit } from "@/lib/kits";
import { Comprar, ComprarKit, NomeDoItem } from "./formularios";
import { ItemIcon } from "@/components/item-icon";
import { PalCard } from "@/components/pal-card";
import { Pal3DSobDemanda } from "@/components/pal-3d-sob-demanda";

export const metadata: Metadata = {
  title: "Mercado da Palleira",
  description:
    "Compre e venda itens e Pals entre jogadores da Palleira BR, pagos em Paletas.",
};

// Vitrine com preço e disponibilidade: cache aqui é anúncio fantasma na tela.
export const dynamic = "force-dynamic";

/**
 * "kit" não é um `TipoAnuncio`: kit vem de `kits`, não de `listings` — é
 * produto de loja, com estoque infinito e entrega direta no jogo, enquanto
 * anúncio é peça única que passa pelo cofre (ver `lib/kits.ts`).
 */
type Filtro = TipoAnuncio | "kit" | undefined;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: undefined, rotulo: "Todos" },
  { valor: "item", rotulo: "Itens" },
  { valor: "pal", rotulo: "Pals" },
  { valor: "kit", rotulo: "Kits" },
];

export default async function Mercado({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string }>;
}) {
  const [{ q, tipo: tipoCru }, session, anuncios, kits] = await Promise.all([
    searchParams,
    auth(),
    vitrine(),
    kitsAtivos(),
  ]);

  const tipo: Filtro =
    tipoCru === "item" || tipoCru === "pal" || tipoCru === "kit" ? tipoCru : undefined;
  const busca = (q ?? "").trim().toLowerCase();

  const lista = anuncios.filter((a) => {
    // Na aba Kits nenhum anúncio de `listings` entra — só a seção de kits.
    if (tipo === "kit") return false;
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

  const pals = lista.filter((a) => a.kind === "pal");
  const itens = lista.filter((a) => a.kind === "item");

  // Kit casa com a busca pelo nome, pela descrição e pelo nome de qualquer
  // item de dentro: quem procura "esfera" quer achar o kit que tem esferas,
  // não só o anúncio avulso.
  const kitsVisiveis =
    tipo !== undefined && tipo !== "kit"
      ? []
      : kits.filter((k) => {
          if (!busca) return true;
          return (
            k.nome.toLowerCase().includes(busca) ||
            k.descricao.toLowerCase().includes(busca) ||
            k.itens.some(
              (i) =>
                nomeDoItem(i.itemId).toLowerCase().includes(busca) ||
                i.itemId.toLowerCase().includes(busca),
            )
          );
        });

  const vazio = lista.length === 0 && kitsVisiveis.length === 0;

  return (
    <>
      <PageHeader
        kicker="Mercado"
        title="Mercado da Palleira"
        description="Item e Pal de outro jogador caem no seu cofre, e você resgata quando entrar — ninguém precisa estar online ao mesmo tempo. Kit da loja é o contrário: chega direto na mochila, com você dentro do jogo."
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
        {/*
          Pal e item nunca dividem o mesmo grid: o card de Pal (3D + IVs +
          habilidades + passivas) é bem mais alto que o de item, e misturados
          numa grade de 3 colunas a linha inteira herda a altura do card mais
          alto — sobra espaço vazio esquisito do lado dos itens (23/08/2026,
          reparo do dono). Duas seções, cada uma com cards de altura parecida.
        */}
        {vazio ? (
          <Vazio temBusca={Boolean(busca)} logado={Boolean(session)} />
        ) : (
          <>
            {/*
              Kits primeiro: são da loja, sempre disponíveis, e servem de
              porta de entrada para quem chegou sem saber o que procurar.
            */}
            {kitsVisiveis.length > 0 && (
              <section>
                {tipo === undefined && lista.length > 0 && (
                  <h2 className="text-sm font-bold tracking-[0.14em] text-muted uppercase">
                    Kits da loja
                  </h2>
                )}
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {kitsVisiveis.map((k) => (
                    <CardDeKit key={k.id} kit={k} logado={Boolean(session)} />
                  ))}
                </ul>
              </section>
            )}

            {pals.length > 0 && (
              <section className={kitsVisiveis.length > 0 ? "mt-10" : "mt-8"}>
                {tipo === undefined && itens.length > 0 && (
                  <h2 className="text-sm font-bold tracking-[0.14em] text-muted uppercase">
                    Pals
                  </h2>
                )}
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pals.map((a) => (
                    <CardAnuncio
                      key={a.id}
                      anuncio={a}
                      euSou={session?.user.discordId}
                    />
                  ))}
                </ul>
              </section>
            )}

            {itens.length > 0 && (
              <section
                className={pals.length > 0 || kitsVisiveis.length > 0 ? "mt-10" : "mt-8"}
              >
                {tipo === undefined && pals.length > 0 && (
                  <h2 className="text-sm font-bold tracking-[0.14em] text-muted uppercase">
                    Itens
                  </h2>
                )}
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {itens.map((a) => (
                    <CardAnuncio
                      key={a.id}
                      anuncio={a}
                      euSou={session?.user.discordId}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
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

/**
 * O card de um kit da loja.
 *
 * Diferente do card de anúncio em três coisas que a tela precisa deixar
 * claras: não tem vendedor (é da loja), não acaba (estoque infinito), e
 * chega direto na mochila em vez de cair no cofre.
 */
function CardDeKit({ kit, logado }: { kit: Kit; logado: boolean }) {
  return (
    <li className="flex flex-col rounded-[var(--radius-card)] border border-gold/25 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{kit.nome}</h3>
          <p className="mt-0.5 text-xs font-bold tracking-wider text-gold uppercase">
            Kit da loja
          </p>
        </div>
        <span className="tabular shrink-0 font-semibold text-gold">
          {kit.preco}
        </span>
      </div>

      {kit.descricao && (
        <p className="mt-2 text-sm text-muted">{kit.descricao}</p>
      )}

      <ul className="mt-3 space-y-1.5">
        {kit.itens.map((i) => (
          <li key={i.itemId} className="flex items-center gap-2 text-sm">
            <ItemIcon itemId={i.itemId} className="size-7 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              <NomeDoItem itemId={i.itemId} />
            </span>
            <span className="tabular shrink-0 text-muted">×{i.quantidade}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted">
        Entregue na hora, dentro do jogo — você precisa estar online.
      </p>

      <div className="mt-auto pt-3">
        {logado ? (
          <ComprarKit id={kit.id} preco={kit.preco} />
        ) : (
          <Link
            href="/entrar"
            className="block w-full rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-center text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
          >
            Entrar para comprar
          </Link>
        )}
      </div>
    </li>
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
        <div className="border-b border-line bg-surface-2">
          <Pal3DSobDemanda palId={anuncio.palId ?? ""} className="aspect-square" />
        </div>
      ) : (
        <div className="flex items-center justify-center border-b border-line bg-surface-2 py-7">
          <ItemIcon itemId={anuncio.itemId ?? ""} bare className="size-20" />
        </div>
      )}

      <div className="flex flex-1 flex-col p-5 pt-0">
        {anuncio.kind === "pal" ? (
          <div className="pt-5">
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
                activeSkills: anuncio.palTemplate?.ActiveSkills as
                  | string[]
                  | undefined,
              }}
              detalhado
              semIcone
            />
            <p className="tabular mt-3 text-sm text-muted">{anuncio.vendedor}</p>
            {anuncio.serverNome && <SeloDeOrigem nome={anuncio.serverNome} />}
          </div>
        ) : (
          <div className="pt-4">
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
            {anuncio.serverNome && <SeloDeOrigem nome={anuncio.serverNome} />}
          </div>
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

/** Aviso de que este anúncio só troca de mão com quem também joga lá. */
function SeloDeOrigem({ nome }: { nome: string }) {
  return (
    <p className="mt-1.5 inline-flex items-center rounded-full border border-gold/30 bg-gold/[0.08] px-2.5 py-0.5 text-xs font-semibold text-gold">
      Só {nome}
    </p>
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
