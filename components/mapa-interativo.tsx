"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DefinicaoMapa, IdMapa } from "@/lib/mapas";

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
  /** Em qual mundo a base está — decidido pela altitude, ver `lib/mapas`. */
  mapa: IdMapa;
  guilda: string;
  nivel: number;
  lider: string;
  membros: number;
  servidor: string;
}

export interface JogadorNoMapa {
  x: number;
  y: number;
  mapa: IdMapa;
  nome: string;
  guilda: string;
  servidor: string;
}

interface Props {
  bases: BaseNoMapa[];
  jogadores: JogadorNoMapa[];
  servidores: string[];
  mapas: DefinicaoMapa[];
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
  bases: todasBases,
  jogadores: todosJogadores,
  servidores,
  mapas,
}: Props) {
  const [idMapa, setIdMapa] = useState<IdMapa>(mapas[0].id);
  const mapa = mapas.find((m) => m.id === idMapa) ?? mapas[0];
  const limites = mapa.limites;
  const imagem = mapa.imagemLimites;

  const W = limites.maxX - limites.minX;
  const H = limites.maxY - limites.minY;

  // Cada mundo mostra só o que é dele. Sem este corte, base da Árvore
  // Mundial aparece em cima de Palpagos, no lugar errado.
  const bases = useMemo(
    () => todasBases.filter((b) => b.mapa === idMapa),
    [todasBases, idMapa],
  );
  const jogadores = useMemo(
    () => todosJogadores.filter((j) => j.mapa === idMapa),
    [todosJogadores, idMapa],
  );

  const [zoom, setZoom] = useState(ZOOM_MIN);
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
  const [painel, setPainel] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const arrastando = useRef<{ x: number; y: number } | null>(null);
  const arrastou = useRef(false);

  /**
   * O tamanho real do container em pixels.
   *
   * Sem isto não dá para acertar o enquadramento: a área visível precisa ter
   * o mesmo formato do quadro, senão o SVG ou corta o que sobra (`slice`) ou
   * deixa tarja preta (`meet`). Foi o `slice` que fazia o mapa não caber
   * inteiro nem no zoom mínimo.
   */
  const [quadro, setQuadro] = useState({ w: 16, h: 9 });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setQuadro({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /** Pixels por unidade de mundo no zoom 1 — o mundo inteiro cabendo. */
  const escalaBase = Math.min(quadro.w / W, quadro.h / H);

  /**
   * Onde a comunidade está — e não o quadrado inteiro do mundo.
   *
   * Os limites do mundo são bem maiores que a área construída, então abrir no
   * mundo todo deixava uma moldura preta enorme. Isto só pode ser calculado
   * depois que o container foi medido, por isso é função e não valor inicial
   * de estado.
   */
  const enquadramento = useCallback(() => {
    const todos = [...bases, ...jogadores];
    if (todos.length === 0 || quadro.w < 2) return null;

    const xs = todos.map((p) => p.x);
    const ys = todos.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const folga = 1.25; // 25% de terreno em volta, para dar contexto
    const z = Math.min(
      quadro.w / (escalaBase * Math.max(maxX - minX, 1) * folga),
      quadro.h / (escalaBase * Math.max(maxY - minY, 1) * folga),
    );
    return {
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)),
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };
  }, [bases, jogadores, quadro, escalaBase]);

  // Enquadrar uma vez, quando o container ganha tamanho de verdade. Depois
  // disso a vista é da pessoa: reenquadrar só pelo botão.
  const jaEnquadrou = useRef(false);

  // Trocar de mundo precisa reenquadrar: a área construída de um não tem
  // nada a ver com a do outro.
  useEffect(() => {
    jaEnquadrou.current = false;
  }, [idMapa]);

  useEffect(() => {
    if (jaEnquadrou.current) return;
    const e = enquadramento();
    if (!e) return;
    jaEnquadrou.current = true;
    setZoom(e.zoom);
    setCentro({ x: e.x, y: e.y });
  }, [enquadramento]);

  const termo = busca.trim().toLowerCase();
  const casa = useCallback(
    (texto: string) => texto.toLowerCase().includes(termo),
    [termo],
  );

  /* ---------------------------------------------------------------- vista */

  const vw = quadro.w / (escalaBase * zoom);
  const vh = quadro.h / (escalaBase * zoom);

  // Quando a vista é mais larga que o mundo, prender no meio em vez de
  // empurrar contra a borda — senão o mundo cola num canto.
  const cx =
    vw >= W
      ? limites.minX + W / 2
      : Math.min(
          Math.max(centro.x, limites.minX + vw / 2),
          limites.maxX - vw / 2,
        );
  const cy =
    vh >= H
      ? limites.minY + H / 2
      : Math.min(
          Math.max(centro.y, limites.minY + vh / 2),
          limites.maxY - vh / 2,
        );

  const viewBox = `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;

  /**
   * Converte pixel de tela em unidade de mundo.
   *
   * Marcador medido em coordenada de jogo cresce junto com o zoom e vira
   * bolha. Aqui os números são o tamanho que se quer **na tela**, e a conta
   * devolve quanto isso vale no mundo no zoom atual — então o marcador tem
   * sempre o mesmo tamanho, aproximado ou afastado.
   */
  const esc = (px: number) => px / (escalaBase * zoom);

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

  /**
   * Roda do mouse — registrada na mão, fora do React.
   *
   * ⚠️ O `onWheel` do React entra como listener **passivo**, e listener
   * passivo não pode chamar `preventDefault()`. O resultado é o zoom
   * funcionando E a página rolando junto, que é exatamente o que não se quer
   * dentro de um mapa. Só `addEventListener` com `passive: false` resolve.
   */
  const rolarRef = useRef<(e: WheelEvent) => void>(() => {});
  rolarRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const alvo = paraJogo(e);
    aplicarZoom(e.deltaY < 0 ? 1.3 : 1 / 1.3, alvo ?? undefined);
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => rolarRef.current(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

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
    const e = enquadramento();
    if (!e) return;
    setZoom(e.zoom);
    setCentro({ x: e.x, y: e.y });
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
        {/* Seletor de mundo, no topo — o mesmo lugar onde o Paldeck põe. */}
        {mapas.length > 1 && (
          <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface/90 backdrop-blur">
            {mapas.map((m) => {
              const quantos =
                todasBases.filter((b) => b.mapa === m.id).length +
                todosJogadores.filter((j) => j.mapa === m.id).length;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setIdMapa(m.id)}
                  aria-pressed={m.id === idMapa}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors ${
                    m.id === idMapa
                      ? "bg-gold text-[#14120f]"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {m.nome}
                  <span
                    className={`tabular rounded-full px-1.5 text-xs ${
                      m.id === idMapa ? "bg-[#14120f]/15" : "bg-surface-2"
                    }`}
                  >
                    {quantos}
                  </span>
                </button>
              );
            })}
          </div>
        )}

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
          className="block size-full cursor-grab touch-none overscroll-contain active:cursor-grabbing"
          preserveAspectRatio="xMidYMid meet"
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
          <defs>
            {/*
              Sombra do pino. É ela que descola o marcador do terreno — sem
              isso o ícone parece adesivo colado, que era o aspecto amador
              dos losangos chapados de antes.
            */}
            <filter id="sombra" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow
                dx="0"
                dy={esc(1.5)}
                stdDeviation={esc(1.6)}
                floodColor="#000"
                floodOpacity="0.6"
              />
            </filter>

            {/* Acampamento: telhado e corpo. Silhueta cheia de propósito —
                traço fino some no tamanho de um pino. */}
            <symbol id="glifo-base" viewBox="0 0 24 24">
              <path d="M12 3.2 2.6 11h2.6v9.8h5.1v-5.6h3.4v5.6h5.1V11h2.6L12 3.2Z" />
            </symbol>

            {/* Jogador: cabeça e ombros. */}
            <symbol id="glifo-jogador" viewBox="0 0 24 24">
              <path d="M12 4.4a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4Zm0 9.1c4.1 0 7.4 2.2 7.4 4.9v1.2H4.6v-1.2c0-2.7 3.3-4.9 7.4-4.9Z" />
            </symbol>
          </defs>

          <rect
            x={limites.minX}
            y={limites.minY}
            width={W}
            height={H}
            fill="var(--bg)"
          />

          {/* Terreno quase limpo. Escurecer demais foi o que fazia o mapa
              antigo parecer amador: o mapa é o produto, não papel de parede. */}
          {mapa.imagem ? (
            <image
              href={mapa.imagem}
              x={imagem.minX}
              y={imagem.minY}
              width={imagem.maxX - imagem.minX}
              height={imagem.maxY - imagem.minY}
              opacity="0.92"
              preserveAspectRatio="none"
            />
          ) : (
            /* Sem arte do terreno ainda: grade de coordenada, para os
               marcadores terem referência em vez de flutuarem no vazio. */
            <>
              <defs>
                <pattern
                  id="grade"
                  width={esc(64)}
                  height={esc(64)}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${esc(64)} 0 L 0 0 0 ${esc(64)}`}
                    fill="none"
                    stroke="var(--line)"
                    strokeWidth={esc(1)}
                  />
                </pattern>
              </defs>
              <rect
                x={limites.minX}
                y={limites.minY}
                width={W}
                height={H}
                fill="url(#grade)"
              />
            </>
          )}

          {/* ------------------------------------------------ marcadores */}
          {/*
            Sombra aplicada na camada inteira, não por marcador: com 158
            pinos, um filtro por elemento derruba o quadro.
          */}
          <g filter="url(#sombra)">
            {gruposBases.map((g, i) => {
              const n = g.itens.length;
              const r = esc(n > 1 ? 15 : 12);
              const gl = r * 1.05;
              return (
                <g
                  key={`b${i}`}
                  className="cursor-pointer"
                  opacity={g.aceso ? 1 : 0.2}
                  onClick={() => aoClicarGrupo(g)}
                >
                  <title>
                    {n > 1
                      ? `${n} bases aqui`
                      : `${g.itens[0].base!.guilda} · ${g.itens[0].base!.servidor}`}
                  </title>
                  <circle
                    cx={g.x}
                    cy={g.y}
                    r={r}
                    fill="#12100c"
                    stroke="var(--gold)"
                    strokeWidth={esc(2)}
                  />
                  {n > 1 ? (
                    <text
                      x={g.x}
                      y={g.y + esc(4.6)}
                      textAnchor="middle"
                      fontSize={esc(13)}
                      fontWeight="700"
                      fill="var(--gold)"
                    >
                      {n}
                    </text>
                  ) : (
                    <use
                      href="#glifo-base"
                      x={g.x - gl / 2}
                      y={g.y - gl / 2}
                      width={gl}
                      height={gl}
                      fill="var(--gold)"
                    />
                  )}
                </g>
              );
            })}

            {gruposJogadores.map((g, i) => {
              const n = g.itens.length;
              const r = esc(n > 1 ? 15 : 12);
              const gl = r * 1.05;
              return (
                <g
                  key={`p${i}`}
                  className="cursor-pointer"
                  opacity={g.aceso ? 1 : 0.2}
                  onClick={() => aoClicarGrupo(g)}
                >
                  <title>
                    {n > 1
                      ? `${n} jogadores aqui`
                      : `${g.itens[0].jogador!.nome} · ${g.itens[0].jogador!.servidor}`}
                  </title>
                  {/* Pulso: quem está jogando agora precisa saltar à vista
                      entre 158 bases paradas. */}
                  <circle
                    cx={g.x}
                    cy={g.y}
                    r={esc(22)}
                    fill="var(--color-success)"
                    fillOpacity="0.18"
                  />
                  <circle
                    cx={g.x}
                    cy={g.y}
                    r={r}
                    fill="#0c1410"
                    stroke="var(--color-success)"
                    strokeWidth={esc(2)}
                  />
                  {n > 1 ? (
                    <text
                      x={g.x}
                      y={g.y + esc(4.6)}
                      textAnchor="middle"
                      fontSize={esc(13)}
                      fontWeight="700"
                      fill="var(--color-success)"
                    >
                      {n}
                    </text>
                  ) : (
                    <use
                      href="#glifo-jogador"
                      x={g.x - gl / 2}
                      y={g.y - gl / 2}
                      width={gl}
                      height={gl}
                      fill="var(--color-success)"
                    />
                  )}
                </g>
              );
            })}
          </g>
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
