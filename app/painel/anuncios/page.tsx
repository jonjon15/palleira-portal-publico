import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { meusAnuncios, minhasCompras, type MeuAnuncio } from "@/lib/mercado";
import { Cancelar, NomeDoItem } from "@/app/mercado/formularios";
import { ItemIcon } from "@/components/item-icon";
import { nomeDoPal, urlDoIcone } from "@/lib/pals";

export const metadata: Metadata = {
  title: "Meus anúncios",
  description: "O que você tem à venda, o que já vendeu e o que comprou.",
};

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<MeuAnuncio["status"], string> = {
  ativo: "No ar",
  vendido: "Vendido",
  cancelado: "Cancelado",
};

export default async function MeusAnuncios() {
  const session = await auth();
  if (!session) redirect("/entrar");
  const discordId = session.user.discordId;

  const [anuncios, compras] = await Promise.all([
    meusAnuncios(discordId),
    minhasCompras(discordId),
  ]);

  const ativos = anuncios.filter((a) => a.status === "ativo");
  const encerrados = anuncios.filter((a) => a.status !== "ativo");

  return (
    <>
      <PageHeader
        kicker="Anúncios"
        title="Suas vendas"
        description="Enquanto o anúncio está no ar, o lote fica em custódia do site — nem no seu cofre, nem com o comprador."
      />

      <div className="mx-auto max-w-4xl px-4 py-12">
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">No ar</h2>
            <Link
              href="/mercado/vender"
              className="text-sm font-semibold text-gold hover:text-gold-hi"
            >
              Anunciar outro →
            </Link>
          </div>

          {ativos.length === 0 ? (
            <p className="mt-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">
              Nenhum anúncio ativo. O que está no cofre não aparece na vitrine
              até você colocar um preço nele.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {ativos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <Descricao anuncio={a} />
                  <Preco anuncio={a} />
                  <Cancelar id={a.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {encerrados.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Encerrados</h2>
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {encerrados.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <Descricao anuncio={a} />
                  <Preco anuncio={a} />
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase ${
                      a.status === "vendido"
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-line-strong text-muted"
                    }`}
                  >
                    {ESTADO_LABEL[a.status]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {compras.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Suas compras</h2>
            <p className="mt-1 text-sm text-muted">
              Tudo isto está no seu cofre.{" "}
              <Link href="/painel/cofre" className="text-gold hover:text-gold-hi">
                Resgatar no jogo
              </Link>
            </p>
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {compras.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <AtivoIcone anuncio={c} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {c.kind === "pal" ? (
                        nomeDoPal(c.palId ?? "")
                      ) : (
                        <>
                          <NomeDoItem itemId={c.itemId ?? ""} /> ×{c.qty}
                        </>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted">de {c.vendedor}</p>
                  </div>
                  <Preco anuncio={c} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function AtivoIcone({ anuncio }: { anuncio: MeuAnuncio }) {
  if (anuncio.kind === "item") return <ItemIcon itemId={anuncio.itemId ?? ""} />;
  const icone = urlDoIcone(anuncio.palId ?? "");
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface-2">
      {icone ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icone} alt="" className="size-full object-contain" />
      ) : (
        <span className="text-[0.55rem] text-muted">?</span>
      )}
    </div>
  );
}

function Descricao({ anuncio }: { anuncio: MeuAnuncio }) {
  const legenda =
    anuncio.status === "vendido" && anuncio.comprador
      ? `Comprado por ${anuncio.comprador} · você recebeu ${anuncio.preco - anuncio.taxa}`
      : `Taxa ${anuncio.taxa} · você recebe ${anuncio.preco - anuncio.taxa}`;

  return (
    <>
      <AtivoIcone anuncio={anuncio} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {anuncio.kind === "pal" ? (
            nomeDoPal(anuncio.palId ?? "")
          ) : (
            <>
              <NomeDoItem itemId={anuncio.itemId ?? ""} /> ×{anuncio.qty}
            </>
          )}
        </p>
        <p className="truncate text-sm text-muted">{legenda}</p>
      </div>
    </>
  );
}

function Preco({ anuncio }: { anuncio: MeuAnuncio }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Pick className="size-4" withLetter={false} />
      <span className="tabular font-bold">{anuncio.preco}</span>
    </span>
  );
}
