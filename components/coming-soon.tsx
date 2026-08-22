import Link from "next/link";

/**
 * Estado "ainda não". Melhor uma tela honesta dizendo o que vem e quando do
 * que um link que leva a 404 (§6.1).
 */
export function ComingSoon({
  what,
  items,
}: {
  what: string;
  items: string[];
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8">
        <p className="text-xs font-bold tracking-[0.18em] text-gold uppercase">
          Em construção
        </p>
        <h2 className="mt-2 text-xl font-semibold">{what}</h2>
        <p className="mt-2 text-sm text-muted">O que vem por aqui:</p>
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm">
              <span className="text-gold" aria-hidden>
                •
              </span>
              <span className="text-muted">{item}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-semibold text-gold hover:text-gold-hi"
        >
          ← Voltar para a home
        </Link>
      </div>
    </div>
  );
}
