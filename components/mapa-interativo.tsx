"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Mapa da comunidade — tela cheia, painel de camadas, agrupamento e busca.
 *
 * A mecânica veio dos mapas grandes de Palworld (paldb, paldeck): painel à
 * esquerda com camadas e contagem, agrupamento de marcadores, leitura de
 * coordenada e zoom ancorado no cursor.
 *
 * ⚠️ O **conteúdo** é o oposto do deles, de propósito. Eles mostram o que o
 * jogo tem — dungeon, alfa, baú — e fazem melhor do que nós faríamos. Aqui é
 * o que só nós temos: onde **a Palleira** construiu e quem está jogando
 * **agora**. Refazer o mapa de conhecimento seria competir onde já se perdeu.
 *
 * ⚠️ O agrupamento não é enfeite: com 158 bases num servidor, marcador solto
 * vira mancha. Agrupar é o que faz o mapa continuar legível de longe e revelar
 * onde a comunidade se concentra.
 */

export interface BaseNoMapa {
  x: number;
  y: number;
  guilda: string;
  nivel: number;
  lider: string;
  membros: number;
  servidor: string;
}

export interface JogadorNoMapa {
  x: number;
  y: number;
  nome: string;
  guilda: string;
  servidor: string;
}

interface Props {
  bases: BaseNoMapa[];
  jogadores: JogadorNoMapa[];
  servidores: string[];
  limites: { minX: number; maxX: number; minY: number; maxY: number };
  imagem: { minX: number; maxX: number; minY: number; maxY: number };
}

type Selecionado =
  | { tipo: "base"; dado: BaseNoMapa }
  | { tipo: "jogador"; dado: JogadorNoMapa }
  | null;

const ZOOM_MIN = 1;
const ZOOM_MAX = 16;

/** Um ponto no mapa, já com o que precisa para desenhar e para a ficha. */
interface Ponto {
  x: number;
  y: number;
  base?: BaseNoMapa;
  jogador?: JogadorNoMapa;
  aceso: boolean;
}

interface Grupo {
  x: number;
  y: number;
  itens: Ponto[];
  aceso: boolean;
}

/**
 * Junta pontos que cairiam quase no mesmo pixel.
 *
 * Grade simples em vez de k-means: é O(n), estável enquanto a pessoa navega
 * (grupo não fica pulando entre quadros) e o resultado visual é o mesmo neste
 * volume de marcadores.
 */
function agrupar(pontos: Ponto[], celula: number): Grupo[] {
  const caixas = new Map<string, Ponto[]>();
  for (const p of pontos) {
    const chave = `${Math.floor(p.x / celula)}:${Math.floor(p.y / celula)}`;
    const lista = caixas.get(chave);
    if (lista) lista.push(p);
    else caixas.set(chave, [p]);
  }

  return [...caixas.values()].map((itens) => ({
    // Centro no meio real dos pontos, não no meio da célula: o grupo pousa
    // em cima das bases, não numa grade invisível.
    x: itens.reduce((s, p) => s + p.x, 0) / itens.length,
    y: itens.reduce((s, p) => s + p.y, 0) / itens.length,
    itens,
    aceso: itens.some((p) => p.aceso),
  }));
}

export function MapaInterativo({
  bases,
  jogadores,
  servidores,
  limites,
  imagem,
}: Props) {
  const W = limites.maxX - limites.minX;
  const H = limites.maxY - limites.minY;

  /**
   * Enquadramento inicial: onde a comunidade realmente está, não o quadrado
   * inteiro do mundo.
   *
   * Os limites do mundo são muito maiores que a ilha, então abrir no mundo
   * todo deixava uma moldura preta enorme em volta — era o que mais fazia o
   * mapa parecer amador. Aqui a vista nasce colada nos marcadores, com uma
   * folga para o terreno em volta dar contexto.
   */
  const inicial = useMemo(() => {
    const todos = [...bases, ...jogadores];
    if (todos.length === 0) {
      return { zoom: 1, x: limites.minX + W / 2, y: limites.minY + H / 2 };
    }
    const xs = todos.map((p) => p.x);
    const ys = todos.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const folga = 1.35; // 35% de terreno em volta
    const z = Math.min(
      W / Math.max(maxX - minX, 1) / folga,
      H / Math.max(maxY - minY, 1) / folga,
    );
    return {
      zoom: Math.min(ZOOM_MAX, Math.max(1, z)),
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };
  }, [bases, jogadores, limites, W, H]);

  const [zoom, setZoom] = useState(inicial.zoom);
  const [centro, setCentro] = useState({ x: inicial.x, y: inicial.y });
  const [ligados, setLigados] = useState<Set<string>>(new Set(servidores));
  const [verBases, setVerBases] = useState(true);
  const [verJogadores, setVerJogadores] = useState(true);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Selecionado>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [painel, setPainel] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const arrastando = useRef<{ x: number; y: number } | null>(null);
  const arrastou = useRef(false);

  const termo = busca.trim().toLowerCase();
  const casa = useCallback(
    (texto: string) => texto.toLowerCase().includes(termo),
    [termo],
  );

  /* ---------------------------------------------------------------- vista */

  const vw = W / zoom;
  const vh = H / zoom;

  const cx = Math.min(
    Math.max(centro.x, limites.minX + vw / 2),
    limites.maxX - vw / 2,
  );
  const cy = Math.min(
    Math.max(centro.y, limites.minY + vh / 2),
    limites.maxY - vh / 2,
  );

  const viewBox = `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;

  /** Marcador fixo em coordenada de jogo cresceria com o zoom; dividir mantém
      o tamanho na tela, que é o que se espera de um mapa. */
  const esc = (n: number) => n / zoom;

  /* -------------------------------------------------------------- pontos */

  const pontosBases = useMemo<Ponto[]>(
    () =>
      verBases
        ? bases
            .filter((b) => ligados.has(b.servidor))
            .map((b) => ({
              x: b.x,
              y: b.y,
              base: b,
              aceso: !termo || casa(b.guilda) || casa(b.lider),
            }))
        : [],
    [bases, ligados, verBases, termo, casa],
  );

  const pontosJogadores = useMemo<Ponto[]>(
    () =>
      verJogadores
        ? jogadores
            .filter((j) => ligados.has(j.servidor))
            .map((j) => ({
              x: j.x,
              y: j.y,
              jogador: j,
              aceso: !termo || casa(j.nome) || casa(j.guilda),
            }))
        : [],
    [jogadores, ligados, verJogadores, termo, casa],
  );

  // Célula proporcional ao zoom: agrupa de longe, solta de perto.
  const celula = vw / 26;

  const gruposBases = useMemo(
    () => agrupar(pontosBases, celula),
    [pontosBases, celula],
  );
  const gruposJogadores = useMemo(
    () => agrupar(pontosJogadores, celula),
    [pontosJogadores, celula],
  );

  const achados = termo
    ? pontosBases.filter((p) => p.aceso).length +
      pontosJogadores.filter((p) => p.aceso).length
    : 0;

  /* ------------------------------------------------------------ interação */

  const paraJogo = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: cx - vw / 2 + ((e.clientX - r.left) / r.width) * vw,
      y: cy - vh / 2 + ((e.clientY - r.top) / r.height) * vh,
    };
  };

  const aplicarZoom = (fator: number, alvo?: { x: number; y: number }) => {
    const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * fator));
    if (novo === zoom) return;
    if (alvo) {
      const k = 1 - zoom / novo;
      setCentro({ x: cx + (alvo.x - cx) * k, y: cy + (alvo.y - cy) * k });
    }
    setZoom(novo);
  };

  const aoRolar = (e: React.WheelEvent) => {
    const alvo = paraJogo(e);
    aplicarZoom(e.deltaY < 0 ? 1.3 : 1 / 1.3, alvo ?? undefined);
  };

  const aoPressionar = (e: React.PointerEvent) => {
    arrastando.current = { x: e.clientX, y: e.clientY };
    arrastou.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const aoMover = (e: React.PointerEvent) => {
    const p = paraJogo(e);
    if (p) setCursor({ x: Math.round(p.x), y: Math.round(p.y) });

    const a = arrastando.current;
    if (!a) return;
    if (Math.abs(e.clientX - a.x) + Math.abs(e.clientY - a.y) > 3) {
      arrastou.current = true;
    }
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    setCentro({
      x: cx - ((e.clientX - a.x) / r.width) * vw,
      y: cy - ((e.clientY - a.y) / r.height) * vh,
    });
    arrastando.current = { x: e.clientX, y: e.clientY };
  };

  const aoSoltar = () => {
    arrastando.current = null;
  };

  /** Clique em grupo aproxima; em marcador solto abre a ficha. */
  const aoClicarGrupo = (g: Grupo) => {
    // Arrastar termina num clique; sem isto, mover o mapa abriria fichas.
    if (arrastou.current) return;
    if (g.itens.length > 1) {
      setCentro({ x: g.x, y: g.y });
      setZoom((z) => Math.min(ZOOM_MAX, z * 2.2));
      return;
    }
    const p = g.itens[0];
    setSel(
      p.base
        ? { tipo: "base", dado: p.base }
        : { tipo: "jogador", dado: p.jogador! },
    );
  };

  /** Volta para onde a comunidade está — não para o quadrado do mundo. */
  const reenquadrar = () => {
    setZoom(inicial.zoom);
    setCentro({ x: inicial.x, y: inicial.y });
  };

  const alternarServidor = (s: string) =>
    setLigados((antes) => {
      const novo = new Set(antes);
      if (novo.has(s)) novo.delete(s);
      else novo.add(s);
      return novo;
    });

  /* ------------------------------------------------------------ interface */

  const Camada = ({
    ligada,
    alternar,
    cor,
    nome,
    quantos,
  }: {
    ligada: boolean;
    alternar: () => void;
    cor: string;
    nome: string;
    quantos: number;
  }) => (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={ligada}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
    >
      <span
        className={`grid size-4 shrink-0 place-items-center rounded border text-[0.6rem] ${
          ligada ? "border-gold bg-gold text-[#14120f]" : "border-line-strong"
        }`}
      >
        {ligada ? "✓" : ""}
      </span>
      <span className={`size-2.5 shrink-0 ${cor}`} />
      <span className={`flex-1 ${ligada ? "" : "text-muted"}`}>{nome}</span>
      <span className="tabular text-xs text-muted">{quantos}</span>
    </button>
  );

  return (
    <div className="relative flex h-[calc(100vh-13rem)] min-h-[560px] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      {/* ------------------------------------------------------- painel */}
      {painel && (
        <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-gold uppercase">
                Palleira
              </p>
              <p className="text-xs text-muted">Mapa da comunidade</p>
            </div>
            <button
              type="button"
              onClick={() => setPainel(false)}
              aria-label="Esconder painel"
              className="text-muted hover:text-text"
            >
              ‹
            </button>
          </div>

          <div className="border-b border-line p-3">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar guild ou jogador"
              className="w-full rounded-[var(--radius-control)] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-gold"
            />
            {termo && (
              <p className="mt-2 text-xs text-muted">
                {achados} {achados === 1 ? "resultado aceso" : "resultados acesos"}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <p className="px-2 pb-1.5 text-xs font-bold tracking-[0.14em] text-muted uppercase">
              Camadas
            </p>
            <Camada
              ligada={verBases}
              alternar={() => setVerBases((v) => !v)}
              cor="rotate-45 bg-gold"
              nome="Bases"
              quantos={bases.filter((b) => ligados.has(b.servidor)).length}
            />
            <Camada
              ligada={verJogadores}
              alternar={() => setVerJogadores((v) => !v)}
              cor="rounded-full bg-success"
              nome="Jogando agora"
              quantos={jogadores.filter((j) => ligados.has(j.servidor)).length}
            />

            <p className="mt-4 px-2 pb-1.5 text-xs font-bold tracking-[0.14em] text-muted uppercase">
              Servidores
            </p>
            {servidores.map((s) => (
              <Camada
                key={s}
                ligada={ligados.has(s)}
                alternar={() => alternarServidor(s)}
                cor="rounded-sm bg-line-strong"
                nome={s}
                quantos={
                  bases.filter((b) => b.servidor === s).length +
                  jogadores.filter((j) => j.servidor === s).length
                }
              />
            ))}
          </div>

          <div className="border-t border-line px-4 py-2.5 text-xs text-muted">
            Arraste para mover · role para aproximar
          </div>
        </aside>
      )}

      {/* ---------------------------------------------------------- mapa */}
      <div className="relative flex-1">
        {!painel && (
          <button
            type="button"
            onClick={() => setPainel(true)}
            aria-label="Mostrar painel"
            className="absolute top-3 left-3 z-10 rounded-[var(--radius-control)] border border-line bg-surface/90 px-2 py-1 text-sm backdrop-blur"
          >
            ›
          </button>
        )}

        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="block size-full cursor-grab touch-none active:cursor-grabbing"
          preserveAspectRatio="xMidYMid slice"
          onWheel={aoRolar}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerLeave={() => {
            aoSoltar();
            setCursor(null);
          }}
          role="img"
          aria-label={`Mapa com ${pontosBases.length} bases e ${pontosJogadores.length} jogadores`}
        >
          <rect
            x={limites.minX}
            y={limites.minY}
            width={W}
            height={H}
            fill="var(--bg)"
          />

          {/* Terreno quase limpo. Escurecer demais foi o que fazia o mapa
              antigo parecer amador: o mapa é o produto, não papel de parede. */}
          <image
            href="/mapa-palpagos.webp"
            x={imagem.minX}
            y={imagem.minY}
            width={imagem.maxX - imagem.minX}
            height={imagem.maxY - imagem.minY}
            opacity="0.92"
            preserveAspectRatio="none"
          />

          {/* --------------------------------------------------- bases */}
          {gruposBases.map((g, i) => {
            const n = g.itens.length;
            const r = esc(n > 1 ? 15 : 9);
            return (
              <g
                key={`b${i}`}
                className="cursor-pointer"
                opacity={g.aceso ? 1 : 0.22}
                onClick={() => aoClicarGrupo(g)}
              >
                <title>
                  {n > 1
                    ? `${n} bases aqui`
                    : `${g.itens[0].base!.guilda} · ${g.itens[0].base!.servidor}`}
                </title>
                {n > 1 ? (
                  <>
                    <circle
                      cx={g.x}
                      cy={g.y}
                      r={r}
                      fill="var(--gold)"
                      stroke="#14120f"
                      strokeWidth={esc(2)}
                    />
                    <text
                      x={g.x}
                      y={g.y + esc(4.5)}
                      textAnchor="middle"
                      fontSize={esc(13)}
                      fontWeight="700"
                      fill="#14120f"
                    >
                      {n}
                    </text>
                  </>
                ) : (
                  <rect
                    x={g.x - r}
                    y={g.y - r}
                    width={r * 2}
                    height={r * 2}
                    transform={`rotate(45 ${g.x} ${g.y})`}
                    fill="var(--gold)"
                    stroke="#14120f"
                    strokeWidth={esc(2)}
                  />
                )}
              </g>
            );
          })}

          {/* ----------------------------------------------- jogadores */}
          {gruposJogadores.map((g, i) => {
            const n = g.itens.length;
            const r = esc(n > 1 ? 14 : 9);
            return (
              <g
                key={`p${i}`}
                className="cursor-pointer"
                opacity={g.aceso ? 1 : 0.22}
                onClick={() => aoClicarGrupo(g)}
              >
                <title>
                  {n > 1
                    ? `${n} jogadores aqui`
                    : `${g.itens[0].jogador!.nome} · ${g.itens[0].jogador!.servidor}`}
                </title>
                <circle
                  cx={g.x}
                  cy={g.y}
                  r={esc(n > 1 ? 24 : 18)}
                  fill="var(--color-success)"
                  fillOpacity="0.22"
                />
                <circle
                  cx={g.x}
                  cy={g.y}
                  r={r}
                  fill="var(--color-success)"
                  stroke="#14120f"
                  strokeWidth={esc(2)}
                />
                {n > 1 && (
                  <text
                    x={g.x}
                    y={g.y + esc(4.5)}
                    textAnchor="middle"
                    fontSize={esc(12)}
                    fontWeight="700"
                    fill="#14120f"
                  >
                    {n}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* ------------------------------------------------------- zoom */}
        <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface/90 backdrop-blur">
          {(
            [
              ["+", () => aplicarZoom(1.5), "Aproximar"],
              ["−", () => aplicarZoom(1 / 1.5), "Afastar"],
              ["⤢", reenquadrar, "Voltar ao enquadramento"],
            ] as const
          ).map(([texto, acao, titulo]) => (
            <button
              key={titulo}
              type="button"
              title={titulo}
              onClick={acao}
              className="size-8 border-b border-line text-lg leading-none font-semibold transition-colors last:border-0 hover:bg-surface-2"
            >
              {texto}
            </button>
          ))}
        </div>

        {/* Coordenada: é o que a pessoa digita na bússola do jogo para achar
            o lugar. Sem isto o mapa é bonito e inútil. */}
        <div className="tabular absolute right-3 bottom-3 rounded-[var(--radius-control)] border border-line bg-surface/90 px-2.5 py-1 text-xs text-muted backdrop-blur">
          {cursor ? `${cursor.x}, ${cursor.y}` : "—"}
          <span className="ml-2 text-gold">{zoom.toFixed(1)}×</span>
        </div>

        {/* ----------------------------------------------------- ficha */}
        {sel && (
          <div className="absolute bottom-3 left-3 w-72 rounded-[var(--radius-card)] border border-line bg-surface/95 p-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setSel(null)}
              aria-label="Fechar"
              className="absolute top-2 right-3 text-muted hover:text-text"
            >
              ×
            </button>

            {sel.tipo === "base" ? (
              <>
                <p className="text-xs font-bold tracking-[0.14em] text-gold uppercase">
                  Base de guild
                </p>
                <h3 className="mt-1 truncate font-semibold">{sel.dado.guilda}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted">Nível</dt>
                  <dd className="tabular text-right">{sel.dado.nivel}</dd>
                  <dt className="text-muted">Membros</dt>
                  <dd className="tabular text-right">{sel.dado.membros}</dd>
                  <dt className="text-muted">Líder</dt>
                  <dd className="truncate text-right">{sel.dado.lider}</dd>
                  <dt className="text-muted">Servidor</dt>
                  <dd className="truncate text-right">{sel.dado.servidor}</dd>
                  <dt className="text-muted">Onde</dt>
                  <dd className="tabular text-right">
                    {Math.round(sel.dado.x)}, {Math.round(sel.dado.y)}
                  </dd>
                </dl>
              </>
            ) : (
              <>
                <p className="text-xs font-bold tracking-[0.14em] text-success uppercase">
                  Jogando agora
                </p>
                <h3 className="mt-1 truncate font-semibold">{sel.dado.nome}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted">Guild</dt>
                  <dd className="truncate text-right">
                    {sel.dado.guilda || "—"}
                  </dd>
                  <dt className="text-muted">Servidor</dt>
                  <dd className="truncate text-right">{sel.dado.servidor}</dd>
                  <dt className="text-muted">Onde</dt>
                  <dd className="tabular text-right">
                    {Math.round(sel.dado.x)}, {Math.round(sel.dado.y)}
                  </dd>
                </dl>
              </>
            )}
          </div>
        )}

        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[0.65rem] text-muted/70">
          Mapa de Palworld © Pocketpair, Inc.
        </p>
      </div>
    </div>
  );
}
