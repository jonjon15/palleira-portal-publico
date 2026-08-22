import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canModerate } from "@/lib/roles";
import { activeServers, serverBySlug } from "@/lib/servers";
import { getInfo, getMetrics, getPlayers } from "@/lib/palworld/rest";
import { recentes, ACAO_LABEL } from "@/lib/moderacao";
import { buscarMembro } from "@/lib/discord";
import {
  SalvarMundo,
  Desligar,
  Anuncio,
  BanManual,
  UnbanManual,
  LinhaJogador,
} from "./formularios";

export const metadata: Metadata = { title: "Moderação" };
export const dynamic = "force-dynamic";

function uptimeLabel(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default async function Moderacao({
  searchParams,
}: {
  searchParams: Promise<{ servidor?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/entrar");

  // Quem não é staff nem descobre que a página existe.
  if (!canModerate(levelOf(session.user.roles, session.user.isMember))) {
    notFound();
  }

  const servidores = activeServers();
  const { servidor: slugPedido } = await searchParams;

  // Quantos estão online em cada servidor — o `/metrics` é leve e vem com
  // cache de 60s (§3.4), então dá para perguntar aos três sem pesar.
  const contagem = new Map<string, number | null>(
    await Promise.all(
      servidores.map(
        async (s) =>
          [
            s.slug,
            (await getMetrics(s).catch(() => null))?.currentplayernum ?? null,
          ] as [string, number | null],
      ),
    ),
  );

  // Sem escolha explícita, abre onde tem gente. Painel de moderação existe
  // para agir sobre jogador — cair num servidor vazio faz caçar aba por aba.
  const maisCheio = [...servidores].sort(
    (a, b) => (contagem.get(b.slug) ?? -1) - (contagem.get(a.slug) ?? -1),
  )[0];

  const server = serverBySlug(slugPedido ?? "") ?? maisCheio ?? null;

  if (!server) {
    return (
      <>
        <PageHeader kicker="Administração" title="Moderação" />
        <div className="mx-auto max-w-6xl px-4 py-12">
          <p className="text-muted">Nenhum servidor ativo no momento.</p>
        </div>
      </>
    );
  }

  const [info, metrics, players, log] = await Promise.all([
    getInfo(server).catch(() => null),
    getMetrics(server).catch(() => null),
    getPlayers(server).catch(() => []),
    recentes(20).catch(() => []),
  ]);

  const logComNome = await Promise.all(
    log.map(async (l) => ({
      ...l,
      nomeAtor:
        (await buscarMembro(l.actor_id).catch(() => null))?.displayName ??
        l.actor_id,
      nomeServidor: serverBySlug(l.server_slug)?.shortName ?? l.server_slug,
    })),
  );

  return (
    <>
      <PageHeader
        kicker="Administração"
        title="Moderação"
        description="Jogadores online, anúncio no jogo e as ações que mexem no servidor de verdade — tudo fica no log de auditoria."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* --------------------------------------------------- seletor */}
        <div className="flex flex-wrap gap-2 border-b border-line pb-4">
          {servidores.map((s) => {
            const online = contagem.get(s.slug) ?? null;
            const ativo = s.slug === server.slug;
            return (
              <Link
                key={s.slug}
                href={`/admin/moderacao?servidor=${s.slug}`}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  ativo
                    ? "border-gold/40 bg-gold/10 text-gold"
                    : "border-line text-muted hover:border-line-strong hover:text-text"
                }`}
              >
                {s.shortName}
                <span
                  className={`tabular rounded-full px-1.5 py-0.5 text-[0.7rem] ${
                    online === null
                      ? "bg-danger/15 text-danger"
                      : online > 0
                        ? "bg-success/15 text-success"
                        : "bg-surface-2 text-muted"
                  }`}
                  title={
                    online === null
                      ? "Servidor sem resposta"
                      : `${online} online`
                  }
                >
                  {online === null ? "—" : online}
                </span>
              </Link>
            );
          })}
        </div>

        {/* -------------------------------------------- info + métricas */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Online" valor={metrics ? `${metrics.currentplayernum}/${metrics.maxplayernum}` : "—"} />
          <Numero rotulo="FPS" valor={metrics ? String(metrics.serverfps) : "—"} />
          <Numero rotulo="Dia no mundo" valor={metrics ? String(metrics.days) : "—"} />
          <Numero rotulo="Uptime" valor={metrics ? uptimeLabel(metrics.uptime) : "—"} />
        </div>

        {!metrics && (
          <p className="mt-4 text-sm text-warning">
            Sem resposta da REST oficial agora — as ações abaixo podem falhar
            até o servidor voltar a responder.
          </p>
        )}

        {info && (
          <p className="mt-4 text-sm text-muted">
            {info.servername} · v{info.version}
            {info.description && ` · ${info.description}`}
          </p>
        )}

        {/* ------------------------------------------------ ações rápidas */}
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Anúncio no jogo</h2>
            <p className="mt-1.5 text-sm text-muted">
              Vai para o chat de quem estiver dentro do {server.shortName}{" "}
              agora, e é espelhado no canal de status do Discord.
            </p>
            <div className="mt-4">
              <Anuncio servidor={server.slug} />
            </div>
          </section>

          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Mundo</h2>
            <p className="mt-1.5 text-sm text-muted">
              Salvar agora, sem esperar o autosave, ou desligar com contagem
              regressiva avisada no chat.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              <SalvarMundo servidor={server.slug} />
              <Desligar servidor={server.slug} />
            </div>
          </section>
        </div>

        {/* ------------------------------------------------ jogadores online */}
        <section className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Jogadores online — {server.shortName}
            </h2>
            <span className="text-sm text-muted">
              {players.length} conectado{players.length !== 1 && "s"}
            </span>
          </div>

          {players.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Ninguém online agora.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                    <th className="px-4 py-2 font-semibold">Jogador</th>
                    <th className="px-4 py-2 font-semibold">userId</th>
                    <th className="px-4 py-2 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {players.map((p) => (
                    <LinhaJogador
                      key={p.userId}
                      servidor={server.slug}
                      userId={p.userId}
                      nome={p.name}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------- ban manual */}
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Ban manual</h2>
            <p className="mt-1.5 text-sm text-muted">
              Para banir quem não está online agora — cole o userId.
            </p>
            <div className="mt-4">
              <BanManual servidor={server.slug} />
            </div>
          </section>

          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Unban manual</h2>
            <p className="mt-1.5 text-sm text-muted">
              Reverte um ban anterior pelo mesmo userId.
            </p>
            <div className="mt-4">
              <UnbanManual servidor={server.slug} />
            </div>
          </section>
        </div>

        {/* ------------------------------------------------ log de auditoria */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Log de auditoria</h2>
          {logComNome.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nenhuma ação registrada ainda.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {logComNome.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm"
                >
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold tracking-wider uppercase ${
                      l.ok
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-danger/30 bg-danger/10 text-danger"
                    }`}
                  >
                    {ACAO_LABEL[l.action]}
                  </span>
                  <span className="text-muted">{l.nomeServidor}</span>
                  {l.target && (
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                      {l.target}
                    </code>
                  )}
                  <span className="min-w-0 flex-1 truncate">{l.detail}</span>
                  <span className="text-xs text-muted">{l.nomeAtor}</span>
                  <span className="tabular w-32 text-right text-xs text-muted">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">
        {rotulo}
      </p>
      <p className="tabular mt-2 text-3xl font-bold tracking-tight">{valor}</p>
    </div>
  );
}
