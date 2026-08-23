import { Pal3D } from "@/components/pal-3d";
import {
  nomeDoPal,
  descricaoDoPal,
  elementosDoPal,
  urlDoIconeElemento,
  paldexDoPal,
  ehAlpha,
  IVS,
  ALMAS,
  IV_MAXIMO,
  ALMA_MAXIMA,
} from "@/lib/pals";
import {
  nomeDaPassiva,
  descricaoDaPassiva,
  rankDaPassiva,
  corDoRank,
  urlDoIconeRank,
} from "@/lib/passivas";
import {
  nomeDaHabilidade,
  descricaoDaHabilidade,
  elementoDaHabilidade,
  urlDoSeloElemento,
} from "@/lib/habilidades";

/**
 * A ficha completa de um Pal: o modelo 3D girando, e os números que provam
 * que não tem como mentir nela — tudo saiu do template lido do jogo (§7.4).
 */

interface Template {
  PalID?: string;
  Nickname?: string;
  Level?: number;
  Gender?: string;
  Shiny?: boolean;
  CondensedPals?: number;
  IVs?: Record<string, number>;
  PalSouls?: Record<string, number>;
  Passives?: string[];
  ActiveSkills?: string[];
}

export function FichaDoPal({ template }: { template: Template }) {
  const palId = template.PalID ?? "";
  const alpha = ehAlpha(palId);
  const paldex = paldexDoPal(palId);
  const elementos = elementosDoPal(palId);
  const descricao = descricaoDoPal(palId);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div>
        <Pal3D palId={palId} className="h-80" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {alpha && (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-bold tracking-wide text-gold uppercase">
              Alpha
            </span>
          )}
          {template.Shiny && (
            <span className="rounded-full border border-line-strong bg-surface-2 px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase">
              ✨ Lucky
            </span>
          )}
          {(template.CondensedPals ?? 0) > 0 && (
            <span className="rounded-full border border-line-strong bg-surface-2 px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase">
              {"★".repeat(Math.min(4, template.CondensedPals ?? 0))} condensado
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-2xl font-bold tracking-tight">
            {template.Nickname || nomeDoPal(palId)}
          </h2>
          {paldex !== null && (
            <span className="tabular text-sm text-muted">#{paldex}</span>
          )}
          {elementos.map((e) => (
            <span
              key={e.chave}
              title={e.nome}
              className="flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs"
            >
              {e.icone && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlDoIconeElemento(e.icone)} alt="" className="size-3.5" />
              )}
              {e.nome}
            </span>
          ))}
        </div>
        {template.Nickname && (
          <p className="text-sm text-muted">{nomeDoPal(palId)}</p>
        )}

        {descricao && (
          <p className="mt-2 max-w-prose text-sm text-muted italic">{descricao}</p>
        )}

        <dl className="tabular mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted">Nível</dt>
            <dd className="font-semibold">{template.Level ?? 1}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Gênero</dt>
            <dd className="font-semibold">
              {template.Gender === "Female" ? "Fêmea" : "Macho"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <BlocoDeBarras titulo="IVs" eixos={IVS} valores={template.IVs} teto={IV_MAXIMO} />
          <BlocoDeBarras
            titulo="Almas"
            eixos={ALMAS}
            valores={template.PalSouls}
            teto={ALMA_MAXIMA}
          />
        </div>

        {template.ActiveSkills && template.ActiveSkills.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-muted">Habilidades</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {template.ActiveSkills.map((h) => {
                const elemento = elementoDaHabilidade(h);
                return (
                  <li
                    key={h}
                    title={descricaoDaHabilidade(h) || h}
                    className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm"
                    style={elemento ? { borderColor: `${elemento.cor}66` } : undefined}
                  >
                    {elemento && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urlDoSeloElemento(elemento.indice)}
                        alt={elemento.nome}
                        title={elemento.nome}
                        className="size-6 shrink-0"
                      />
                    )}
                    {nomeDaHabilidade(h)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {template.Passives && template.Passives.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-muted">Passivas</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {template.Passives.map((p) => {
                const rank = rankDaPassiva(p);
                const cor = rank !== null ? corDoRank(rank) : undefined;
                return (
                  <li
                    key={p}
                    title={descricaoDaPassiva(p) || p}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-3 pl-1.5 text-sm"
                    style={cor ? { borderColor: `${cor}66` } : undefined}
                  >
                    {rank !== null && (
                      <span
                        aria-hidden
                        className="inline-block size-5 shrink-0"
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
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function BlocoDeBarras({
  titulo,
  eixos,
  valores,
  teto,
}: {
  titulo: string;
  eixos: readonly { chave: string; rotulo: string }[];
  valores?: Record<string, number>;
  teto: number;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted">{titulo}</h3>
      <div className="mt-2 space-y-2">
        {eixos.map((e) => {
          const v = valores?.[e.chave] ?? 0;
          const pct = Math.min(100, Math.max(0, (v / teto) * 100));
          return (
            <div key={e.chave}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">{e.rotulo}</span>
                <span className="tabular font-semibold">{v}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gold"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
