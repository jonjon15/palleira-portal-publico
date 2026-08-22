/**
 * Palheta — o símbolo da moeda (§6.6).
 *
 * Vetor oficial da comunidade, desenhado a partir do render 3D do dono:
 * palheta de guitarra dourada com uma moeda em relevo no meio e o "P"
 * serifado. O trocadilho é o nome: Palleira → palheta → o servidor mais
 * rock'n'roll de Palworld.
 *
 * ⚠️ Aparece de 16px (rodapé) a 36px (carteira). Por isso os anéis da moeda
 * têm opacidade baixa: no tamanho pequeno eles somem em vez de virar
 * sujeira, e a silhueta continua legível.
 *
 * `withLetter={false}` dá só a silhueta, para quando o "P" não couber.
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
        {/* Diagonal, não vertical: a luz vem de cima à esquerda, que é o que
            dá o aspecto de metal em vez de adesivo chapado. */}
        <linearGradient id="pick-gold" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="var(--gold-hi, #f7dc7a)" />
          <stop offset="42%" stopColor="var(--gold, #e8b923)" />
          <stop offset="100%" stopColor="var(--gold-deep, #8b6914)" />
        </linearGradient>
        <linearGradient id="pick-coin" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="var(--gold-hi, #f7dc7a)" />
          <stop offset="60%" stopColor="var(--gold, #e8b923)" />
          <stop offset="100%" stopColor="var(--gold-deep, #8b6914)" />
        </linearGradient>
      </defs>

      {/* Silhueta: ombros largos e arredondados, afinando até a ponta baixa. */}
      <path
        d="M12 1.6c5.1 0 8.7 2.7 8.7 6.3 0 2.9-1.7 6.1-3.9 8.9-1.6 2-3.4 3.8-4.8 5.1-1.4-1.3-3.2-3.1-4.8-5.1-2.2-2.8-3.9-6-3.9-8.9C3.3 4.3 6.9 1.6 12 1.6Z"
        fill="url(#pick-gold)"
      />

      {/* Brilho do metal na borda de cima. */}
      <path
        d="M12 1.6c5.1 0 8.7 2.7 8.7 6.3 0 .5-.1 1-.2 1.6-.6-3.2-4-5.5-8.5-5.5S4.1 6.3 3.5 9.5c-.1-.6-.2-1.1-.2-1.6C3.3 4.3 6.9 1.6 12 1.6Z"
        fill="var(--gold-hi, #f7dc7a)"
        opacity="0.55"
      />

      {/* Moeda em relevo. */}
      <circle cx="12" cy="9.1" r="6.1" fill="url(#pick-coin)" />
      <circle
        cx="12"
        cy="9.1"
        r="5.5"
        fill="none"
        stroke="var(--gold-deep, #8b6914)"
        strokeWidth="0.45"
        opacity="0.5"
      />
      <circle
        cx="12"
        cy="9.1"
        r="4.6"
        fill="none"
        stroke="var(--gold-deep, #8b6914)"
        strokeWidth="0.3"
        opacity="0.35"
      />

      {withLetter && (
        <text
          x="12"
          y="12.3"
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fill="var(--gold-deep, #8b6914)"
          fontFamily="Georgia, 'Times New Roman', serif"
        >
          P
        </text>
      )}
    </svg>
  );
}
