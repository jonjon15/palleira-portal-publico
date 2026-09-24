import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { SignOut } from "@/components/sign-in-button";

/**
 * Portão das páginas de jogo — Mercado, VIP, Ranking, Mapa, Eventos e
 * Painel. Pedido do dono em 24/09/2026: quem não entrou ou não está no
 * Discord da Palleira não vê essas páginas, nem como vitrine.
 *
 * Fica de fora de propósito o que atrai gente nova: início, servidores,
 * como jogar, regras e privacidade.
 *
 * Vai no `layout.tsx` de cada seção, então vale para as subpáginas também.
 * As ações continuam conferindo `isMember` por conta própria — o portão é
 * só a tela, não a segurança.
 */
export async function SoMembros({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/entrar");
  if (session.user.isMember) return <>{children}</>;

  return (
    <>
      <PageHeader kicker="Só para a comunidade" title="Você ainda não está no Palleira BR" />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-6">
          <p className="text-sm text-muted">
            O login funcionou, mas você não aparece como membro do nosso
            Discord. Esta parte do site é só para a comunidade: entre no
            servidor e volte em alguns minutos.
          </p>
          <div className="mt-4">
            <SignOut />
          </div>
        </div>
      </div>
    </>
  );
}
