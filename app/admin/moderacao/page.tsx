import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { levelOf, canModerate, canPowerServer } from "@/lib/roles";
import { activeServers, serverBySlug } from "@/lib/servers";
import { getInfo, getMetrics, getPlayers } from "@/lib/palworld/rest";
import { recentes, ACAO_LABEL } from "@/lib/moderacao";
import { buscarMembro } from "@/lib/discord";
import { filaAdmin } from "@/lib/resgate-base";
import {
  SalvarMundo,
  Desligar,
  Energia,
  ResetarJogador,
  RestaurarJogador,
  ReverterSave,
  ZerarDias,
  WipeMundo,
  Anuncio,
  BanManual,
  UnbanManual,
  LinhaJogador,
  FilaDeRestauracao,
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
  const nivel = levelOf(session.user.roles, session.user.isMember);
  if (!canModerate(nivel)) notFound();

  // Energia é só da cúpula: moderador vê a página, não vê estes botões.
  const podeEnergia = canPowerServer(nivel);

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

  const [info, metrics, players, log, fila] = await Promise.all([
    getInfo(server).catch(() => null),
    getMetrics(server).catch(() => null),
    getPlayers(server).catch(() => []),
    recentes(20).catch(() => []),
    podeEnergia ? filaAdmin().catch(() => []) : Promise.resolve([]),
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

  // Um nome por discordId só uma vez, mesmo com vários pedidos da mesma
  // pessoa — evita bater na API do Discord repetido à toa.
  const nomesFila = Object.fromEntries(
    await Promise.all(
      [...new Set(fila.map((p) => p.discordId))].map(async (id) => [
        id,
        (await buscarMembro(id).catch(() => null))?.displayName ?? id,
      ]),
    ),
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
              {podeEnergia && server.panelId
                ? " Ligar e reiniciar passam pelo painel da ENX, porque o jogo não sabe fazer isso."
                : " Desligar é só de ida: religar é no painel da ENX."}
            </p>
            <div className="mt-4 flex flex-col gap-4">
              <SalvarMundo servidor={server.slug} />
              {podeEnergia && server.panelId && (
                <div className="border-t border-line pt-4">
                  <h3 className="text-sm font-bold tracking-[0.14em] text-muted uppercase">
                    Energia
                  </h3>
                  <p className="mt-1.5 mb-3 text-sm text-muted">
                    Passa pelo painel da ENX, não pelo jogo — é o único caminho
                    que liga um servidor desligado.
                  </p>
                  <Energia
                    servidor={server.slug}
                    ligado={metrics !== null}
                  />
                </div>
              )}
              <div className="border-t border-line pt-4">
                <Desligar
                  servidor={server.slug}
                  temPainel={podeEnergia && Boolean(server.panelId)}
                />
              </div>
            </div>
          </section>
        </div>

        {/* ================================================== resgate */}
        {/*
          Resgate e destruição moram no mesmo painel e têm formulário quase
          igual (procurar por nome → escolher → confirmar). Em 06/09 o dono
          quis resgatar a conta do C H R I S e clicou em "Apagar" duas vezes.
          Daí a faixa: os dois grupos ganharam cabeçalho, cor e distância, e
          nenhuma seção de apagar encosta numa de devolver.
        */}
        {podeEnergia && (
          <div className="mt-12">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-bold tracking-[0.18em] text-success uppercase">
                Resgate
              </h2>
              <div className="h-px flex-1 bg-success/25" />
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Tudo neste bloco só <b className="text-text">acrescenta</b>:
              devolve o que sumiu, a partir de um backup. Nada aqui apaga o
              progresso de ninguém.
            </p>

            {/* ------------------------------------ devolver ao jogador */}
            {/*
              Separado da base de propósito: devolver Pals e itens só
              acrescenta a quem perdeu — não tira nada de ninguém. A base é da
              guild inteira, e por isso ganhou seção própria logo abaixo.
            */}
            <section className="mt-5 rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <h2 className="text-lg font-semibold">
                Devolver Pals e itens ao jogador
              </h2>
              <p className="mt-1.5 max-w-3xl text-sm text-muted">
                Para quem voltou e achou a Pal Box ou a mochila vazia. Traz de
                volta o save individual e os Pals com as caixas, do backup mais
                recente que ainda os tiver — você não precisa saber de qual.
              </p>
              <p className="mt-2 max-w-3xl text-xs text-muted">
                Não mexe na base e não tira nada de ninguém. Aqui também fica o
                botão de <b>conferir as bags da guild</b>, que só lê o mundo e
                diz quem está com o inventário desligado.
              </p>
              <div className="mt-5 max-w-2xl">
                <RestaurarJogador servidor={server.slug} escopo="jogador" />
              </div>
            </section>

            {/* -------------------------------- devolver a base da guild */}
            <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <h2 className="text-lg font-semibold">Devolver a base da guild</h2>
              <p className="mt-1.5 max-w-3xl text-sm text-muted">
                O servidor apaga a base de qualquer guild parada há mais de 72
                horas. Isto devolve a base a partir de um backup — junto com os
                Pals e o save do membro escolhido.
              </p>
              <p className="mt-2 max-w-3xl text-xs text-muted">
                A base é <b>da guild inteira</b>, não só de quem pediu. Comece
                por &ldquo;Ver o que voltaria&rdquo;: é grátis, não altera nada
                e não derruba ninguém.
              </p>
              <div className="mt-5 max-w-2xl">
                <RestaurarJogador servidor={server.slug} escopo="guild" />
              </div>
            </section>

            {/* -------------------------------- fila de restauração paga */}
            {/*
              Diferente das outras seções deste bloco, não é escopada pelo
              servidor selecionado no topo — um pedido já carrega o servidor
              dele (§ item 6 da fase 2, ver plans/restauracao-paga-fase-2.md).
            */}
            <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <h2 className="text-lg font-semibold">
                Fila de restauração paga
              </h2>
              <p className="mt-1.5 max-w-3xl text-sm text-muted">
                O que o próprio jogador pediu em{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                  /painel/resgate
                </code>
                . Processa sozinho perto das 06:00 UTC — aqui só dá para
                destravar um pedido parado ou devolver Paletas de um que foi
                recusado.
              </p>
              <div className="mt-5">
                <FilaDeRestauracao pedidos={fila} nomes={nomesFila} />
              </div>
            </section>
          </div>
        )}

        {/* ============================================= zona de risco */}
        {podeEnergia && (
          <div className="mt-16">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-bold tracking-[0.18em] text-danger uppercase">
                Zona de risco
              </h2>
              <div className="h-px flex-1 bg-danger/30" />
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Daqui para baixo <b className="text-text">nada devolve nada</b>:
              são as ações que apagam ou desfazem progresso. Se você veio
              recuperar a conta, a base ou os Pals de alguém, o lugar é o bloco
              de <b className="text-text">Resgate</b>, acima.
            </p>

            {/* --------------------------------------------- zerar dias */}
            <section className="mt-5 rounded-[var(--radius-card)] border border-danger/25 bg-danger/[0.03] p-6">
              <h2 className="text-lg font-semibold">Zerar dias do mundo</h2>
              <p className="mt-1.5 max-w-3xl text-sm text-muted">
                Ajusta o contador de &ldquo;Dias&rdquo; que aparece no browser
                de servidor do jogo. Mexe só nesse número — personagens,
                itens, cofres e bases continuam como estão.
              </p>
              <p className="mt-2 max-w-3xl text-xs text-muted">
                O trabalho não roda aqui: o mundo tem centenas de MB e o site
                não aguenta. O botão dispara o GitHub Actions, que para o
                servidor, faz backup, edita e religa — cerca de 2 minutos ao
                todo.
              </p>
              <div className="mt-5 max-w-2xl">
                <ZerarDias
                  servidor={server.slug}
                  diasAtual={metrics ? metrics.days : null}
                />
              </div>
            </section>

            {/* ----------------------------------------- reset de jogador */}
            {/*
              Fica depois do "zerar dias" de propósito: assim nenhuma seção de
              apagar encosta numa de devolver, e a faixa vermelha inteira entra
              no caminho antes de chegar aqui.
            */}
            <section className="mt-4 rounded-[var(--radius-card)] border-2 border-danger/50 bg-danger/[0.05] p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-danger">
                  Apagar jogador do mundo
                </h2>
                <span className="rounded-full border border-danger/40 bg-danger/10 px-2.5 py-0.5 text-[0.65rem] font-bold tracking-wider text-danger uppercase">
                  Não tem volta
                </span>
              </div>
              <p className="mt-3 max-w-3xl rounded-[var(--radius-control)] border border-danger/30 bg-danger/[0.08] px-4 py-3 text-sm text-muted">
                <b className="text-danger">Isto não devolve nada.</b> Para
                trazer de volta o que sumiu, use{" "}
                <b className="text-text">Devolver Pals e itens</b> ou{" "}
                <b className="text-text">Devolver a base da guild</b>, no bloco
                de Resgate acima.
              </p>
              <p className="mt-3 max-w-3xl text-sm text-muted">
                Zera alguém de verdade: personagem, itens e Pals somem, e ele
                recomeça do nível 1. Serve para quem pede recomeço, não para
                punir — para isso existem kick e ban.
              </p>
              <p className="mt-2 max-w-3xl text-xs text-muted">
                O trabalho não roda aqui: o mundo tem centenas de MB e o site
                não aguenta. O botão dispara o GitHub Actions, que para o
                servidor, faz backup, edita e religa — cerca de 2 minutos ao
                todo.
              </p>
              <div className="mt-5 max-w-2xl">
                <ResetarJogador servidor={server.slug} />
              </div>
            </section>

            {/* ----------------------------------------- reverter save */}
            <section className="mt-4 rounded-[var(--radius-card)] border border-danger/25 bg-danger/[0.03] p-6">
              <h2 className="text-lg font-semibold">
                Emergência: voltar o mundo ao último backup
              </h2>
              <p className="mt-1.5 max-w-3xl text-sm text-muted">
                Use quando o servidor <b className="text-text">não sobe mais</b>{" "}
                depois de uma gravação — ele tenta ligar, cai em menos de um
                minuto e repete. Isto devolve o mundo ao backup mais recente e
                liga o servidor.
              </p>
              <p className="mt-2 max-w-3xl text-xs text-muted">
                Desfaz o progresso de todos os jogadores desde aquele backup,
                que costuma ser de minutos atrás. O mundo problemático é
                guardado ao lado, para depois se descobrir o que quebrou.
              </p>
              <div className="mt-5 max-w-2xl">
                <ReverterSave servidor={server.slug} />
              </div>
            </section>

            {/* ------------------------------------------------- wipe */}
            <section className="mt-4 rounded-[var(--radius-card)] border-2 border-danger/50 bg-danger/[0.05] p-6">
              <h2 className="text-lg font-semibold text-danger">
                Wipe do mundo — {server.shortName}
              </h2>
              <p className="mt-1.5 max-w-3xl text-sm text-muted">
                Apaga o mundo inteiro: personagem, base, item e Pal de{" "}
                <b className="text-text">todo</b> jogador, não só de um. Serve
                para começar um servidor do zero, não para punir ou zerar uma
                pessoa — para isso já existem os botões acima.
              </p>
              <p className="mt-2 max-w-3xl text-xs text-muted">
                O mundo atual vira backup ao lado, não é apagado na hora — mas
                não tem como restaurar pelo site. O botão dispara o GitHub
                Actions, que para o servidor, move a pasta e religa.
              </p>
              <div className="mt-5 max-w-2xl">
                <WipeMundo
                  servidor={server.slug}
                  nomeServidor={server.shortName}
                />
              </div>
            </section>
          </div>
        )}

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
