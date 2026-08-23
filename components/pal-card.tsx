import { nomeDoPal, ehAlpha, urlDoIcone, IVS, IV_MAXIMO } from "@/lib/pals";

/**
 * O cartão de um Pal numa lista — ícone, nível, IVs e passivas num relance
 * (§7.4 do PROMPT.md). É o que faltava para o cofre parecer o começo de um
 * mercado, e não uma lista de texto.
 *
 * Só ícone 2D aqui, nunca o modelo 3D: uma lista com 200 Pals da palbox
 * renderizando 200 contextos WebGL derrubaria a aba. O 3D fica reservado
 * para a ficha de um Pal só (`components/ficha-pal.tsx`).
 */

export interface DadosDoCard {
  palId: string;
  nickname?: string;
  level: number;
  gender?: string;
  shiny?: boolean;
  condensedPals?: number;
  ivs?: Record<string, number>;
  passives?: string[];
}

export function PalCard({
  pal,
  className = "",
}: {
  pal: DadosDoCard;
  className?: string;
}) {
  const icone = urlDoIcone(pal.palId);
  const alpha = ehAlpha(pal.palId);
  const passivas = pal.passives ?? [];
  const extras = Math.max(0, passivas.length - 2);

  return (
    <div className={`flex gap-3 ${className}`}>
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface-2">
        {icone ? (
          // Lista com muitas linhas: <Image> tem overhead por instância que
          // não vale a pena aqui, e o webp já é pequeno (~8 KB) e local.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icone}
            alt=""
            loading="lazy"
            className="size-full object-contain"
          />
        ) : (
          <span className="text-[0.6rem] text-muted">sem ícone</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {alpha && <span className="text-gold">Alpha </span>}
          {pal.nickname || nomeDoPal(pal.palId)}
          {pal.shiny && " ✨"}
        </p>
        <p className="tabular text-xs text-muted">
          Nível {pal.level}
          {pal.gender && ` · ${pal.gender === "Female" ? "Fêmea" : "Macho"}`}
          {(pal.condensedPals ?? 0) > 0 &&
            ` · ${"★".repeat(Math.min(4, pal.condensedPals ?? 0))}`}
        </p>

        {pal.ivs && (
          <div className="mt-1.5 flex gap-1">
            {IVS.map((eixo) => {
              const v = pal.ivs?.[eixo.chave] ?? 0;
              const pct = Math.min(100, Math.max(0, (v / IV_MAXIMO) * 100));
              return (
                <div
                  key={eixo.chave}
                  title={`${eixo.rotulo}: ${v}`}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2"
                >
                  <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                </div>
              );
            })}
          </div>
        )}

        {passivas.length > 0 && (
          <p className="mt-1 truncate text-[0.7rem] text-muted">
            {passivas.slice(0, 2).join(", ")}
            {extras > 0 && ` +${extras}`}
          </p>
        )}
      </div>
    </div>
  );
}
