/**
 * As regras do Dominantes, compartilhadas entre `/regras` (onde vivem junto
 * com as regras gerais e as do PVE) e `/dominantes` (o hub do servidor, que
 * as mostra sozinhas). Um módulo só, para não editar o mesmo texto em dois
 * lugares quando a regra mudar.
 *
 * Fonte: `REGRAS DOMINANTE.txt` (fornecido pelo dono, 21/09/2026) — mais
 * completo que o canal do Discord (`📰┇regras-palleira-br-dominantes`), que
 * é a fonte original de antes dessa data. Como toda regra do site, é
 * estática de propósito: mudou no Discord ou no arquivo, muda aqui à mão.
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
}

export const DOMINANTES: Secao[] = [
  {
    emoji: "⚔️",
    titulo: "PvP e combate",
    intro: "PvP liberado no mapa, com drop de mochila. A base é área segura.",
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
          "Registro obrigatório no canal #📋registro-player ANTES de começar a jogar.",
      },
      {
        texto:
          "É obrigatório manter a aparência correspondente à raça escolhida no registro.",
      },
      { texto: "É permitido 1 reset de personagem por mês." },
      { texto: "A primeira disputa de arena é só a partir do nível 40." },
      {
        texto:
          "Proibido trocar a cor da pele depois do registro para mudar ou burlar o elemento escolhido.",
        proibido: true,
      },
    ],
  },
  {
    emoji: "🏰",
    titulo: "Território e bases",
    intro:
      "Cada guilda constrói sua base definitiva dentro do bioma da sua raça/elemento — mas você não nasce nele.",
    regras: [
      {
        texto:
          "Até o nível 30 você pode fazer base temporária em qualquer lugar do mapa, para conseguir chegar ao seu bioma.",
      },
      {
        texto:
          "A partir do nível 30 é obrigatório estar estabelecido dentro do seu bioma. Base permanente fora dele é irregular.",
      },
      { texto: "Limite de 2 bases por guilda." },
      {
        texto:
          "Proibido usar guilda falsa, conta secundária ou qualquer outro método para ter bases adicionais.",
        proibido: true,
      },
      {
        texto:
          "Proibido atacar jogadores dentro de suas bases, e também atacar de dentro da base alguém que está do lado de fora.",
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
          "Dentro da base: livre. Pode usar qualquer Pal para trabalhar, independente do elemento.",
      },
      {
        texto:
          "No mundo aberto e nas arenas: proibido usar Pal fora dos elementos que você registrou.",
        proibido: true,
      },
      {
        texto:
          "Pal voador é liberado para locomoção pelo mapa, desde que em modo pacífico.",
      },
      {
        texto:
          "Se o Pal voador for usado para atacar outro jogador, isso é infração e está sujeito a punição.",
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
        </section>
      ))}
    </div>
  );
}
