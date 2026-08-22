import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { SignIn } from "@/components/sign-in-button";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entre no portal da Palleira BR com sua conta do Discord.",
};

const BENEFITS = [
  "Sua conta do Discord é a sua conta aqui — sem senha nova",
  "Seus cargos da Palleira viram permissões no site",
  "Vincule o personagem do jogo: Steam, Xbox ou PlayStation",
  "Carteira de Paletas com extrato de tudo que entrou e saiu",
  "Comprar e vender Pals e itens no mercado",
];

export default async function Entrar() {
  const session = await auth();
  if (session) redirect("/painel");

  return (
    <>
      <PageHeader
        kicker="Entrar"
        title="Entrar com Discord"
        description="A comunidade já vive no Discord. O site usa a mesma conta — nada de cadastro novo."
      />

      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <SignIn full />

          <ul className="mt-6 space-y-2.5">
            {BENEFITS.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm">
                <span className="text-gold" aria-hidden>
                  •
                </span>
                <span className="text-muted">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Pedimos só o essencial: quem você é, de quais servidores participa e
          seus cargos na Palleira. Não lemos suas mensagens e não entramos em
          servidor nenhum.
        </p>
      </div>
    </>
  );
}
