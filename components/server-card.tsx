import { StatusPill, type Status } from "@/components/status-pill";
import type { PalleiraServer } from "@/lib/servers";
import type { ServerMetrics, ServerRates } from "@/lib/palworld/rest";

export interface ServerCardData {
  server: PalleiraServer;
  metrics: ServerMetrics | null;
  rates: ServerRates | null;
}

/**
 * O FPS bruto não vai para a vitrine pública (§3.4): 47 ao lado de 61 convida
 * comparação e não ajuda ninguém. O jogador vê se está de pé; o número cru
 * fica no painel admin.
 *
 * Usa a MÉDIA, não o instantâneo — o FPS do Palworld oscila muito e um
 * pico ruim não pode pintar de vermelho um servidor saudável. Servidor com
 * jogadores costuma viver entre 40 e 60; abaixo de 30 é que dói de verdade.
 */
export function healthOf(metrics: ServerMetrics | null): Status {
  if (!metrics) return "offline";
  const fps = metrics.serverfpsaverage || metrics.serverfps;
  return fps < 30 ? "instavel" : "online";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-surface-2/60 px-3 py-2.5">
      <div className="text-[0.7rem] tracking-wide text-muted uppercase">
        {label}
      </div>
      <div className="tabular mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

export function ServerCard({ server, metrics, rates }: ServerCardData) {
  const online = metrics !== null;
  const status = healthOf(metrics);

  return (
    <article className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">
            {server.shortName}
            {server.tier === "vip" && (
              <span className="ml-2 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 align-middle text-[0.65rem] font-bold tracking-wider text-gold uppercase">
                VIP
              </span>
            )}
          </h3>
          {/* Endereço NÃO aparece em página pública: o VIP é whitelist e
              divulgar host:porta só facilita scan e ataque. Fica atrás do
              login, na página "Como jogar". */}
          <p className="mt-0.5 text-sm text-muted">
            {server.mode} · {server.tier === "vip" ? "Whitelist" : "Aberto"}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat
          label="Jogadores"
          value={
            online ? `${metrics.currentplayernum}/${metrics.maxplayernum}` : "—"
          }
        />
        <Stat label="Bases" value={online ? String(metrics.basecampnum) : "—"} />
        <Stat label="Dia" value={online ? String(metrics.days) : "—"} />
      </div>

      {rates && (
        <dl className="mt-4 flex flex-wrap gap-1.5 text-xs">
          <Rate label="XP" value={`${rates.exp}x`} />
          <Rate label="Captura" value={`${rates.capture}x`} />
          <Rate label="Drop" value={`${rates.enemyDrop}x`} />
          {rates.itemWeight === 0 && <Rate label="Peso" value="sem" />}
          {rates.staminaDrain === 0 && <Rate label="Fôlego" value="infinito" />}
          <Rate label="Construções" value={String(rates.maxBuildings)} />
          <Rate label="Pals na base" value={String(rates.baseWorkers)} />
        </dl>
      )}

      {!online && (
        <p className="mt-4 text-sm text-muted">
          Sem resposta do servidor no momento. Os dados voltam assim que ele
          responder.
        </p>
      )}
    </article>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-line bg-surface-2/60 px-2.5 py-1">
      <dt className="inline text-muted">{label} </dt>
      <dd className="tabular inline font-semibold text-text">{value}</dd>
    </div>
  );
}
