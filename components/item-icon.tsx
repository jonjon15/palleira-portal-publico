import { urlDoIconeItem } from "@/lib/itens";

/**
 * O ícone 2D de um item — a mesma peça que faltava no card de Pal, agora
 * para item (§7.4 e §7.5 do PROMPT.md). ~4 KB, webp, servido do próprio
 * domínio.
 */
export function ItemIcon({
  itemId,
  className = "size-10",
}: {
  itemId: string;
  className?: string;
}) {
  const icone = urlDoIconeItem(itemId);
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface-2 ${className}`}
    >
      {icone ? (
        // Muitas linhas por tela (cofre, vitrine): <Image> tem overhead por
        // instância que não compensa para um webp pequeno e local.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icone} alt="" loading="lazy" className="size-full object-contain p-1" />
      ) : (
        <span className="text-[0.55rem] text-muted">?</span>
      )}
    </div>
  );
}
