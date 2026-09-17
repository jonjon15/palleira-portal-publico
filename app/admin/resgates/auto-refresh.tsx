"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega os dados do server component a cada `intervaloMs`, sem piscar a
 * página — o painel de resgates existe para ficar aberto numa aba enquanto
 * `tools/entregar_pals_local.py` processa a fila (§ substituto local do
 * GitHub Actions, 17/09/2026).
 */
export function AutoRefresh({ intervaloMs = 4000 }: { intervaloMs?: number }) {
  const router = useRouter();
  const parado = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (!parado.current) router.refresh();
    }, intervaloMs);

    const aoTrocarAba = () => {
      parado.current = document.hidden;
    };
    document.addEventListener("visibilitychange", aoTrocarAba);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoTrocarAba);
    };
  }, [router, intervaloMs]);

  return null;
}
