/**
 * Faixa de manutenção do banco — some sozinha quando a cota do Neon volta.
 *
 * O Neon grátis estourou a cota em 29/09/2026 e só zera em 01/10 00:00 UTC
 * (30/09 21h de Brasília). Até lá as páginas abrem, mas sem os dados do
 * banco — ver `lib/db.ts`. A data está fixa de propósito: checar o banco a
 * cada página para decidir a faixa gastaria justamente a cota que acabou.
 */
const VOLTA = Date.parse("2026-10-01T00:15:00Z");

export function AvisoManutencao() {
  if (Date.now() >= VOLTA) return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
      O site está em manutenção parcial até <strong>30/09 às 21h</strong>: ranking,
      cofre, loja e resgates voltam nesse horário. O servidor do jogo segue
      normal.
    </div>
  );
}
