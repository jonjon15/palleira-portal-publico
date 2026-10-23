/**
 * As regras do Dominantes, compartilhadas entre `/regras` (onde vivem junto
 * com as regras gerais e as do PVE) e `/dominantes` (o hub do servidor, que
 * as mostra sozinhas). Um módulo só, para não editar o mesmo texto em dois
 * lugares quando a regra mudar.
 *
 * Fonte: o canal `📰┇regras-palleira-br-dominantes` e o fórum
 * `📌┇®registro-de-player`, relidos no wipe de 10/2026 (pedido do Lobo em
 * 19/10). Saíram os elementos, o uso de Pal por elemento, o limite de 2
 * bases, o reset mensal e a arena do nível 40 — nada disso está mais nas
 * regras do Discord. Como toda regra do site, é estática de propósito:
 * mudou no Discord, muda aqui à mão.
 */

export interface Regra {
  texto: string;
  /** Proibição direta — ganha destaque visual de alerta. */
  proibido?: boolean;
}

export interface Secao {
  emoji: string;
  titulo: string;
  intro?: string;
  regras: Regra[];
  /** Imagem abaixo das regras — um print do mapa, por exemplo. */
  imagem?: { src: string; alt: string; legenda?: string };
}

export const DOMINANTES: Secao[] = [
  {
    emoji: "⚔️",
    titulo: "PvP e combate",
    intro:
      "PvP liberado apenas nas 2 plataformas do jogo e na ilha de eventos. Fora delas, ninguém ataca ninguém.",
    regras: [
      { texto: "O drop de mochila está ativado." },
      { texto: "A fuga emergencial está desativada." },
      {
        texto:
          "Proibido usar qualquer mod, hack, macro, exploit ou programa que dê vantagem indevida.",
        proibido: true,
      },
    ],
    imagem: {
      src: "/dominantes/ilha-pvp.png",
      alt: "Mapa do jogo com a ilha de eventos PvP circulada em vermelho, a leste do continente.",
      legenda: "A ilha de eventos PvP, circulada no mapa.",
    },
  },
  {
    emoji: "📜",
    titulo: "Linhagem e registro",
    intro: "Duas raças disputam o mundo: Daemon e Kryos.",
    regras: [
      {
        texto:
          "Registro obrigatório no fórum 📌┇®registro-de-player do Discord ANTES de jogar, com o nome do personagem e a raça.",
      },
      {
        texto:
          "Caracterização obrigatória — Kryos: pele azul, cabelo branco e barba branca. Daemon: pele vermelha, cabelo preto e barba preta.",
      },
      {
        texto: "Proibido trocar a cor da pele depois do registro.",
        proibido: true,
      },
    ],
  },
  {
    emoji: "🏰",
    titulo: "Território e bases",
    intro:
      "Cada guilda constrói dentro do bioma da sua raça — mas você não nasce nele. O segundo bioma será liberado por jornada.",
    regras: [
      {
        texto:
          "Até o level 30 você pode fazer base temporária nas áreas iniciais, enquanto chega ao seu bioma.",
      },
      {
        texto:
          "Depois do level 30 é obrigatório estar no bioma da sua raça. Nas áreas iniciais só fica permitida a Palpedia, para capturar os comerciantes lendários.",
      },
      {
        texto:
          "Proibido construir em área de boss ou de teleporte de um jeito que atrapalhe o livre trânsito ou impeça outro jogador de pegar as estátuas.",
        proibido: true,
      },
      {
        texto:
          "Proibido usar guilda fake ou conta secundária para ter mais bases.",
        proibido: true,
      },
    ],
  },
];

export function BlocoDeRegras({ secoes }: { secoes: Secao[] }) {
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
          {s.imagem && (
            <figure className="mt-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.imagem.src}
                alt={s.imagem.alt}
                loading="lazy"
                className="w-full rounded-[var(--radius-card)] border border-line"
              />
              {s.imagem.legenda && (
                <figcaption className="mt-2 text-xs text-muted">
                  {s.imagem.legenda}
                </figcaption>
              )}
            </figure>
          )}
        </section>
      ))}
    </div>
  );
}
