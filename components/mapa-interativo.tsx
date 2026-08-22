"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Mapa da comunidade — zoom, pan, filtro e busca.
 *
 * A mecânica é inspirada nos mapas grandes de Palworld (paldb, paldeck): dá
 * para navegar, filtrar camada e clicar num marcador para ver o detalhe.
 *
 * ⚠️ O **conteúdo** é o oposto do deles, de propósito. Eles mostram o que o
 * jogo tem — dungeon, alfa, minério — e fazem isso melhor do que nós faríamos.
 * Aqui é o que só nós temos: onde **a Palleira** construiu e quem está jogando
 * **agora**. Reconstruir o mapa de conhecimento seria competir onde já se
 * perdeu (§ do PROMPT sobre não refazer o que o PalAPI já entrega).
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
const ZOOM_MAX = 12;

export function MapaInterativo({
  bases,
  jogadores,
  servidores,
  limites,
  imagem,
}: Props) {
  const W = limites.maxX - limites.minX;
  const H = limites.maxY - limites.minY;

  const [zoom, setZoom] = useState(1);
  // Centro da vista, em coordenada de jogo.
  const [centro, setCentro] = useState({
    x: limites.minX + W / 2,
    y: limites.minY + H / 2,
  });
  const [ligados, setLigados] = useState<Set<string>>(new Set(servidores));
  const [verBases, setVerBases] = useState(true);
  const [verJogadores, setVerJogadores] = useState(true);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Selecionado>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const arrastando = useRef<{ x: number; y: number } | null>(null);

  /* ------------------------------------------------------------- filtros */

  const termo = busca.trim().toLowerCase();

  const casa = useCallback(
    (texto: string) => termo.length > 0 && texto.toLowerCase().includes(termo),
    [termo],
  );

  const basesVisiveis = useMemo(
    () => (verBases ? bases.filter((b) => ligados.has(b.servidor)) : []),
    [bases, ligados, verBases],
  );

  const jogadoresVisiveis = useMemo(
    () =>
      verJogadores ? jogadores.filter((j) => ligados.has(j.servidor)) : [],
    [jogadores, ligados, verJogadores],
  );

  const achados = useMemo(() => {
    if (!termo) return 0;
    return (
      basesVisiveis.filter((b) => casa(b.guilda) || casa(b.lider)).length +
      jogadoresVisiveis.filter((j) => casa(j.nome) || casa(j.guilda)).length
    );
  }, [basesVisiveis, jogadoresVisiveis, casa, termo]);

  /* --------------------------------------------------------------- vista */

  // Quanto do mundo cabe na tela no zoom atual.
  const vw = W / zoom;
  const vh = H / zoom;

  // Prender a vista dentro do mundo: sem isto o mapa "escapa" e some.
  const cx = Math.min(
    Math.max(centro.x, limites.minX + vw / 2),
    limites.maxX - vw / 2,
  );
  const cy = Math.min(
    Math.max(centro.y, limites.minY + vh / 2),
    limites.maxY - vh / 2,
  );

  const viewBox = `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;

  /**
   * Marcador cresce junto com o zoom se o tamanho for fixo em coordenada de
   * jogo. Dividir pelo zoom mantém ele do mesmo tamanho na tela, que é o que
   * a pessoa espera de um mapa.
   */
  const esc = (n: number) => n / zoom;

  /** Converte pixel do ponteiro para coordenada de jogo. */
  const paraJogo = (e: React.PointerEvent | React.WheelEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: cx - vw / 2 + ((e.clientX - r.left) / r.width) * vw,
      y: cy - vh / 2 + ((e.clientY - r.top) / r.height) * vh,
    };
  };

  /** Zoom ancorado no ponteiro: o ponto sob o cursor não se mexe. */
  const aoRolar = (e: React.WheelEvent) => {
    const alvo = paraJogo(e);
    if (!alvo) return;
    const novo = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, zoom * (e.deltaY < 0 ? 1.25 : 0.8)),
    );
    if (novo === zoom) return;
    const k = 1 - zoom / novo;
    setCentro({ x: cx + (alvo.x - cx) * k, y: cy + (alvo.y - cy) * k });
    setZoom(novo);
  };

  const aoPressionar = (e: React.PointerEvent) => {
    arrastando.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const aoMover = (e: React.PointerEvent) => {
    const p = paraJogo(e);
    if (p) setCursor({ x: Math.round(p.x), y: Math.round(p.y) });

    const a = arrastando.current;
    if (!a) return;
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

  const reenquadrar = () => {
    setZoom(1);
    setCentro({ x: limites.minX + W / 2, y: limites.minY + H / 2 });
  };

  const alternarServidor = (s: string) => {
    setLigados((antes) => {
      const novo = new Set(antes);
      if (novo.has(s)) novo.delete(s);
      else novo.add(s);
      return novo;
    });
  };

  /* ------------------------------------------------------------ interface */

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------ controles */}
      <div className="flex flex-wrap items-center gap-2">
        {servidores.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => alternarServidor(s)}
            aria-pressed={ligados.has(s)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              ligados.has(s)
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-line text-muted hover:text-text"
            }`}
          >
            {s}
          </button>
        ))}

        <span className="mx-1 h-5 w-px bg-[var(--line)]" />

        <button
          type="button"
          onClick={() => setVerBases((v) => !v)}
          aria-pressed={verBases}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
            verBases ? "border-line-strong" : "border-line text-muted"
          }`}
        >
          <span className="size-2.5 rotate-45 bg-gold" />
          Bases
        </button>

        <button
          type="button"
          onClick={() => setVerJogadores((v) => !v)}
          aria-pressed={verJogadores}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
            verJogadores ? "border-line-strong" : "border-line text-muted"
          }`}
        >
          <span className="size-2.5 rounded-full bg-success" />
          Jogando agora
        </button>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar guild ou jogador"
            className="w-52 rounded-[var(--radius-control)] border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-gold"
          />
          {termo && (
            <span className="text-xs text-muted">
              {achados} {achados === 1 ? "resultado" : "resultados"}
            </span>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------- mapa */}
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="block h-auto w-full cursor-grab touch-none active:cursor-grabbing"
          onWheel={aoRolar}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerLeave={() => {
            aoSoltar();
            setCursor(null);
          }}
          role="img"
          aria-label={`Mapa com ${basesVisiveis.length} bases e ${jogadoresVisiveis.length} jogadores`}
        >
          <defs>
            <pattern
              id="grade"
              width="200"
              height="200"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 200 0 L 0 0 0 200"
                fill="none"
                stroke="var(--line)"
                strokeWidth={esc(2)}
              />
            </pattern>
            <radialGradient id="brilho">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect
            x={limites.minX}
            y={limites.minY}
            width={W}
            height={H}
            fill="var(--bg)"
          />

          {/* Textura de fundo, não protagonista: o ouro dos marcadores
              precisa dominar. */}
          <image
            href="/mapa-palpagos.webp"
            x={imagem.minX}
            y={imagem.minY}
            width={imagem.maxX - imagem.minX}
            height={imagem.maxY - imagem.minY}
            opacity="0.58"
            preserveAspectRatio="none"
          />

          <rect
            x={limites.minX}
            y={limites.minY}
            width={W}
            height={H}
            fill="url(#grade)"
          />

          {/* Halo por base: onde muita gente construiu, o brilho soma e a
              região "quente" da comunidade aparece sozinha. */}
          {basesVisiveis.map((b, i) => (
            <circle
              key={`h${i}`}
              cx={b.x}
              cy={b.y}
              r={esc(90)}
              fill="url(#brilho)"
            />
          ))}

          {basesVisiveis.map((b, i) => {
            const destacada = !termo || casa(b.guilda) || casa(b.lider);
            const r = esc(11);
            return (
              <rect
                key={`b${i}`}
                x={b.x - r}
                y={b.y - r}
                width={r * 2}
                height={r * 2}
                transform={`rotate(45 ${b.x} ${b.y})`}
                fill="var(--gold)"
                fillOpacity={destacada ? 0.9 : 0.15}
                stroke="var(--bg)"
                strokeWidth={esc(3)}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSel({ tipo: "base", dado: b });
                }}
              >
                <title>{`${b.guilda} · ${b.servidor}`}</title>
              </rect>
            );
          })}

          {jogadoresVisiveis.map((j, i) => {
            const destacado = !termo || casa(j.nome) || casa(j.guilda);
            return (
              <g
                key={`p${i}`}
                className="cursor-pointer"
                opacity={destacado ? 1 : 0.2}
                onClick={(e) => {
                  e.stopPropagation();
                  setSel({ tipo: "jogador", dado: j });
                }}
              >
                <title>{`${j.nome} · ${j.servidor}`}</title>
                <circle
                  cx={j.x}
                  cy={j.y}
                  r={esc(26)}
                  fill="var(--color-success)"
                  fillOpacity="0.2"
                />
                <circle
                  cx={j.x}
                  cy={j.y}
                  r={esc(11)}
                  fill="var(--color-success)"
                  stroke="var(--bg)"
                  strokeWidth={esc(3)}
                />
              </g>
            );
          })}
        </svg>

        {/* ------------------------------------------------ zoom e coord */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          {[
            ["+", () => setZoom((z) => Math.min(ZOOM_MAX, z * 1.5)), "Aproximar"],
            ["−", () => setZoom((z) => Math.max(ZOOM_MIN, z / 1.5)), "Afastar"],
            ["⤢", reenquadrar, "Ver o mundo inteiro"],
          ].map(([texto, acao, titulo]) => (
            <button
              key={titulo as string}
              type="button"
              title={titulo as string}
              onClick={acao as () => void}
              className="size-8 rounded-[var(--radius-control)] border border-line bg-surface/90 text-lg leading-none font-semibold backdrop-blur transition-colors hover:bg-surface-2"
            >
              {texto as string}
            </button>
          ))}
        </div>

        {/* Coordenada do cursor: é assim que a pessoa acha o lugar dentro do
            jogo, que mostra as mesmas coordenadas na bússola. */}
        {cursor && (
          <div className="tabular absolute bottom-3 left-3 rounded-[var(--radius-control)] border border-line bg-surface/90 px-2.5 py-1 text-xs text-muted backdrop-blur">
            {cursor.x}, {cursor.y}
            {zoom > 1 && <span className="ml-2">· {zoom.toFixed(1)}×</span>}
          </div>
        )}

        {/* ------------------------------------------------------ detalhe */}
        {sel && (
          <div className="absolute bottom-3 left-1/2 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-[var(--radius-card)] border border-line bg-surface/95 p-4 backdrop-blur">
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
                <h3 className="mt-1 truncate font-semibold">
                  {sel.dado.guilda}
                </h3>
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
      </div>

      {/* ------------------------------------------------------- rodapé */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="size-3 rotate-45 bg-gold/85" />
          <span className="text-muted">{basesVisiveis.length} bases</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-success" />
          <span className="text-muted">
            {jogadoresVisiveis.length} jogando agora
          </span>
        </span>
        <span className="text-muted">
          Arraste para mover, role para aproximar, clique num marcador.
        </span>
        <span className="ml-auto text-xs text-muted">
          Mapa de Palworld © Pocketpair, Inc.
        </span>
      </div>
    </div>
  );
}
