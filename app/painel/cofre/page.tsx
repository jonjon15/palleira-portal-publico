import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { PalCard } from "@/components/pal-card";
import { meuVinculo } from "@/lib/linking";
import { saldo } from "@/lib/economia";
import { isStaff, levelOf } from "@/lib/roles";
import {
  meuCofre,
  ondeEstouOnline,
  inventarioNoJogo,
  SLOTS_GRATIS,
  type PersonagemOnline,
} from "@/lib/cofre";
import { meuCofreDePals, palsNoJogo } from "@/lib/pal-cofre";
import { GuardarNoCofre, ItensDoCofre, BotaoSlot } from "./formularios";
import {
  GuardarPals,
  ResgatarPal,
  AnunciarPal,
  SemearPalDeTeste,
} from "./pals/formularios";

export const metadata: Metadata = {
  title: "Cofre",
  description:
    "Guarde Pals e itens fora do jogo para vender no mercado quando quiser.",
};

// O cofre é inventário e saldo: nunca pode vir de cache.
export const dynamic = "force-dynamic";

type Aba = "itens" | "pals";

export default async function Cofre({
  searchParams,
}: {
  searchParams: Promise<{ srv?: string; tab?: string }>;
}) {
  const [session, { srv, tab: tabParam }] = await Promise.all([
    auth(),
    searchParams,
  ]);
  if (!session) redirect("/entrar");
  const discordId = session.user.discordId;
  const aba: Aba = tabParam === "pals" ? "pals" : "itens";

  const [vinculo, cofre, paletas, cofreDePals] = await Promise.all([
    meuVinculo(discordId),
    meuCofre(discordId),
    saldo(discordId),
    meuCofreDePals(discordId),
  ]);

  // Sem personagem provado não há de quem tirar nem para quem entregar.
  if (!vinculo) {
    return (
      <>
        <Cabecalho />
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-6">
            <h2 className="font-semibold">Falta vincular seu personagem</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">
              O cofre tira item de dentro do jogo e devolve para lá. Para isso o
              site precisa saber qual personagem é você — a prova chega pelo
              chat do jogo e leva menos de um minuto.
            </p>
            <Link
              href="/vincular"
              className="mt-4 inline-flex rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
            >
              Vincular personagem
            </Link>
          </div>
        </div>
      </>
    );
  }

  const onde = await ondeEstouOnline(discordId);

  // Quem está com o jogo aberto em dois servidores escolhe de qual mochila
  // está olhando. O `?srv=` só vale se ela estiver mesmo online lá — vindo de
  // um link velho ou editado à mão, cai no primeiro em vez de dar erro.
  const escolhido = onde.find((o) => o.serverSlug === srv) ?? onde[0] ?? null;

  // Só busca o que depende do jogo (RCON) para a aba que está na tela.
  const mochila =
    aba === "itens" && escolhido
      ? await inventarioNoJogo(discordId, escolhido.serverSlug)
      : { itens: [], erro: "" };
  const disponiveis =
    aba === "pals" && escolhido
      ? await palsNoJogo(discordId, escolhido.serverSlug)
      : { pals: [], erro: "" };

  const cheio = cofre.usados >= cofre.total;
  const ehStaff = isStaff(levelOf(session.user.roles, session.user.isMember));

  return (
    <>
      <Cabecalho />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <Abas
          ativo={aba}
          srv={escolhido?.serverSlug}
          contagemItens={cofre.usados}
          contagemPals={cofreDePals.length}
        />

        {aba === "itens" ? (
          <SecaoItens
            cofre={cofre}
            paletas={paletas}
            onde={onde}
            escolhido={escolhido}
            mochila={mochila}
            cheio={cheio}
            vinculoNome={vinculo.playerName}
          />
        ) : (
          <SecaoPals
            cofre={cofreDePals}
            onde={onde}
            escolhido={escolhido}
            disponiveis={disponiveis}
            vinculoNome={vinculo.playerName}
            ehStaff={ehStaff}
          />
        )}
      </div>
    </>
  );
}

function Cabecalho() {
  return (
    <PageHeader
      kicker="Cofre"
      title="Seu cofre"
      description="O que está aqui saiu do jogo e está guardado pelo site. Dá para vender a qualquer hora, com você offline, e resgatar no servidor que quiser."
    />
  );
}

/* --------------------------------------------------------------------- abas */

function Abas({
  ativo,
  srv,
  contagemItens,
  contagemPals,
}: {
  ativo: Aba;
  srv?: string;
  contagemItens: number;
  contagemPals: number;
}) {
  const href = (tab: Aba) =>
    `/painel/cofre?tab=${tab}${srv ? `&srv=${srv}` : ""}`;

  const classe = (ligado: boolean) =>
    `rounded-[var(--radius-control)] border px-4 py-2 text-sm font-semibold transition-colors ${
      ligado
        ? "border-gold bg-gold/[0.08] text-gold"
        : "border-line-strong text-muted hover:border-gold hover:text-gold"
    }`;

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <Link href={href("itens")} className={classe(ativo === "itens")}>
        Itens <span className="tabular">· {contagemItens}</span>
      </Link>
      <Link href={href("pals")} className={classe(ativo === "pals")}>
        Pals <span className="tabular">· {contagemPals}</span>
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------- aba: itens */

function SecaoItens({
  cofre,
  paletas,
  onde,
  escolhido,
  mochila,
  cheio,
  vinculoNome,
}: {
  cofre: Awaited<ReturnType<typeof meuCofre>>;
  paletas: number;
  onde: PersonagemOnline[];
  escolhido: PersonagemOnline | null;
  mochila: Awaited<ReturnType<typeof inventarioNoJogo>>;
  cheio: boolean;
  vinculoNome: string;
}) {
  return (
    <>
      {/* ----------------------------------------------------------- estado */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">
            Slots do cofre
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tabular text-5xl font-bold tracking-tight">
              {cofre.usados}
            </span>
            <span className="tabular text-2xl text-muted">
              / {cofre.total}
            </span>
          </div>
          <p className="mt-4 max-w-md text-sm text-muted">
            Cada <b className="text-text">tipo</b> de item ocupa um slot — a
            quantidade não importa. Juntar 500 balas numa pilha que já existe
            é de graça; guardar um item novo é que pede espaço.
          </p>
          <p className="mt-2 text-sm text-muted">
            Os {SLOTS_GRATIS} primeiros são seus. Do quarto em diante o preço
            dobra a cada slot.
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="font-semibold">Mais espaço</h2>
          <p className="mt-2 text-sm text-muted">
            O slot {cofre.total + 1} custa{" "}
            <b className="text-text tabular">{cofre.precoDoProximo}</b>{" "}
            Paletas. Você tem{" "}
            <span className="inline-flex items-baseline gap-1 align-baseline">
              <Pick className="size-3.5 translate-y-0.5" withLetter={false} />
              <b className="tabular text-text">{paletas}</b>
            </span>
            .
          </p>
          <div className="mt-4">
            <BotaoSlot preco={cofre.precoDoProximo} />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ o que está lá */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">No cofre</h2>
          {cofre.itens.length > 0 && (
            <Link
              href="/mercado/vender"
              className="text-sm font-semibold text-gold hover:text-gold-hi"
            >
              Anunciar no mercado →
            </Link>
          )}
        </div>

        {cofre.itens.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">
            Cofre vazio. Entre no jogo, coloque na mochila o que quiser
            vender e guarde aqui — depois disso você pode anunciar a
            qualquer hora, mesmo offline.
          </p>
        ) : (
          <div className="mt-3">
            <ItensDoCofre itens={cofre.itens} onde={onde} />
          </div>
        )}
      </section>

      {/* -------------------------------------------------- guardar do jogo */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Guardar do jogo</h2>

        {/* Duas mochilas abertas: a pessoa diz qual está olhando */}
        {onde.length > 1 && escolhido && (
          <div className="mt-3 flex flex-wrap gap-2">
            {onde.map((o) => (
              <Link
                key={o.serverSlug}
                href={`/painel/cofre?tab=itens&srv=${o.serverSlug}`}
                className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  o.serverSlug === escolhido.serverSlug
                    ? "border-gold bg-gold/[0.08] text-gold"
                    : "border-line-strong text-muted hover:border-gold hover:text-gold"
                }`}
              >
                {o.serverName}
              </Link>
            ))}
          </div>
        )}

        {!escolhido ? (
          <div className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <p className="text-sm text-muted">
              Você não está no jogo agora. O inventário só existe enquanto o
              servidor tem você conectado — é por isso que o cofre existe:
              guarde uma vez, venda quando quiser.
            </p>
            <p className="mt-2 text-sm text-muted">
              Entre em <b className="text-text">{vinculoNome}</b> num
              servidor PvE e recarregue esta página.
            </p>
          </div>
        ) : mochila.erro ? (
          <p className="mt-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-6 text-sm">
            {mochila.erro}
          </p>
        ) : mochila.itens.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">
            Sua mochila está vazia no {escolhido.serverName}.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Mochila de <b className="text-text">{escolhido.name}</b> no{" "}
              {escolhido.serverName}
              {cheio && (
                <span className="text-warning">
                  {" "}
                  · cofre cheio: só dá para somar em pilha que já existe
                </span>
              )}
            </p>
            <div className="mt-3">
              <GuardarNoCofre
                itens={mochila.itens}
                servidor={escolhido.serverSlug}
              />
            </div>
          </>
        )}
      </section>

      <p className="mt-8 max-w-2xl text-xs text-muted">
        Item guardado sai do jogo de verdade — não é cópia. Toda entrada e
        saída fica registrada com a resposta do servidor ao lado, então
        nenhuma transferência some sem deixar rastro.
      </p>
    </>
  );
}

/* --------------------------------------------------------------- aba: pals */

function SecaoPals({
  cofre,
  onde,
  escolhido,
  disponiveis,
  vinculoNome,
  ehStaff,
}: {
  cofre: Awaited<ReturnType<typeof meuCofreDePals>>;
  onde: PersonagemOnline[];
  escolhido: PersonagemOnline | null;
  disponiveis: Awaited<ReturnType<typeof palsNoJogo>>;
  vinculoNome: string;
  ehStaff: boolean;
}) {
  return (
    <>
      {/* ----------------------------------------------------------- estado */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">
          Pals no cofre
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="tabular text-5xl font-bold tracking-tight">
            {cofre.length}
          </span>
        </div>
        <p className="mt-4 max-w-md text-sm text-muted">
          Sem limite de vagas — guardar Pal não gasta slot nem Paleta,
          diferente do cofre de itens.
        </p>
      </div>

      {/* ------------------------------------------------------ o que está lá */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">No cofre</h2>

        {cofre.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">
            Nenhum Pal guardado ainda. Entre no jogo e guarde um lá embaixo.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cofre.map((p) => (
              <div
                key={p.id}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
              >
                <Link
                  href={`/painel/cofre/pals/${p.id}`}
                  className="block hover:opacity-90"
                >
                  <PalCard
                    pal={{
                      palId: p.palId,
                      nickname: p.template.Nickname as string,
                      level: (p.template.Level as number) ?? 1,
                      gender: p.template.Gender as string,
                      shiny: p.template.Shiny as boolean,
                      condensedPals: p.template.CondensedPals as number,
                      ivs: p.template.IVs as Record<string, number>,
                      passives: p.template.Passives as string[],
                    }}
                  />
                </Link>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <AnunciarPal pal={{ id: p.id, palId: p.palId }} />
                  <ResgatarPal pal={{ id: p.id, palId: p.palId }} onde={onde} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- guardar do jogo */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Guardar do jogo</h2>

        {onde.length > 1 && escolhido && (
          <div className="mt-3 flex flex-wrap gap-2">
            {onde.map((o) => (
              <Link
                key={o.serverSlug}
                href={`/painel/cofre?tab=pals&srv=${o.serverSlug}`}
                className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  o.serverSlug === escolhido.serverSlug
                    ? "border-gold bg-gold/[0.08] text-gold"
                    : "border-line-strong text-muted hover:border-gold hover:text-gold"
                }`}
              >
                {o.serverName}
              </Link>
            ))}
          </div>
        )}

        {!escolhido ? (
          <div className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <p className="text-sm text-muted">
              Você não está no jogo agora. Entre em{" "}
              <b className="text-text">{vinculoNome}</b> num servidor PvE e
              recarregue esta página.
            </p>
          </div>
        ) : disponiveis.erro ? (
          <p className="mt-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-6 text-sm">
            {disponiveis.erro}
          </p>
        ) : disponiveis.pals.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">
            Nenhum Pal no time nem na palbox do {escolhido.serverName}.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Time e palbox de <b className="text-text">{escolhido.name}</b>{" "}
              no {escolhido.serverName}
            </p>
            <div className="mt-3">
              <GuardarPals
                pals={disponiveis.pals}
                servidor={escolhido.serverSlug}
              />
            </div>
          </>
        )}
      </section>

      <p className="mt-8 max-w-2xl text-xs text-muted">
        Só Pals do <b className="text-text">time</b> e da{" "}
        <b className="text-text">palbox</b> entram no cofre — os que estão
        trabalhando numa base ficam de fora, para a base não perder produção
        sem avisar.
      </p>

      {ehStaff && <SemearPalDeTeste />}
    </>
  );
}
