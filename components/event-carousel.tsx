"use client";

import { useState } from "react";
import { ImageCarousel, type CarouselSlide } from "@/components/image-carousel";

/**
 * A foto grande do evento + a fileira de miniaturas embaixo — clicar numa
 * miniatura vai direto pra ela no carrossel de cima, sem depender só das
 * setas.
 */
export function EventCarousel({ slides }: { slides: CarouselSlide[] }) {
  const [indice, setIndice] = useState(0);
  if (slides.length === 0) return null;

  return (
    <div className="mt-6">
      <ImageCarousel
        slides={slides}
        index={indice}
        onChange={setIndice}
        className="aspect-video w-full rounded-[var(--radius-card)] border border-line"
      />

      {slides.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {slides.map((s, i) => (
            <button
              key={s.url + i}
              type="button"
              onClick={() => setIndice(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === indice}
              className={`aspect-video w-24 shrink-0 overflow-hidden rounded-[var(--radius-control)] border bg-surface-2 transition-colors ${
                i === indice
                  ? "border-gold"
                  : "border-line opacity-70 hover:border-line-strong hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- link colado de qualquer host, sem lista fixa de domínio pra otimizar */}
              <img src={s.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
