"use client";

import { useEffect, useRef, useState } from "react";

export interface CarouselSlide {
  url: string;
  caption?: string | null;
}

const TROCA_MS = 5000;

/**
 * Carrossel simples: capa + galeria do evento, uma foto de cada vez.
 *
 * Sem lib nenhuma — é só um índice e um `setInterval`. Troca automática
 * respeita `prefers-reduced-motion` (o mesmo cuidado do resto do site, ver
 * globals.css) e para no hover.
 *
 * Funciona sozinho (estado interno, uso simples — home) ou controlado por
 * fora via `index`/`onChange` (a página do evento usa isso pra sincronizar
 * com a fileira de miniaturas clicáveis embaixo).
 */
export function ImageCarousel({
  slides,
  className = "",
  autoPlay = true,
  index: indiceControlado,
  onChange,
}: {
  slides: CarouselSlide[];
  className?: string;
  autoPlay?: boolean;
  index?: number;
  onChange?: (i: number) => void;
}) {
  const [indiceInterno, setIndiceInterno] = useState(0);
  const controlado = indiceControlado !== undefined;
  const indice = controlado ? indiceControlado : indiceInterno;
  const [pausado, setPausado] = useState(false);

  // Ref pra sempre ler o índice atual dentro do setInterval, sem precisar
  // recriar o timer a cada troca de foto (senão a barra "pausa no hover"
  // reinicia a contagem toda vez que a pessoa passa o mouse).
  const indiceRef = useRef(indice);
  indiceRef.current = indice;

  function mudarPara(n: number) {
    if (onChange) onChange(n);
    if (!controlado) setIndiceInterno(n);
  }

  useEffect(() => {
    if (!autoPlay || slides.length < 2 || pausado) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const t = setInterval(() => {
      mudarPara((indiceRef.current + 1) % slides.length);
    }, TROCA_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mudarPara lê o índice pela ref, não precisa entrar na lista
  }, [autoPlay, slides.length, pausado]);

  if (slides.length === 0) return null;
  const atual = slides[Math.min(indice, slides.length - 1)];

  return (
    <div
      className={`relative overflow-hidden bg-surface-2 ${className}`}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- link colado de qualquer host, sem lista fixa de domínio pra otimizar */}
      <img
        src={atual.url}
        alt={atual.caption || ""}
        className="absolute inset-0 size-full object-contain"
      />

      {atual.caption && (
        <p className="absolute inset-x-0 top-0 truncate bg-gradient-to-b from-bg/85 to-transparent px-3 pt-2 pb-5 text-center text-xs text-text">
          {atual.caption}
        </p>
      )}

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => mudarPara((indice - 1 + slides.length) % slides.length)}
            aria-label="Foto anterior"
            className="absolute top-1/2 left-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-bg/70 text-text transition-colors hover:bg-bg/90"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => mudarPara((indice + 1) % slides.length)}
            aria-label="Próxima foto"
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-bg/70 text-text transition-colors hover:bg-bg/90"
          >
            ›
          </button>
          <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.url + i}
                type="button"
                onClick={() => mudarPara(i)}
                aria-label={`Ir para a foto ${i + 1}`}
                aria-current={i === indice}
                className={`size-1.5 rounded-full transition-colors ${
                  i === indice ? "bg-gold" : "bg-text/35 hover:bg-text/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
