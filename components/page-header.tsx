export function PageHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-xs font-bold tracking-[0.18em] text-gold uppercase">
          {kicker}
        </p>
        <h1 className="font-display mt-2 text-4xl tracking-tight sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-muted">{description}</p>
        )}
      </div>
    </header>
  );
}
