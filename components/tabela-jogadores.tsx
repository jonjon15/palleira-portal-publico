"use client";

import { useState } from "react";
import {
  iconeDoElemento,
  NOME_DO_ELEMENTO,
  type Elemento,
} from "@/lib/racas";

/**
 * A tabela de jogadores do placar: ordenável por clique no cabeçalho e
 * filtrável por elemento.
 *
 * Existe como componente de cliente por um motivo de custo: as duas páginas
 * de ranking são cacheadas por 2 minutos (`revalidate = 120`), e montar cada
 * linha lê a palbox de todo mundo que está online. Ordenar ou filtrar pela
 * URL faria a página virar dinâmica e essa leitura aconteceria a cada
 * visita — aqui os dados chegam prontos uma vez e o resto é local.
 *
 * As duas páginas usam este mesmo componente: o ranking geral mostra a
 * coluna Servidor, e só o Dominantes tem raça e elementos.
 */

export interface LinhaDoPlacar {
  chave: string;
  nome: string;
  online: boolean;
  servidor?: string;
  /**
   * A raça do Dominantes, quando dá para saber: exige vínculo no site (para
   * ligar o personagem à conta de Discord) e registro no fórum. Quem não
   * tem os dois vem sem, e a linha fica igual ao que era antes.
   */
  raca?: { nome: string; cor: string; elemento: string } | null;
  /** O elemento escolhido por cima do da raça. */
  secundario?: { chave: string; nome: string } | null;
  level: number;
  pals: number;
  poderHp: number | null;
  poderLevel: number | null;
  poderIvs: number | null;
  /**
   * Quantos Pals shiny a pessoa **tem** — time, palbox e bases.
   *
   * ⚠️ Não é "quantos capturou": shiny abatido ou vendido não deixa rastro
   * em lugar nenhum, então esse histórico não existe para ser mostrado.
   */
  poderShiny: number | null;
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
  shiny: (l: LinhaDoPlacar) => l.poderShiny,
} as const;

type Criterio = keyof typeof CRITERIOS;

/** Qual das duas colunas de elemento está sendo filtrada. */
type Coluna = "primario" | "secundario";

const MEDAL = ["text-gold", "text-[#c9c9c9]", "text-[#c08457]"];

const elementoDaLinha = (l: LinhaDoPlacar, c: Coluna): Elemento | null =>
  c === "primario"
    ? ((l.raca?.elemento as Elemento) ?? null)
    : ((l.secundario?.chave as Elemento) ?? null);

export function TabelaJogadores({
  linhas,
  mostrarServidor = false,
  mostrarElementos = false,
}: {
  linhas: LinhaDoPlacar[];
  mostrarServidor?: boolean;
  /** Só o Dominantes tem raça e elementos — nos PVE as colunas não existem. */
  mostrarElementos?: boolean;
}) {
  const [ordem, setOrdem] = useState<Criterio>("level");
  /** Um filtro por coluna: dá para pedir "primário Fogo e secundário Sombra". */
  const [filtros, setFiltros] = useState<Record<Coluna, Elemento | null>>({
    primario: null,
    secundario: null,
  });
  /** Qual menu de elemento está aberto no cabeçalho. */
  const [aberto, setAberto] = useState<Coluna | null>(null);

  // Só os elementos que alguém realmente tem naquela coluna, e quantos —
  // menu que oferece opção vazia é menu que frustra.
  function opcoes(c: Coluna) {
    const conta = new Map<Elemento, number>();
    for (const l of linhas) {
      const e = elementoDaLinha(l, c);
      if (e) conta.set(e, (conta.get(e) ?? 0) + 1);
    }
    return [...conta.entries()].sort((a, b) => b[1] - a[1]);
  }

  const visiveis = linhas.filter(
    (l) =>
      (!filtros.primario ||
        elementoDaLinha(l, "primario") === filtros.primario) &&
      (!filtros.secundario ||
        elementoDaLinha(l, "secundario") === filtros.secundario),
  );

  const ordenadas = [...visiveis].sort((a, b) => {
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

  function trocarFiltro(c: Coluna, e: Elemento | null) {
    setFiltros((f) => ({ ...f, [c]: e }));
    setAberto(null);
  }

  const limpar = () => setFiltros({ primario: null, secundario: null });
  const filtrando = Boolean(filtros.primario || filtros.secundario);

  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-line">
      <div className="overflow-x-auto">
        <table className="w-full min-w-lg text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="w-14 px-4 py-3 text-left font-semibold text-muted">
                #
              </th>
              <th className="px-4 py-3 text-left font-semibold text-muted">
                Jogador
              </th>
              {mostrarServidor && (
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Servidor
                </th>
              )}
              {mostrarElementos && (
                <>
                  <FiltroDeElemento
                    rotulo="Elemento Primário"
                    coluna="primario"
                    escolhido={filtros.primario}
                    opcoes={opcoes("primario")}
                    aberto={aberto === "primario"}
                    onAbrir={() =>
                      setAberto(aberto === "primario" ? null : "primario")
                    }
                    onEscolher={(e) => trocarFiltro("primario", e)}
                  />
                  <FiltroDeElemento
                    rotulo="Elemento Secundário"
                    coluna="secundario"
                    escolhido={filtros.secundario}
                    opcoes={opcoes("secundario")}
                    aberto={aberto === "secundario"}
                    onAbrir={() =>
                      setAberto(aberto === "secundario" ? null : "secundario")
                    }
                    onEscolher={(e) => trocarFiltro("secundario", e)}
                  />
                </>
              )}
              {(
                [
                  ["Level", "level"],
                  ["Pals", "pals"],
                  ["Poder", "poder"],
                  ["Soma do Level", "somaLv"],
                  ["Soma IV", "somaIv"],
                  ["✨ Shiny", "shiny"],
                ] as [string, Criterio][]
              ).map(([rotulo, criterio]) => (
                <th
                  key={criterio}
                  aria-sort={ordem === criterio ? "descending" : undefined}
                  className={`px-4 py-3 text-right font-semibold ${
                    ordem === criterio ? "text-gold" : "text-muted"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOrdem(criterio)}
                    className="cursor-pointer font-semibold transition-colors hover:text-gold"
                    title={`Ordenar por ${rotulo}`}
                  >
                    {rotulo}
                    {ordem === criterio && <span aria-hidden> ↓</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((p, i) => (
              <tr
                key={p.chave}
                // A faixa da cor da raça entra por `box-shadow` para não
                // mexer na borda que já separa as linhas.
                style={
                  p.raca
                    ? { boxShadow: `inset 3px 0 0 ${p.raca.cor}` }
                    : undefined
                }
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
                {mostrarElementos && (
                  <>
                    <td className="px-4 py-3">
                      {p.raca ? (
                        <span
                          className="inline-flex items-center gap-1.5 font-semibold"
                          style={{ color: p.raca.cor }}
                          title={`Raça ${p.raca.nome}`}
                        >
                          <img
                            src={iconeDoElemento(p.raca.elemento as Elemento)}
                            alt=""
                            className="size-4"
                          />
                          {p.raca.nome}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {p.secundario ? (
                        <span className="inline-flex items-center gap-1.5">
                          <img
                            src={iconeDoElemento(
                              p.secundario.chave as Elemento,
                            )}
                            alt=""
                            className="size-4"
                          />
                          {p.secundario.nome}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </>
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
                    // Número guardado perde o dourado e ganha a data no
                    // hover: quem está offline não pode parecer medido
                    // agora, senão a tabela mente sem dizer nada.
                    <span
                      className={
                        p.poderAoVivo ? undefined : "font-normal text-muted"
                      }
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
                  {p.poderIvs === null
                    ? "—"
                    : p.poderIvs.toLocaleString("pt-BR")}
                </td>
                {/* Zero é "medido, e não tem nenhum"; traço é "nunca foi
                    medido". Mostrar traço para quem tem zero faria a coluna
                    mentir sobre quem já entrou no jogo. */}
                <td className="tabular px-4 py-3 text-right">
                  {p.poderShiny === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span
                      className={
                        p.poderShiny > 0
                          ? "font-semibold text-gold"
                          : "text-muted"
                      }
                      title={
                        p.poderAoVivo
                          ? "Lido agora, com a pessoa no jogo"
                          : p.poderEm
                            ? `Última vez visto em ${new Date(p.poderEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
                            : undefined
                      }
                    >
                      {p.poderShiny.toLocaleString("pt-BR")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ordenadas.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted">
          Ninguém com esse elemento no placar.{" "}
          <button
            type="button"
            onClick={limpar}
            className="cursor-pointer font-semibold text-gold hover:underline"
          >
            Limpar filtro
          </button>
        </p>
      )}

      {filtrando && ordenadas.length > 0 && (
        <p className="border-t border-line px-4 py-2.5 text-sm text-muted">
          Mostrando {ordenadas.length} de {linhas.length}.{" "}
          <button
            type="button"
            onClick={limpar}
            className="cursor-pointer font-semibold text-gold hover:underline"
          >
            Limpar filtro
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Cabeçalho que filtra: mostra o elemento escolhido e abre a lista ao clique.
 *
 * O menu é posicionado em relação ao `<th>`, e por isso a célula precisa de
 * `position: relative` — sem isso ele ancora no canto da página.
 */
function FiltroDeElemento({
  rotulo,
  coluna,
  escolhido,
  opcoes,
  aberto,
  onAbrir,
  onEscolher,
}: {
  rotulo: string;
  coluna: Coluna;
  escolhido: Elemento | null;
  opcoes: [Elemento, number][];
  aberto: boolean;
  onAbrir: () => void;
  onEscolher: (e: Elemento | null) => void;
}) {
  return (
    <th
      className={`relative px-4 py-3 text-left font-semibold whitespace-nowrap ${
        escolhido ? "text-gold" : "text-muted"
      }`}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-expanded={aberto}
        className="inline-flex cursor-pointer items-center gap-1.5 font-semibold transition-colors hover:text-gold"
        title={`Filtrar por ${rotulo.toLowerCase()}`}
      >
        {escolhido && (
          <img src={iconeDoElemento(escolhido)} alt="" className="size-4" />
        )}
        {escolhido ? NOME_DO_ELEMENTO[escolhido] : rotulo}
        <span aria-hidden className="text-[10px]">
          ▾
        </span>
      </button>

      {aberto && (
        <div className="absolute top-full left-2 z-20 mt-1 min-w-44 overflow-hidden rounded-[var(--radius-control)] border border-line-strong bg-surface-2 shadow-lg">
          <Opcao ativo={!escolhido} onClick={() => onEscolher(null)}>
            Todos
          </Opcao>
          {opcoes.map(([e, n]) => (
            <Opcao
              key={`${coluna}-${e}`}
              ativo={escolhido === e}
              onClick={() => onEscolher(e)}
            >
              <img src={iconeDoElemento(e)} alt="" className="size-4" />
              {NOME_DO_ELEMENTO[e]}
              <span className="tabular ml-auto text-muted">{n}</span>
            </Opcao>
          ))}
        </div>
      )}
    </th>
  );
}

function Opcao({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-surface ${
        ativo ? "text-gold" : "text-text"
      }`}
    >
      {children}
    </button>
  );
}
