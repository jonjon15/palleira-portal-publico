import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = {
  title: "Mercado",
  description:
    "Compre e venda Pals e itens entre jogadores da Palleira BR usando Paletas.",
};

export default function Mercado() {
  return (
    <>
      <PageHeader
        kicker="Mercado"
        title="Mercado de Pals e itens"
        description="Compra e venda entre jogadores, pago em Paletas, com entrega automática no jogo."
      />
      <ComingSoon
        what="O mercado ainda está sendo montado"
        items={[
          "Cofre na nuvem: você guarda Pal e item no site e vende quando quiser",
          "Ficha completa do Pal — level, passivas, IVs e almas, tirada do próprio jogo",
          "Entrega automática: ninguém precisa estar online ao mesmo tempo",
          "Pagamento em Paletas, com o saldo que você já tem no Discord",
          "Taxa de venda queimada, para a economia não inflacionar",
        ]}
      />
    </>
  );
}
