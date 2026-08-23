import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { meuVinculo } from "@/lib/linking";
import {
  meuCofreDePals,
  palsNoJogo,
  ondeEstouOnline,
} from "@/lib/pal-cofre";
import { isStaff, levelOf } from "@/lib/roles";
import { PalCard } from "@/components/pal-card";
import { GuardarPals, ResgatarPal, SemearPalDeTeste } from "./formularios";

export const metadata: Metadata = {
  title: "Seus Pals",
  description: "Guarde Pals fora do jogo e resgate quando quiser.",
};

export const dynamic = "force-dynamic";

export default async function CofreDePals({
  searchParams,
}: {
  searchParams: Promise<{ srv?: string }>;
}) {
  const [session, { srv }] = await Promise.all([auth(), searchParams]);
  if (!session) redirect("/entrar");
  const discordId = session.user.discordId;

  const [vinculo, cofre] = await Promise.all([
    meuVinculo(discordId),
    meuCofreDePals(discordId),
  ]);

  if (!vinculo) {
    return (
      <>
        <Cabecalho />
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-6">
            <h2 className="font-semibold">Falta vincular seu personagem</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">
              O cofre de Pal tira do jogo e devolve para lá. Para isso o site
              precisa saber qual personagem é você.
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
  const escolhido = onde.find((o) => o.serverSlug === srv) ?? onde[0] ?? null;
  const disponiveis = escolhido
    ? await palsNoJogo(discordId, escolhido.serverSlug)
    : { pals: [], erro: "" };

  return (
    <>
      <Cabecalho />

      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">No cofre</h2>
          <Link
            href="/painel/cofre"
            className="text-sm font-semibold text-gold hover:text-gold-hi"
          >
            ← Itens do cofre
          </Link>
        </div>

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
                <Link href={`/painel/cofre/pals/${p.id}`} className="block hover:opacity-90">
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
                <div className="mt-2 flex justify-end">
                  <ResgatarPal pal={{ id: p.id, palId: p.palId }} onde={onde} />
                </div>
              </div>
            ))}
          </div>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Guardar do jogo</h2>

          {onde.length > 1 && escolhido && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onde.map((o) => (
                <Link
                  key={o.serverSlug}
                  href={`/painel/cofre/pals?srv=${o.serverSlug}`}
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
                <b className="text-text">{vinculo.playerName}</b> num servidor
                PvE e recarregue esta página.
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
                <GuardarPals pals={disponiveis.pals} servidor={escolhido.serverSlug} />
              </div>
            </>
          )}
        </section>

        <p className="mt-8 max-w-2xl text-xs text-muted">
          Só Pals do <b className="text-text">time</b> e da{" "}
          <b className="text-text">palbox</b> entram no cofre — os que estão
          trabalhando numa base ficam de fora, para a base não perder
          produção sem avisar.
        </p>

        {isStaff(levelOf(session.user.roles, session.user.isMember)) && (
          <SemearPalDeTeste />
        )}
      </div>
    </>
  );
}

function Cabecalho() {
  return (
    <PageHeader
      kicker="Cofre"
      title="Seus Pals"
      description="Guarde um Pal fora do jogo e resgate quando quiser — em qualquer um dos servidores em que você joga."
    />
  );
}
