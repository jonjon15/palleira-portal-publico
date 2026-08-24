import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { Pick } from "@/components/pick";
import { saldo } from "@/lib/economia";

const NAV = [
  { href: "/", label: "Início" },
  { href: "/servidores", label: "Servidores" },
  { href: "/mercado", label: "Store" },
  { href: "/ranking", label: "Placar" },
  { href: "/mapa", label: "Mapa" },
  { href: "/conectar", label: "Como jogar" },
];

export async function SiteHeader() {
  const session = await auth();
  // Saldo no cabeçalho (§7.1): a Paleta precisa estar sempre à vista.
  const paletas = session ? await saldo(session.user.discordId) : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/marca/palleira-logo.png"
            alt="Palleira"
            width={2172}
            height={724}
            priority
            className="h-8 w-auto"
          />
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
          {session && (
            <Link
              href="/painel/carteira"
              className="hidden items-center gap-1.5 rounded-full border border-line py-1 pr-3 pl-2 text-sm transition-colors hover:border-line-strong hover:bg-surface sm:flex"
              title="Sua carteira de Paletas"
            >
              <Pick className="size-4" withLetter={false} />
              <span className="tabular font-semibold">
                {paletas}
              </span>
            </Link>
          )}
          {session ? (
            <Link
              href="/painel"
              className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 text-sm transition-colors hover:bg-surface"
            >
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt=""
                  width={26}
                  height={26}
                  className="rounded-full"
                  unoptimized
                />
              ) : (
                <span className="size-[26px] rounded-full bg-surface-2" />
              )}
              <span className="max-w-28 truncate">
                {session.user.nick || session.user.name}
              </span>
            </Link>
          ) : (
            <Link
              href="/entrar"
              className="rounded-[var(--radius-control)] bg-gold px-3.5 py-1.5 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
            >
              Entrar
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
