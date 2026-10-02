"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * O menu do cabeçalho no celular. Antes de 02/10/2026 a lista de páginas só
 * existia de `md` para cima — no celular não havia como chegar ao VIP (nem a
 * nenhuma outra página) sem digitar o endereço.
 *
 * `<details>` abre sem JS; o efeito só fecha o menu depois de navegar, porque
 * o cabeçalho mora no layout e não é remontado entre páginas.
 */
export function MenuCelular({ itens }: { itens: { href: string; label: string }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className="group md:hidden">
      <summary
        aria-label="Abrir menu"
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-[var(--radius-control)] border border-line text-muted transition-colors hover:bg-surface hover:text-text [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
          <path
            d="M3 6h14M3 10h14M3 14h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="group-open:hidden"
          />
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="hidden group-open:block"
          />
        </svg>
      </summary>
      <ul className="absolute inset-x-0 top-14 border-b border-line bg-bg px-4 py-2 text-sm shadow-lg">
        {itens.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`block rounded-[var(--radius-control)] px-3 py-2.5 transition-colors hover:bg-surface ${
                pathname === item.href ? "text-gold" : "text-muted hover:text-text"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
