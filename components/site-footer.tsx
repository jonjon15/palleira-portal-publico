import Link from "next/link";
import { Pick } from "@/components/pick";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-bold">
            <Pick className="size-5" />
            PALLEIRA<span className="text-gold">.</span>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            O servidor mais rock and roll de Palworld.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          <Link href="/como-funciona" className="hover:text-text">
            Como funciona
          </Link>
          <Link href="/regras" className="hover:text-text">
            Regras
          </Link>
          <Link href="/privacidade" className="hover:text-text">
            Privacidade
          </Link>
          <Link href="/conectar" className="hover:text-text">
            Como jogar
          </Link>
        </nav>
      </div>

      {/* §14.4 — projeto de fã, sem vínculo com a Pocketpair */}
      <div className="border-t border-line px-4 py-4 text-center text-xs text-muted">
        Projeto de fã da comunidade Palleira BR. Sem vínculo com a Pocketpair,
        Inc. Palworld e os nomes dos Pals pertencem aos seus donos.
      </div>
    </footer>
  );
}
