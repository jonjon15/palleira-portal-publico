import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

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
 * Quando a regra mudar no Discord, ela precisa mudar aqui à mão: a página é
 * estática de propósito. Regra que depende da API do Discord estar de pé é
 * regra que some da tela no pior momento.
 */

interface Regra {
  texto: string;
  /** Proibição direta — ganha destaque visual de alerta. */
  proibido?: boolean;
}

interface Secao {
  emoji: string;
  titulo: string;
  intro?: string;
  regras: Regra[];
}

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

const DOMINANTES: Secao[] = [
  {
    emoji: "⚔️",
    titulo: "PvP e combate",
    intro:
      "PvP liberado no mapa, com drop de mochila. A base é área segura.",
    regras: [
      {
        texto:
          "Proibido matar jogadores dentro da base, e também atacar de dentro da base alguém que está do lado de fora.",
        proibido: true,
      },
      { texto: "Proibido atacar Pals dentro da base.", proibido: true },
      {
        texto:
          "Proibido usar qualquer mod, hack, macro, exploit ou programa que dê vantagem indevida.",
        proibido: true,
      },
    ],
  },
  {
    emoji: "📜",
    titulo: "Linhagem e registro",
    intro:
      "O Dominantes tem sistema de elementos: sua raça define como você joga.",
    regras: [
      {
        texto:
          "Sua raça é o seu elemento primário: Fogo, Gelo, Grama ou Terra.",
      },
      {
        texto:
          "O elemento secundário você escolhe entre Elétrico, Água, Dragão ou Sombra.",
      },
      { texto: "O elemento Neutro pode ser usado por todos." },
      {
        texto:
          "Registro obrigatório no canal de registro de player ANTES de jogar.",
      },
      { texto: "A primeira disputa de arena é só no nível 40." },
      {
        texto:
          "Proibido trocar a cor da pele depois do registro para mudar de elemento.",
        proibido: true,
      },
    ],
  },
  {
    emoji: "🏰",
    titulo: "Território e bases",
    intro:
      "Cada guilda constrói dentro do seu bioma — mas você não nasce nele.",
    regras: [
      {
        texto:
          "Até o nível 30 você pode fazer base temporária em qualquer lugar, para conseguir chegar ao seu bioma.",
      },
      {
        texto:
          "Depois do nível 30 é obrigatório estar no bioma. Base fora dele é irregular.",
      },
      { texto: "Limite de 2 bases por guilda." },
      {
        texto:
          "Proibido usar guilda fake ou conta secundária para ter mais bases.",
        proibido: true,
      },
    ],
  },
  {
    emoji: "🐾",
    titulo: "Uso de Pals",
    regras: [
      {
        texto:
          "Dentro da base: livre. Pode usar qualquer Pal para trabalhar.",
      },
      {
        texto:
          "No mundo aberto e nas arenas: proibido usar Pal fora dos elementos que você registrou.",
        proibido: true,
      },
    ],
  },
];

/* ------------------------------------------------------------ componentes */

function BlocoDeRegras({ secoes }: { secoes: Secao[] }) {
  return (
    <div className="mt-6 space-y-6">
      {secoes.map((s) => (
        <section
          key={s.titulo}
          className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
        >
          <h3 className="flex items-center gap-2 font-semibold">
            <span aria-hidden>{s.emoji}</span>
            {s.titulo}
          </h3>
          {s.intro && <p className="mt-1.5 text-sm text-muted">{s.intro}</p>}
          <ul className="mt-4 space-y-2.5">
            {s.regras.map((r) => (
              <li key={r.texto} className="flex gap-2.5 text-sm">
                <span
                  aria-hidden
                  className={
                    r.proibido
                      ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-danger"
                      : "mt-1.5 size-1.5 shrink-0 rounded-full bg-gold"
                  }
                />
                <span className={r.proibido ? "text-text" : "text-muted"}>
                  {r.texto}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

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
