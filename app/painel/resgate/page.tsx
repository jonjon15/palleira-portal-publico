import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { meuVinculo } from "@/lib/linking";
import { saldo } from "@/lib/economia";
import { serverBySlug } from "@/lib/servers";
import { getPlayers } from "@/lib/palworld/paldefender";
import {
  basesResgataveis,
  pedidoAberto,
  meuHistorico,
  precoDaProximaRestauracao,
} from "@/lib/resgate-base";
import { PedirRestauracao, CancelarPedido } from "./formularios";

export const metadata: Metadata = {
  title: "Resgatar base",
  description: "Recupere sua base perdida a partir do que ficou arquivado.",
};

// Depende de posição ao vivo e de saldo — nunca pode vir de cache.
export const dynamic = "force-dynamic";

export default async function Resgate() {
  const session = await auth();
  if (!session) redirect("/entrar");

  const discordId = session.user.discordId;
  const vinculo = await meuVinculo(discordId);

  if (!vinculo) {
    return (
      <>
        <PageHeader
          kicker="Painel"
          title="Resgatar base"
          description="Recupere sua base perdida a partir do que ficou arquivado."
        />
        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-6">
            <h2 className="font-semibold">Vincule seu personagem primeiro</h2>
            <p className="mt-1.5 text-sm text-muted">
              O resgate precisa saber quem você é dentro do jogo — a mesma
              prova que já libera carteira e cofre.
            </p>
            <Link
              href="/vincular"
              className="mt-4 inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] hover:bg-gold-hi"
            >
              Vincular personagem
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [bases, aberto, historico, paletas] = await Promise.all([
    basesResgataveis(vinculo.uid),
    pedidoAberto(discordId),
    meuHistorico(discordId),
    saldo(discordId),
  ]);

  // Preço por GUILD, não por conta: a base é sempre da guild inteira, então
  // o que decide se é grátis é se ESSA guild, NESSE servidor, já teve
  // alguma restauração — não quem está logado. Ajustado em 07/09/2026.
  const precos = new Map(
    await Promise.all(
      bases.map(async (b) => {
        const p = await precoDaProximaRestauracao(b.serverSlug, b.guildId);
        return [b.serverSlug, p] as const;
      }),
    ),
  );

  // Online agora, por servidor — só para os servidores onde há algo a
  // resgatar. A ação confirma de novo, ao vivo, no momento do clique; isto
  // aqui é só para a tela não oferecer um botão que ia falhar na hora.
  const online = new Map(
    await Promise.all(
      bases.map(async (b) => {
        const server = serverBySlug(b.serverSlug);
        if (!server) return [b.serverSlug, false] as const;
        const jogadores = await getPlayers(server).catch(() => []);
        return [
          b.serverSlug,
          jogadores.some((p) => p.playerUid === vinculo.uid && p.online),
        ] as const;
      }),
    ),
  );

  return (
    <>
      <PageHeader
        kicker="Painel"
        title="Resgatar base"
        description={`Sua base de ${vinculo.playerName} volta a partir do que ficou arquivado — do jeito que ela estava, no lugar em que você estiver.`}
      />

      <div className="mx-auto max-w-3xl px-4 py-12">
        {aberto && (
          <section className="mb-6 rounded-[var(--radius-card)] border border-gold/30 bg-gold/[0.06] p-6">
            <h2 className="font-semibold">
              Pedido em {aberto.status === "fila" ? "fila" : "andamento"} —{" "}
              {aberto.serverName}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              {aberto.status === "fila"
                ? "Esperando a próxima janela de manutenção (~06:00 UTC). Você pode cancelar até lá."
                : "O servidor está sendo preparado agora — não dá mais para cancelar."}
            </p>
            {aberto.status === "fila" && (
              <div className="mt-4">
                <CancelarPedido />
              </div>
            )}
          </section>
        )}

        {!aberto && bases.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="font-semibold">Nenhuma base arquivada para você</h2>
            <p className="mt-1.5 text-sm text-muted">
              Não achamos nenhum recorte de base com {vinculo.playerName} como
              membro, em nenhum servidor. Se você nunca teve base, ou se ela
              nunca chegou a ser arquivada, não há o que resgatar por aqui.
            </p>
          </div>
        )}

        {!aberto &&
          bases.map((b) => {
            const preco = precos.get(b.serverSlug) ?? 0;
            return (
              <section
                key={b.serverSlug}
                className="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-6"
              >
                <h2 className="font-semibold">{b.serverName}</h2>
                <p className="mt-1.5 text-sm text-muted">
                  Sua base de <b className="text-text">{b.pieceCount}</b> peça
                  {b.pieceCount === 1 ? "" : "s"}, arquivada em{" "}
                  {new Date(b.takenAt).toLocaleDateString("pt-BR")}.
                </p>

                <div className="mt-4 rounded-[var(--radius-control)] border border-line bg-surface-2/40 p-4 text-sm text-muted">
                  <p>
                    <b className="text-text">Como funciona:</b> entre no jogo,
                    vá até o lugar onde quer que a base renasça, e confirme
                    aqui — sem sair do lugar. A posição é lida de você
                    pisando ali, na hora da confirmação; não dá para escolher
                    pelo mapa.
                  </p>
                  <p className="mt-2">
                    <b className="text-text">Preço:</b>{" "}
                    {preco === 0 ? (
                      <>grátis — primeira restauração desta guild em {b.serverName}</>
                    ) : (
                      <>
                        {preco} Paletas · você tem {paletas}
                      </>
                    )}
                  </p>
                </div>

                <div className="mt-4">
                  <PedirRestauracao
                    serverSlug={b.serverSlug}
                    serverName={b.serverName}
                    snapshotId={b.snapshotId}
                    online={online.get(b.serverSlug) ?? false}
                    preco={preco}
                  />
                </div>
              </section>
            );
          })}

        {historico.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Pedidos anteriores</h2>
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {historico.map((h) => (
                <li key={h.id} className="px-5 py-3.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold tracking-wider uppercase ${
                        h.status === "feito"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-danger/30 bg-danger/10 text-danger"
                      }`}
                    >
                      {h.status === "feito" ? "Feito" : "Recusado"}
                    </span>
                    <span className="text-muted">{h.serverName}</span>
                    {h.paletas > 0 && (
                      <span className="tabular text-muted">
                        {h.paletas} Paletas
                      </span>
                    )}
                    <span className="tabular ml-auto text-xs text-muted">
                      {h.doneAt
                        ? new Date(h.doneAt).toLocaleString("pt-BR")
                        : ""}
                    </span>
                  </div>
                  {h.detail && (
                    <p className="mt-1 text-xs text-muted">{h.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
