import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canPowerServer } from "@/lib/roles";
import { todosOsPalsMonster } from "@/lib/pals-monster";
import { FormularioDePalMonster, LinhaDePalMonster } from "./formularios";

export const metadata: Metadata = { title: "Pals Monster" };
export const dynamic = "force-dynamic";

export default async function PalsMonster() {
  const session = await auth();
  if (!session) redirect("/entrar");

  // Mesmo critério dos kits: quem não é da cúpula nem descobre a página.
  if (!canPowerServer(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const pals = await todosOsPalsMonster();
  const ativos = pals.filter((p) => p.ativo).length;

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="Pals Monster"
        description="Pals montados pela cúpula e vendidos na loja. Quem compra, de qualquer servidor, recebe uma cópia no cofre de Pals."
      />

      <div className="mx-auto max-w-4xl px-4 py-12">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Pôr um Pal Monster na vitrine</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Cole o JSON do Pal uma vez: cada compra gera uma cópia nova, então
            não precisa ter o Pal na palbox nem recolocar depois de vender. As
            Paletas pagas são <b className="text-text">queimadas</b>, como nos
            kits.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-muted">
            A cópia cai no cofre de Pals do comprador sem trava de servidor e
            sem espera: ele resgata na hora, no PVE Free ou no Dominantes.
            Estoque vazio é ilimitado; com número, o Pal some da vitrine
            quando esgota. O despertar não passa pelo JSON — o jogo ignora
            esse campo na entrega. As estrelas vêm de{" "}
            <code className="rounded bg-surface-2 px-1 text-[0.95em]">PartnerSkillLevel</code>.
          </p>
          <div className="mt-5">
            <FormularioDePalMonster />
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Cadastrados</h2>
            <span className="text-sm text-muted">
              {ativos} na vitrine · {pals.length} no total
            </span>
          </div>
          {pals.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhum ainda. Monte o primeiro acima.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {pals.map((p) => (
                <LinhaDePalMonster key={p.id} pal={p} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
