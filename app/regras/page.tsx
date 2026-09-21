import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import {
  BlocoDeRegras,
  DOMINANTES,
  type Secao,
} from "@/lib/regras-dominantes";

export const metadata: Metadata = {
  title: "Regras",
  description:
    "As regras da comunidade Palleira e de cada servidor — PvE e Dominantes.",
};

/**
 * As regras da comunidade (§5.1 do PROMPT.md).
 *
 * Estava no rodapé de todo o site dando 404 desde o começo (achado em
 * 12/09/2026, junto com /privacidade).
 *
 * 🔴 **O texto veio dos canais de regras do Discord, não foi escrito aqui.**
 * `📰┇regras-palleira` (PVE) e `📰┇regras-palleira-br-dominantes` (PvP),
 * lidos pelo bot em 12/09/2026. Só a formatação mudou — a redação, a ordem e
 * o peso de cada regra são os do dono.
 *
 * A seção Dominantes foi atualizada em 21/09/2026 a partir de
 * `REGRAS DOMINANTE.txt` (fornecido pelo dono fora do Discord), que é mais
 * completo que o canal: acrescenta o reset de personagem (1×/mês) e a regra
 * de Pal voador (locomoção em modo pacífico ok, ataque é infração).
 *
 * Quando a regra mudar no Discord, ela precisa mudar aqui à mão: a página é
 * estática de propósito. Regra que depende da API do Discord estar de pé é
 * regra que some da tela no pior momento.
 */

/* ------------------------------------------------------- vale para todos */

const GERAIS: Secao[] = [
  {
    emoji: "🤝",
    titulo: "Respeito é obrigatório",
    regras: [
      {
        texto:
          "Racismo, homofobia, transfobia, misoginia, xenofobia, discurso de ódio ou qualquer forma de discriminação não serão tolerados.",
        proibido: true,
      },
      {
        texto:
          "Comportamento tóxico — provocação excessiva, assédio, intimidação, humilhação ou perseguição de outros players — está sujeito a penalidades.",
        proibido: true,
      },
      {
        texto:
          "O descumprimento pode resultar em mute, kick, banimento temporário ou banimento permanente, conforme a gravidade, sem aviso prévio.",
      },
    ],
  },
  {
    emoji: "🛡️",
    titulo: "Staff",
    regras: [
      { texto: "As decisões da staff devem ser respeitadas." },
      { texto: "Desrespeito à staff também é passível de punição." },
      {
        texto:
          "A staff atua para manter o servidor equilibrado, funcional e saudável para todos.",
      },
    ],
  },
  {
    emoji: "💛",
    titulo: "Sobre as doações",
    regras: [
      { texto: "As doações são totalmente voluntárias." },
      {
        texto:
          "Todo valor arrecadado é destinado exclusivamente à manutenção, melhoria e sustentação do servidor.",
      },
      {
        texto:
          "Doações não garantem imunidade a punições, privilégios administrativos ou tratamento diferenciado.",
        proibido: true,
      },
      {
        texto:
          "Não há reembolso em caso de banimento, saída do servidor ou qualquer outra situação.",
      },
    ],
  },
];

/* ------------------------------------------------------------------- PvE */

const PVE: Secao[] = [
  {
    emoji: "🏗️",
    titulo: "Construção e bases",
    regras: [
      {
        texto:
          "É extremamente proibido empilhar plantações, construções e farms.",
        proibido: true,
      },
      {
        texto: "Proibido fazer base na área inicial do Planalto.",
        proibido: true,
      },
    ],
  },
];

/* ------------------------------------------------------------ Dominantes */
//
// Vive em `lib/regras-dominantes.tsx`, compartilhado com a página
// `/dominantes` (o hub do servidor) — ver o comentário lá.

/* ------------------------------------------------------------ componentes */

export default function Regras() {
  return (
    <>
      <PageHeader
        kicker="Comunidade"
        title="Regras"
        description="Ao entrar e jogar nos servidores da Palleira, você concorda com tudo que está aqui."
      />

      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-lg text-muted">
          O objetivo é um só: manter um ambiente justo, equilibrado e
          respeitoso para toda a comunidade.
        </p>

        {/* ----------------------------------------------- todos os servidores */}
        <h2 className="mt-12 text-xl font-bold tracking-tight">
          Vale em todos os servidores
        </h2>
        <BlocoDeRegras secoes={GERAIS} />

        {/* ---------------------------------------------------------- PvE */}
        <h2 className="mt-14 text-xl font-bold tracking-tight">
          PvE <span className="text-muted">— Free e VIP</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          Além das regras gerais acima.
        </p>
        <BlocoDeRegras secoes={PVE} />

        {/* --------------------------------------------------- Dominantes */}
        <h2 className="mt-14 text-xl font-bold tracking-tight">
          Dominantes <span className="text-muted">— PvP</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          O servidor competitivo tem regras próprias, além das gerais.
        </p>
        <BlocoDeRegras secoes={DOMINANTES} />

        {/* ------------------------------------------------------- rodapé */}
        <div className="mt-12 rounded-[var(--radius-card)] border border-gold/30 bg-gold/[0.05] p-5">
          <p className="text-sm">
            <b>Ao permanecer no servidor, você concorda com todas as regras
            acima.</b>{" "}
            <span className="text-muted">
              Dúvida sobre alguma delas? Chame a staff no Discord da Palleira.
              Bom jogo e boa competição! 🎸🔥
            </span>
          </p>
        </div>
      </div>
    </>
  );
}
