"use client";

import { useEffect, useRef, useState } from "react";
import { Camara3D } from "@/components/camara-3d";

/**
 * A câmara em 3D, mas só depois que a seção entra (ou quase entra) na tela —
 * mesma razão do `Pal3DSobDemanda`: WebGL tem teto de contextos simultâneos,
 * e a home já carrega bastante coisa antes de chegar aqui.
 */
export function Camara3DSobDemanda({
  className = "aspect-square",
}: {
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;

    const observador = new IntersectionObserver(
      ([entrada]) => setVisivel(entrada.isIntersecting),
      { rootMargin: "200px" },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    <div ref={caixa} className={`relative w-full ${className}`}>
      {visivel ? (
        <Camara3D className="absolute inset-0 h-full" />
      ) : (
        <div className="skeleton absolute inset-0" aria-hidden />
      )}
    </div>
  );
}
