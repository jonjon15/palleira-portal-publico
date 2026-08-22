import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entre no portal da Palleira BR com sua conta do Discord.",
};

export default function Entrar() {
  return (
    <>
      <PageHeader
        kicker="Entrar"
        title="Login com Discord"
        description="Sua conta do Discord é a sua conta aqui. Sem cadastro, sem senha nova."
      />
      <ComingSoon
        what="O login ainda está sendo ligado"
        items={[
          "Entrar com um clique pelo Discord, sem criar senha",
          "Seus cargos do Palleira BR viram permissões no site",
          "Vincular o personagem do jogo à conta — Steam, Xbox ou PlayStation",
          "Carteira de Paletas com extrato de tudo que entrou e saiu",
          "Endereço dos servidores liberado depois do login",
        ]}
      />
    </>
  );
}
