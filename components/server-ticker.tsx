import { activeServers, type PalleiraServer } from "@/lib/servers";
import { getMetrics, type ServerMetrics } from "@/lib/palworld/rest";
import { healthOf } from "@/components/server-card";

/**
 * Faixa fina com o pulso dos servidores, embaixo do cabeçalho em TODAS as
 * páginas — não só na home.
 *
 * `getMetrics` já cacheia por 60s (§3.4 do PROMPT.md), e o cache é da URL,
 * não da página: renderizar isto no layout raiz não soma chamada nenhuma
 * além do que a home já fazia sozinha.
 */

interface Item {
  server: PalleiraServer;
  metrics: ServerMetrics | null;
}

async function carregarStatus(): Promise<Item[]> {
  return Promise.all(
    activeServers().map(async (server) => ({
      server,
      metrics: await getMetrics(server).catch(() => null),
    })),
  );
}

export async function ServerTicker() {
  const status = await carregarStatus();
  if (status.length === 0) return null;

  // Duplicado de propósito: a animação anda -50% e recomeça exatamente onde
  // a segunda cópia começou — é isso que faz o loop não ter costura.
  const trilha = [...status, ...status];

  return (
    <div className="esteira-mascara overflow-hidden border-b border-line bg-surface">
      <div className="esteira-trilha flex w-max">
        {trilha.map((item, i) => (
          <ItemDoServidor key={`${item.server.slug}-${i}`} {...item} />
        ))}
      </div>
    </div>
  );
}

function ItemDoServidor({ server, metrics }: Item) {
  const status = healthOf(metrics);
  const corDoPonto = {
    online: "bg-success",
    instavel: "bg-warning",
    offline: "bg-danger",
  }[status];

  return (
    <div className="flex shrink-0 items-center gap-2 border-r border-line px-5 py-2 text-sm whitespace-nowrap">
      <span className={`size-1.5 shrink-0 rounded-full ${corDoPonto}`} aria-hidden />
      <span className="font-semibold">{server.shortName}</span>
      {server.tier === "vip" && (
        <span className="rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-gold uppercase">
          VIP
        </span>
      )}
      <span className="text-line-strong">·</span>
      <span className="tabular text-muted">
        {metrics ? (
          <>
            <b className="font-semibold text-text">{metrics.currentplayernum}</b>
            {`/${metrics.maxplayernum} online`}
          </>
        ) : (
          "sem resposta"
        )}
      </span>
    </div>
  );
}
