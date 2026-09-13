"use client";

import { useState } from "react";

/**
 * A tabela de jogadores do placar, ordenável por clique no cabeçalho.
 *
 * Existe como componente de cliente por um motivo de custo: as duas páginas
 * de ranking são cacheadas por 2 minutos (`revalidate = 120`), e montar cada
 * linha lê a palbox de todo mundo que está online. Ordenar pela URL faria a
 * página virar dinâmica e essa leitura aconteceria a cada visita — aqui os
 * dados chegam prontos uma vez e a reordenação é local, sem tocar no
 * servidor.
 *
 * As duas páginas usam este mesmo componente: o ranking geral mostra a
 * coluna Servidor e o do Dominantes não, que é a única diferença entre elas.
 */

export interface LinhaDoPlacar {
  chave: string;
  nome: string;
  online: boolean;
  servidor?: string;
  level: number;
  pals: number;
  poderHp: number | null;
  poderLevel: number | null;
  poderIvs: number | null;
  /** Medido agora, com a pessoa no jogo — em vez de vir guardado do banco. */
  poderAoVivo: boolean;
  poderEm: string | null;
}

/** As colunas por onde dá para ordenar, e como cada uma se compara. */
const CRITERIOS = {
  level: (l: LinhaDoPlacar) => l.level,
  pals: (l: LinhaDoPlacar) => l.pals,
  poder: (l: LinhaDoPlacar) => l.poderHp,
  somaLv: (l: LinhaDoPlacar) => l.poderLevel,
  somaIv: (l: LinhaDoPlacar) => l.poderIvs,
} as const;

type Criterio = keyof typeof CRITERIOS;

const MEDAL = ["text-gold", "text-[#c9c9c9]", "text-[#c08457]"];

export function TabelaJogadores({
  linhas,
  mostrarServidor = false,
}: {
  linhas: LinhaDoPlacar[];
  mostrarServidor?: boolean;
}) {
  const [ordem, setOrdem] = useState<Criterio>("level");

  function clicar(c: Criterio) {
    setOrdem(c);
  }

  const ordenadas = [...linhas].sort((a, b) => {
    const chave = CRITERIOS[ordem];
    const va = chave(a);
    const vb = chave(b);

    // 🔴 Quem não tem o número vai para o fim, nunca para o topo. Sem isto,
    // ordenar por Poder colocaria na frente justamente quem está com traço
    // — a palbox de quem nunca entrou no jogo desde a migração 017.
    if (va === null && vb === null) return b.level - a.level;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (vb !== va) return vb - va;

    // Empate desfeito sempre igual, senão a lista dança entre um clique e
    // outro em quem tem o mesmo número.
    return b.level - a.level || a.nome.localeCompare(b.nome, "pt-BR");
  });

  const cabecalhos: { rotulo: string; criterio?: Criterio; direita?: boolean }[] =
    [
      { rotulo: "#" },
      { rotulo: "Jogador" },
      ...(mostrarServidor ? [{ rotulo: "Servidor" }] : []),
      { rotulo: "Level", criterio: "level" as const, direita: true },
      { rotulo: "Pals", criterio: "pals" as const, direita: true },
      { rotulo: "Poder", criterio: "poder" as const, direita: true },
      { rotulo: "Soma lv", criterio: "somaLv" as const, direita: true },
      { rotulo: "Soma IV", criterio: "somaIv" as const, direita: true },
    ];

  return (
    <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-line">
      <table className="w-full min-w-lg text-sm">
        <thead>
          <tr className="border-b border-line bg-surface">
            {cabecalhos.map((h, i) => (
              <th
                key={h.rotulo}
                aria-sort={
                  h.criterio && ordem === h.criterio ? "descending" : undefined
                }
                className={`px-4 py-3 font-semibold ${
                  h.direita ? "text-right" : "text-left"
                } ${i === 0 ? "w-14" : ""} ${
                  h.criterio && ordem === h.criterio ? "text-gold" : "text-muted"
                }`}
              >
                {h.criterio ? (
                  <button
                    type="button"
                    onClick={() => clicar(h.criterio as Criterio)}
                    className="cursor-pointer font-semibold transition-colors hover:text-gold"
                    title={`Ordenar por ${h.rotulo}`}
                  >
                    {h.rotulo}
                    {ordem === h.criterio && <span aria-hidden> ↓</span>}
                  </button>
                ) : (
                  h.rotulo
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((p, i) => (
            <tr
              key={p.chave}
              className="border-b border-line/60 last:border-0 hover:bg-surface/60"
            >
              <td
                className={`tabular px-4 py-3 font-bold ${MEDAL[i] ?? "text-muted"}`}
              >
                {i + 1}
              </td>
              <td className="px-4 py-3 font-semibold">
                {p.nome}
                {p.online && (
                  <span
                    className="ml-2 inline-block size-1.5 rounded-full bg-success align-middle"
                    title="Online agora"
                  />
                )}
              </td>
              {mostrarServidor && (
                <td className="px-4 py-3 text-muted">{p.servidor}</td>
              )}
              <td className="tabular px-4 py-3 text-right font-semibold">
                {p.level}
              </td>
              <td className="tabular px-4 py-3 text-right">
                {p.pals.toLocaleString("pt-BR")}
              </td>
              <td className="tabular px-4 py-3 text-right font-semibold text-gold">
                {p.poderHp === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  // Número guardado perde o dourado e ganha a data no hover:
                  // quem está offline não pode parecer medido agora, senão a
                  // tabela mente sem dizer nada.
                  <span
                    className={p.poderAoVivo ? undefined : "font-normal text-muted"}
                    title={
                      p.poderAoVivo
                        ? "Lido agora, com a pessoa no jogo"
                        : p.poderEm
                          ? `Última vez visto em ${new Date(p.poderEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
                          : undefined
                    }
                  >
                    {p.poderHp.toLocaleString("pt-BR")}
                  </span>
                )}
              </td>
              <td className="tabular px-4 py-3 text-right text-muted">
                {p.poderLevel === null
                  ? "—"
                  : p.poderLevel.toLocaleString("pt-BR")}
              </td>
              <td className="tabular px-4 py-3 text-right text-muted">
                {p.poderIvs === null ? "—" : p.poderIvs.toLocaleString("pt-BR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
