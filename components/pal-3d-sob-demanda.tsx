"use client";

import { useEffect, useRef, useState } from "react";
import { Pal3D } from "@/components/pal-3d";
import { urlDoIcone } from "@/lib/pals";

/**
 * O 3D de um Pal, mas só enquanto ele está (ou quase está) na tela — para
 * usar em **lista**, não na ficha de um Pal só.
 *
 * `Pal3D` já limpa direito o que cria (dispose de geometria, textura e
 * renderer no unmount — ver o comentário lá). O problema de uma lista não é
 * vazamento, é **quantidade ao mesmo tempo**: o navegador tem um teto de
 * contextos WebGL simultâneos, e o mercado pode ter dezenas de Pal à venda
 * numa vitrine só. Cada card com 3D sempre ligado estouraria esse teto e
 * derrubaria contexto de Pal que nem está mais em tela.
 *
 * A saída é desmontar de verdade quando o card sai da viewport — não só
 * esconder com CSS, que manteria o `WebGLRenderer` vivo por baixo. Assim só
 * quem está (ou está prestes a estar) visível gasta um contexto.
 */
export function Pal3DSobDemanda({
  palId,
  className = "aspect-square",
}: {
  palId: string;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);
  const icone = urlDoIcone(palId);

  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;

    // 200px de antecedência: o 3D já está pronto quando o card chega na
    // borda da tela, em vez da pessoa ver o ícone trocar de repente.
    const observador = new IntersectionObserver(
      ([entrada]) => setVisivel(entrada.isIntersecting),
      { rootMargin: "200px" },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    <div ref={caixa} className={`relative w-full overflow-hidden ${className}`}>
      {visivel ? (
        <Pal3D palId={palId} className="absolute inset-0 h-full" />
      ) : icone ? (
        <div className="flex size-full items-center justify-center bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icone} alt="" className="size-2/3 object-contain" />
        </div>
      ) : (
        <div className="skeleton absolute inset-0" aria-hidden />
      )}
    </div>
  );
}
