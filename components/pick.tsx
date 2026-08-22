/**
 * Palheta — o símbolo da moeda (§6.6).
 *
 * Placeholder até chegar o vetor oficial da comunidade. Mantém a silhueta
 * certa (palheta de guitarra com "P"), então trocar depois é substituir este
 * arquivo, sem tocar em quem usa.
 */
export function Pick({
  className = "size-5",
  withLetter = true,
}: {
  className?: string;
  withLetter?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label="Paleta"
    >
      <defs>
        <linearGradient id="pick-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold-hi)" />
          <stop offset="55%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--gold-deep)" />
        </linearGradient>
      </defs>
      {/* silhueta da palheta */}
      <path
        d="M12 2.2c4.6 0 8.1 2.2 8.1 5.6 0 4.4-4.6 10.4-8.1 14-3.5-3.6-8.1-9.6-8.1-14 0-3.4 3.5-5.6 8.1-5.6Z"
        fill="url(#pick-gold)"
      />
      {withLetter && (
        <text
          x="12"
          y="11.6"
          textAnchor="middle"
          fontSize="8.5"
          fontWeight="800"
          fill="#14120f"
          fontFamily="var(--font-sans), system-ui, sans-serif"
        >
          P
        </text>
      )}
    </svg>
  );
}
