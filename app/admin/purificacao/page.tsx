import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { isStaff, levelOf } from "@/lib/roles";
import { rituaisAguardandoRegra } from "@/lib/purificacao";
import { todasAsPassivas } from "@/lib/passivas";
import { FormularioRegra } from "./formularios";

export const metadata: Metadata = { title: "Câmara de Purificação" };
export const dynamic = "force-dynamic";

export default async function AdminPurificacao() {
  const session = await auth();
  if (!session) redirect("/entrar");

  if (!isStaff(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const [pendentes, passivas] = await Promise.all([
    rituaisAguardandoRegra(),
    Promise.resolve(todasAsPassivas()),
  ]);

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="Câmara de Purificação"
        description="Defina quais passivas os doadores precisam ter em cada ritual antes de liberar as doações."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <section>
          <h2 className="text-lg font-semibold">Aguardando regra</h2>
          {pendentes.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhum ritual esperando definição agora.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {pendentes.map((r) => (
                <FormularioRegra
                  key={r.id}
                  ritual={{ id: r.id, palId: r.palId, template: r.template }}
                  passivas={passivas}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
