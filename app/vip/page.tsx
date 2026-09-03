import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";

export const metadata: Metadata = { title: "VIP" };

/**
 * Vitrine dos planos VIP — protótipo estático (§7.13 do PROMPT.md).
 *
 * Ainda não cobra nada: é a página pra aprovar o layout e os textos antes de
 * plugar um checkout de verdade. Os benefícios de site (daily maior, mais
 * slots no cofre) já são reais e automáticos assim que o cargo é dado no
 * Discord — o resto da lista (moedas, cristais, boosters) é entregue no
 * jogo pelo Palbot/administração, não pelo site.
 */

interface PlanoVip {
  key: string;
  nome: string;
  preco: number;
  paletasNoMes: number;
  dailyPaletas: number;
  slotsCofre: number;
  destaque?: boolean;
  beneficiosDoJogo: string[];
}

const PLANOS_VIP: PlanoVip[] = [
  {
    key: "hardMetal",
    nome: "Hard Metal",
    preco: 20,
    paletasNoMes: 30,
    dailyPaletas: 4,
    slotsCofre: 2,
    beneficiosDoJogo: [
      "Whitelist do PVE VIP",
      "Dobro de prêmio em evento",
      "3 Paletas de desconto em kit e Pal Monster",
      "1.000 moedas cachorro",
      "50 cristais de prata",
      "30 esferas soraliticas",
      "20 esferas antigas",
      "20 núcleos de IA",
      "1 booster",
    ],
  },
  {
    key: "newMetal",
    nome: "New Metal",
    preco: 40,
    paletasNoMes: 60,
    dailyPaletas: 8,
    slotsCofre: 3,
    beneficiosDoJogo: [
      "Tudo do Hard Metal",
      "4 Paletas de desconto em kit e Pal Monster",
      "2.000 moedas cachorro",
      "200 bilhetes de batalha",
      "200 provas de recompensa",
      "80 cristais de prata",
      "50 esferas soraliticas",
      "30 esferas antigas",
      "30 núcleos de IA",
      "2 boosters",
    ],
  },
  {
    key: "palleira",
    nome: "Palleira",
    preco: 60,
    paletasNoMes: 90,
    dailyPaletas: 12,
    slotsCofre: 4,
    destaque: true,
    beneficiosDoJogo: [
      "Tudo do New Metal",
      "5 Paletas de desconto em kit e Pal Monster",
      "2.500 moedas cachorro",
      "350 bilhetes de batalha",
      "350 provas de recompensa",
      "120 cristais de prata",
      "80 esferas soraliticas",
      "50 esferas antigas",
      "50 núcleos de IA",
      "4 boosters",
    ],
  },
];

export default function Vip() {
  return (
    <>
      <PageHeader
        kicker="Assinatura"
        title="VIP Palleira"
        description="Três degraus, um cargo no Discord cada. Assinando, o site já reconhece o plano sozinho — daily maior e mais espaço no cofre saem na hora."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          {PLANOS_VIP.map((plano) => (
            <div
              key={plano.key}
              className={`flex flex-col rounded-[var(--radius-card)] border p-6 ${
                plano.destaque
                  ? "border-gold bg-gold/[0.06]"
                  : "border-line bg-surface"
              }`}
            >
              {plano.destaque && (
                <span className="mb-3 w-fit rounded-full bg-gold px-2.5 py-0.5 text-[0.65rem] font-bold tracking-wider text-[#14120f] uppercase">
                  Melhor plano
                </span>
              )}

              <h2 className="text-xl font-bold">{plano.nome}</h2>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="tabular text-3xl font-bold tracking-tight">
                  R$ {plano.preco}
                </span>
                <span className="text-sm text-muted">/mês</span>
              </p>

              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted">
                <Pick className="size-4" withLetter={false} />
                <span className="tabular font-semibold text-text">
                  +{plano.paletasNoMes}
                </span>
                Paletas na assinatura
              </p>

              <div className="mt-4 rounded-[var(--radius-control)] border border-dashed border-line-strong p-3 text-sm text-muted">
                No site, automático: daily de{" "}
                <b className="tabular text-text">{plano.dailyPaletas}</b> por
                dia e{" "}
                <b className="tabular text-text">{plano.slotsCofre}</b> slots
                grátis no cofre (item e Pal).
              </div>

              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plano.beneficiosDoJogo.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-gold">✓</span>
                    <span className="text-muted">{b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <span className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line-strong px-5 py-2.5 text-sm font-semibold text-muted">
                  Assinar
                  <span className="rounded-full border border-line-strong px-2 py-0.5 text-[0.6rem] tracking-wide uppercase">
                    Em breve
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-2xl text-xs text-muted">
          Os benefícios de jogo (moedas, cristais, boosters, whitelist) são
          entregues pela administração — a cobrança automática ainda está em
          construção. Enquanto isso, quem quiser assinar fala com um admin no
          Discord.
        </p>
      </div>
    </>
  );
}
