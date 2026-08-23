import { Pal3D } from "@/components/pal-3d";
import { nomeDoPal, ehAlpha, IVS, ALMAS, IV_MAXIMO, ALMA_MAXIMA } from "@/lib/pals";
import { nomeDaPassiva } from "@/lib/passivas";

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
}

export function FichaDoPal({ template }: { template: Template }) {
  const palId = template.PalID ?? "";
  const alpha = ehAlpha(palId);

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
        <h2 className="text-2xl font-bold tracking-tight">
          {template.Nickname || nomeDoPal(palId)}
        </h2>
        {template.Nickname && (
          <p className="text-sm text-muted">{nomeDoPal(palId)}</p>
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

        {template.Passives && template.Passives.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-muted">Passivas</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {template.Passives.map((p) => (
                <li
                  key={p}
                  title={p}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-sm"
                >
                  {nomeDaPassiva(p)}
                </li>
              ))}
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
