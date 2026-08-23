import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { FichaDoPal } from "@/components/ficha-pal";
import { palDoCofre, ondeEstouOnline } from "@/lib/pal-cofre";
import { nomeDoPal } from "@/lib/pals";
import { ResgatarPal } from "../formularios";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await auth();
  if (!session) return { title: "Ficha do Pal" };
  const { id } = await params;
  const pal = await palDoCofre(session.user.discordId, Number(id));
  return { title: pal ? nomeDoPal(pal.palId) : "Ficha do Pal" };
}

export default async function FichaNoCofre({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/entrar");
  const { id } = await params;

  const [pal, onde] = await Promise.all([
    palDoCofre(session.user.discordId, Number(id)),
    ondeEstouOnline(session.user.discordId),
  ]);
  if (!pal) notFound();

  return (
    <>
      <PageHeader
        kicker="Cofre"
        title={(pal.template.Nickname as string) || nomeDoPal(pal.palId)}
      />

      <div className="mx-auto max-w-4xl px-4 py-12">
        <Link
          href="/painel/cofre?tab=pals"
          className="text-sm text-muted hover:text-text"
        >
          ← Seus Pals
        </Link>

        <div className="mt-4">
          <FichaDoPal template={pal.template} />
        </div>

        <div className="mt-8 flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <p className="text-sm text-muted">
            No cofre desde{" "}
            {new Date(pal.desde).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </p>
          <ResgatarPal pal={{ id: pal.id, palId: pal.palId }} onde={onde} />
        </div>
      </div>
    </>
  );
}
