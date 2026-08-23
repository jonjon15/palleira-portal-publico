import {
  nomeDoPal,
  ehAlpha,
  urlDoIcone,
  elementosDoPal,
  urlDoIconeElemento,
  IVS,
  IV_MAXIMO,
} from "@/lib/pals";
import {
  nomeDaPassiva,
  rankDaPassiva,
  corDoRank,
  urlDoIconeRank,
} from "@/lib/passivas";

/**
 * O cartão de um Pal numa lista — ícone, nível, IVs e passivas num relance
 * (§7.4 do PROMPT.md). É o que faltava para o cofre parecer o começo de um
 * mercado, e não uma lista de texto.
 *
 * Ícone 2D por padrão — uma lista com 200 Pals da palbox renderizando 200
 * contextos WebGL derrubaria a aba. Quem quer 3D na lista (o mercado, para
 * o comprador ver o bicho antes de pagar) usa `semIcone` e desenha o 3D por
 * fora, com `components/pal-3d-sob-demanda.tsx` — que só monta o WebGL de
 * quem está em tela.
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
  detalhado = false,
  semIcone = false,
}: {
  pal: DadosDoCard;
  className?: string;
  /**
   * Elementos e o chevron de raridade de cada passiva, em vez do resumo
   * compacto (bolinha + 2 nomes). Só no card do mercado (23/08/2026) — o
   * cofre e a lista de "guardar Pal" continuam com o resumo, senão uma
   * palbox de 200 linhas fica pesada de rolar.
   */
  detalhado?: boolean;
  /** Omite o ícone 2D — para quando o 3D já aparece acima (mercado). */
  semIcone?: boolean;
}) {
  const icone = urlDoIcone(pal.palId);
  const alpha = ehAlpha(pal.palId);
  const passivas = pal.passives ?? [];
  const extras = Math.max(0, passivas.length - 2);
  const elementos = detalhado ? elementosDoPal(pal.palId) : [];

  return (
    <div className={`flex gap-3 ${className}`}>
      {!semIcone && (
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface-2">
          {icone ? (
            // Lista com muitas linhas: <Image> tem overhead por instância
            // que não vale a pena aqui, e o webp já é pequeno (~8 KB) e local.
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
      )}

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

        {elementos.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {elementos.map((e) => (
              <span
                key={e.chave}
                title={e.nome}
                className="flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[0.65rem]"
              >
                {e.icone && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlDoIconeElemento(e.icone)} alt="" className="size-3" />
                )}
                {e.nome}
              </span>
            ))}
          </div>
        )}

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

        {passivas.length > 0 &&
          (detalhado ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {passivas.map((p) => {
                const rank = rankDaPassiva(p);
                const cor = rank !== null ? corDoRank(rank) : undefined;
                return (
                  <span
                    key={p}
                    title={nomeDaPassiva(p)}
                    className="flex items-center gap-1 rounded-full border bg-surface py-0.5 pr-2 pl-1 text-[0.65rem]"
                    style={cor ? { borderColor: `${cor}88` } : undefined}
                  >
                    {rank !== null && (
                      <span
                        aria-hidden
                        className="inline-block size-3 shrink-0"
                        style={{
                          backgroundColor: cor,
                          WebkitMaskImage: `url(${urlDoIconeRank(rank)})`,
                          maskImage: `url(${urlDoIconeRank(rank)})`,
                          WebkitMaskSize: "contain",
                          maskSize: "contain",
                          WebkitMaskRepeat: "no-repeat",
                          maskRepeat: "no-repeat",
                          WebkitMaskPosition: "center",
                          maskPosition: "center",
                        }}
                      />
                    )}
                    {nomeDaPassiva(p)}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 flex items-center gap-1 truncate text-[0.7rem] text-muted">
              {passivas.slice(0, 2).map((p, i) => {
                const rank = rankDaPassiva(p);
                return (
                  <span key={p} className="inline-flex items-center gap-1">
                    {i > 0 && ", "}
                    {rank !== null && (
                      <span
                        aria-hidden
                        className="inline-block size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: corDoRank(rank) }}
                      />
                    )}
                    {nomeDaPassiva(p)}
                  </span>
                );
              })}
              {extras > 0 && ` +${extras}`}
            </p>
          ))}
      </div>
    </div>
  );
}
