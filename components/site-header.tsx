import Link from "next/link";
import { Pick } from "@/components/pick";

const NAV = [
  { href: "/", label: "Início" },
  { href: "/servidores", label: "Servidores" },
  { href: "/mercado", label: "Mercado" },
  { href: "/ranking", label: "Ranking" },
  { href: "/conectar", label: "Como jogar" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-bold tracking-tight"
        >
          <Pick className="size-6" />
          <span>
            PALLEIRA<span className="text-gold">.</span>
          </span>
        </Link>

        <ul className="hidden items-center gap-1 text-sm md:flex">
          {NAV.slice(1).map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="rounded-[var(--radius-control)] px-3 py-1.5 text-muted transition-colors hover:bg-surface hover:text-text"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          {/* BalanceChip entra aqui na Fase 4 (carteira de Paletas) */}
          <Link
            href="/entrar"
            className="rounded-[var(--radius-control)] bg-gold px-3.5 py-1.5 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
          >
            Entrar
          </Link>
        </div>
      </nav>
    </header>
  );
}
