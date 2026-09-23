import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { Camara3D } from "@/components/camara-3d";
import { meuVinculo } from "@/lib/linking";
import { ondeEstouOnline } from "@/lib/cofre";
import { palsNoJogo, COOLDOWN_RESGATE_HORAS } from "@/lib/pal-cofre";
import {
  meuRitualAtivo,
  historicoDoRitual,
  passivasDoUltimoRitual,
  ivMinimoResgateAtual,
  meuResgatePendenteDaCamara,
  DOADORES_POR_RODADA,
  IV_INICIAL_RITUAL,
  IV_TETO_RITUAL,
} from "@/lib/purificacao";
import { nomeDoPal, urlDoIcone } from "@/lib/pals";
import { nomeDaPassiva, todasAsPassivas } from "@/lib/passivas";
import { isStaff, levelOf } from "@/lib/roles";
import {
  EscolherPalDoRitual,
  DoarPal,
  EscolherPassivasDoRitual,
  PassivasDoRitual,
  CancelarRitual,
  ResgatarPal,
  IvMinimoResgateEditor,
  ContagemRegressiva,
} from "./formularios";
import { acaoAtualizarReferencia } from "./actions";
import { CAMARA_EM_MANUTENCAO } from "./manutencao";

export const metadata: Metadata = { title: "Câmara de Purificação" };
export const dynamic = "force-dynamic";

/**
 * A Câmara de Purificação de verdade — ver `lib/purificacao.ts` para a
 * regra completa. Até 13/09/2026 esta rota era um protótipo estático
 * (aprovar layout e texto antes de existir banco, mesmo espírito do que
 * `/vip` foi); a partir daqui o registro do ritual é real.
 *
 * ⚠️ O que continua pendente: aplicar o IV de verdade no `Level.sav`. Por
 * agora a Câmara só registra o progresso no site (ver nota no topo da
 * migração 020) — quando o ritual "completa", o jogo em si ainda não sabe
 * disso.
 */

export default async function Purificacao() {
  const session = await auth();
  if (!session) redirect("/entrar");
  const discordId = session.user.discordId;
  const staff = isStaff(levelOf(session.user.roles, session.user.isMember));

  const [vinculo, ritual, ivMinimoResgate] = await Promise.all([
    meuVinculo(discordId),
    meuRitualAtivo(discordId),
    ivMinimoResgateAtual(),
  ]);
  const resgatePendente = ritual ? await meuResgatePendenteDaCamara(discordId, ritual.id) : null;

  if (!vinculo) {
    return (
      <Wrapper>
        <div className="rounded-2xl border border-line p-6" style={{ background: "#111a16" }}>
          <h2 className="font-semibold">Falta vincular seu personagem</h2>
          <p className="mt-2 max-w-xl text-sm" style={{ color: "#8fa39a" }}>
            A Câmara lê sua palbox no jogo — para isso o site precisa saber
            qual personagem é você.
          </p>
          <Link
            href="/vincular"
            className="mt-4 inline-flex rounded-lg px-5 py-2.5 text-sm font-semibold"
            style={{ background: "linear-gradient(180deg,#3ddc84,#2bb56b)", color: "#06140c" }}
          >
            Vincular personagem
          </Link>
        </div>
      </Wrapper>
    );
  }

  const onde = await ondeEstouOnline(discordId);

  const ritualAndando =
    ritual && (ritual.status === "aguardando_regra" || ritual.status === "ativo" || ritual.status === "completo")
      ? ritual
      : null;

  // `resgatado` significa que o Pal já voltou pra palbox de verdade — a
  // cápsula fica livre para uma purificação nova, mesmo comportamento de não
  // ter ritual nenhum ainda.

  const passivasReferencia = await passivasDoUltimoRitual();

  // Sem ritual: a cápsula fica vazia na tela, com um botão que abre a
  // palbox para escolher o Pal — a cápsula nunca some, só o que está dentro
  // dela muda.
  if (!ritualAndando) {
    const servidor = onde[0]?.serverSlug ?? null;
    const disponiveis = servidor
      ? await palsNoJogo(discordId, servidor)
      : { pals: [], erro: "" };

    return (
      <Wrapper>
        <p className="mt-3 max-w-4xl text-sm" style={{ color: "#8fa39a" }}>
          Escolha o Pal da sua palbox que vai entrar na cápsula. Depois disso
          o staff define quais passivas os doadores precisam ter, e você
          começa a doar Pals para purificá-lo.
        </p>

        <div className="mt-10 grid gap-7 md:grid-cols-[minmax(0,480px)_1fr] md:items-start">
          <div
            className="flex flex-col items-center gap-4 rounded-2xl p-6"
            style={{ background: "#111a16", border: "1px solid #1f2e27" }}
          >
            <Camara3D className="aspect-[3/4] w-full max-w-[420px]" />
            <p className="text-sm" style={{ color: "#5c6e66" }}>
              Cápsula vazia
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg px-4 py-3"
              style={{ background: "#0d1512", border: "1px solid #1f6b45" }}
            >
              <span className="text-sm font-semibold" style={{ color: "#e8a33d" }}>
                Só entra quem já é perfeito:
              </span>
              <span className="text-sm">
                IV 100 em Vida, Ataque e Defesa e Full Condensado (rank 5).
                Pal despertado pode entrar, mas sai sem o despertar — o jogo
                não devolve o despertar de um Pal que passa pela Câmara.
              </span>
            </div>

            <div
              className="rounded-lg px-4 py-3"
              style={{ background: "#0d1512", border: "1px solid #1f2e27" }}
            >
              <p className="mb-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px]" style={{ color: "#5c6e66" }}>
                <span>Passivas sugeridas para essa rodada, é só sugestão</span>
                <span className="whitespace-nowrap">
                  · expira em <ContagemRegressiva expiraEm={passivasReferencia.expiraEm} />
                </span>
              </p>
              <PassivasDoRitual
                passivasAceitas={passivasReferencia.passivasAceitas}
                staff={staff}
                catalogo={todasAsPassivas()}
                action={acaoAtualizarReferencia}
                ehReferencia
              />
            </div>

            <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
              <h2 className="text-sm font-semibold">Escolher Pal da palbox</h2>
              {CAMARA_EM_MANUTENCAO ? (
                <p className="mt-3 text-sm" style={{ color: "#5c6e66" }}>
                  A Câmara está em manutenção — ainda não dá para iniciar uma
                  purificação nova.
                </p>
              ) : !servidor ? (
                <p className="mt-3 text-sm" style={{ color: "#8fa39a" }}>
                  Entre no jogo com o time ou a palbox aberta para escolher o Pal.
                </p>
              ) : disponiveis.erro ? (
                <p className="mt-3 text-sm text-danger">{disponiveis.erro}</p>
              ) : (
                <div className="mt-4">
                  <EscolherPalDoRitual pals={disponiveis.pals} servidor={servidor} />
                </div>
              )}
            </div>
          </div>
        </div>
      </Wrapper>
    );
  }

  const doadoresNaRodada = ritualAndando.doadoresDaRodada.length;
  const progresso = Math.round((doadoresNaRodada / DOADORES_POR_RODADA) * 100);
  const ivMedio = Math.round((ritualAndando.ivHealth + ritualAndando.ivAttack + ritualAndando.ivDefense) / 3);

  const servidorDoRitual = onde.find((o) => o.serverSlug === ritualAndando.serverSlug);
  const disponiveis =
    ritualAndando.status === "ativo" && servidorDoRitual
      ? await palsNoJogo(discordId, ritualAndando.serverSlug)
      : { pals: [], erro: "" };

  const historico =
    ritualAndando.status !== "aguardando_regra" ? await historicoDoRitual(ritualAndando.id) : [];

  return (
    <Wrapper>
      <div className="mt-10 grid gap-7 md:grid-cols-[minmax(0,480px)_1fr] md:items-start">
        {/* CAPSULE PANEL */}
        <div
          className="flex flex-col items-center gap-4 rounded-2xl p-6"
          style={{ background: "#111a16", border: "1px solid #1f2e27" }}
        >
          <span
            className="self-stretch text-center text-[10.5px] tracking-[0.12em] uppercase"
            style={{ color: "#5c6e66" }}
          >
            Câmara 01 · {ritualAndando.serverSlug}
          </span>

          <Camara3D palId={ritualAndando.palId} className="aspect-[3/4] w-full max-w-[420px]" />

          <div className="text-center">
            <p className="text-xl font-bold">{nomeDoPal(ritualAndando.palId)}</p>
          </div>

          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] tracking-[0.06em] uppercase"
            style={{
              background: "rgba(61,220,132,0.14)",
              border: "1px solid #1f6b45",
              color: "#3ddc84",
            }}
          >
            <span className="size-1.5 rounded-full" style={{ background: "#3ddc84" }} />
            {ritualAndando.status === "aguardando_regra"
              ? "Aguardando regra"
              : ritualAndando.status === "completo"
                ? "Purificação completa"
                : "Em regeneração"}
          </span>

          {ritualAndando.status !== "aguardando_regra" && (
            <>
              <div className="flex w-full justify-between text-[11px]" style={{ color: "#5c6e66" }}>
                <span>Doadores confirmados</span>
                <b style={{ color: "#8fa39a", fontWeight: 500 }}>
                  {doadoresNaRodada} de {DOADORES_POR_RODADA}
                </b>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#182420", border: "1px solid #1f2e27" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${progresso}%`, background: "linear-gradient(90deg,#1f6b45,#3ddc84)" }}
                />
              </div>
            </>
          )}

          {CAMARA_EM_MANUTENCAO ? (
            <p className="mt-1 text-center text-[11px]" style={{ color: "#5c6e66" }}>
              A Câmara está em manutenção — doar, resgatar e cancelar ficam
              fora do ar por enquanto.
            </p>
          ) : (
            <>
              {(ritualAndando.status === "ativo" || (ritualAndando.status === "completo" && resgatePendente)) && (
                <div className="mt-1 w-full">
                  {resgatePendente ? (
                    <ResgatarPal ritualId={ritualAndando.id} pendente={resgatePendente} />
                  ) : ivMedio >= ivMinimoResgate ? (
                    <ResgatarPal ritualId={ritualAndando.id} />
                  ) : (
                    <p className="text-center text-[11px]" style={{ color: "#5c6e66" }}>
                      Só dá para resgatar o Pal purificado a partir de IV {ivMinimoResgate}.
                    </p>
                  )}
                </div>
              )}

              {ritualAndando.status !== "completo" && (
                <div className="mt-1">
                  <CancelarRitual ritualId={ritualAndando.id} cooldownHoras={COOLDOWN_RESGATE_HORAS} />
                </div>
              )}
            </>
          )}
        </div>

        {/* INFO COLUMN */}
        <div className="flex flex-col gap-4">
          {ritualAndando.status === "aguardando_regra" && (
            <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
              <h2 className="text-sm font-semibold">Aguardando o staff</h2>
              <p className="mt-2 text-sm" style={{ color: "#5c6e66" }}>
                Seu Pal entrou na câmara. Assim que o staff definir quais
                passivas os doadores precisam ter, você já pode começar a
                doar Pals aqui.
              </p>

              {staff && (
                <div className="mt-4 border-t pt-4" style={{ borderColor: "#1f2e27" }}>
                  <h3 className="mb-2 text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#e8a33d" }}>
                    Definir regra (visível só para staff)
                  </h3>
                  <EscolherPassivasDoRitual
                    ritualId={ritualAndando.id}
                    passivas={todasAsPassivas()}
                    pontoDePartida={passivasReferencia.passivasAceitas}
                  />
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
            <h2 className="mb-1 text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
              Regra da câmara
            </h2>
            <div
              className="mt-3 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
              style={{ background: "#0d1512", border: "1px solid #1f6b45" }}
            >
              <span className="text-sm font-semibold">{DOADORES_POR_RODADA} doadores perfeitos</span>
              <span style={{ color: "#3ddc84" }}>→</span>
              <span className="text-sm font-semibold" style={{ color: "#e8a33d" }}>
                +1 IV em Vida, Ataque <em>e</em> Defesa, juntos
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                { label: "Vida", valor: ritualAndando.ivHealth },
                { label: "Ataque", valor: ritualAndando.ivAttack },
                { label: "Defesa", valor: ritualAndando.ivDefense },
              ].map((iv) => {
                const noTeto = iv.valor >= IV_TETO_RITUAL;
                const progressoIv = Math.round(
                  ((iv.valor - IV_INICIAL_RITUAL) / (IV_TETO_RITUAL - IV_INICIAL_RITUAL)) * 100,
                );
                return (
                  <div
                    key={iv.label}
                    className="rounded-lg p-3 text-center"
                    style={
                      noTeto
                        ? { background: "rgba(232,163,61,0.14)", border: "1px solid #8a6321" }
                        : { background: "#0d1512", border: "1px solid #182420" }
                    }
                  >
                    <div className="text-[10px] tracking-[0.08em] uppercase" style={{ color: "#5c6e66" }}>
                      {iv.label}
                    </div>
                    <div
                      className="mt-1.5 text-2xl font-bold tabular"
                      style={noTeto ? { color: "#e8a33d" } : undefined}
                    >
                      {iv.valor}
                    </div>
                    <div className="mt-1 text-[10.5px]" style={{ color: "#3ddc84" }}>
                      perfeito era {IV_INICIAL_RITUAL}
                    </div>
                    <div
                      className="mt-2 h-1 overflow-hidden rounded-full"
                      style={{ background: "#182420" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${progressoIv}%`,
                          background: "linear-gradient(90deg,#1f6b45,#3ddc84)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className="mt-4 flex flex-wrap justify-between gap-1.5 pt-3 text-[11.5px]"
              style={{ borderTop: "1px solid #182420", color: "#5c6e66" }}
            >
              <span>{ritualAndando.rodadasCompletas} rodadas completas</span>
              <b style={{ color: "#e8a33d" }}>
                {ivMedio >= IV_TETO_RITUAL ? "teto de IV alcançado" : `faltam ${IV_TETO_RITUAL - ivMedio} de IV até ${IV_TETO_RITUAL}`}
              </b>
            </div>
          </div>

          <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
            <h2 className="mb-3 text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
              Passivas aceitas nesta purificação
            </h2>
            {ritualAndando.status === "aguardando_regra" ? (
              <p className="text-sm" style={{ color: "#5c6e66" }}>
                O staff ainda não definiu quais passivas os doadores precisam
                ter nesta purificação.
              </p>
            ) : (
              <>
                <PassivasDoRitual
                  ritualId={ritualAndando.id}
                  passivasAceitas={ritualAndando.passivasAceitas}
                  staff={staff}
                  catalogo={todasAsPassivas()}
                />
                {staff && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "#182420" }}>
                    <IvMinimoResgateEditor ivAtual={ivMinimoResgate} />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
            <h2 className="text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
              Doadores da rodada nº {ritualAndando.rodadasCompletas + 1}
            </h2>
            <p className="mt-1 mb-3.5 text-[12.5px]" style={{ color: "#5c6e66" }}>
              {ritualAndando.status === "aguardando_regra"
                ? "A doação abre assim que o staff definir a regra."
                : `Faltando ${DOADORES_POR_RODADA - doadoresNaRodada}, Vida/Ataque/Defesa sobem +1 cada, todos juntos.`}
            </p>
            <div className="flex flex-col gap-2.5">
              {ritualAndando.doadoresDaRodada.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                  style={{ background: "#0d1512", border: "1px solid #182420" }}
                >
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "linear-gradient(145deg,#1f6b45,#0d1512)", border: "1px solid #1f2e27" }}
                  >
                    {urlDoIcone(d.palId) && (
                      <img
                        src={urlDoIcone(d.palId)!}
                        alt=""
                        loading="lazy"
                        className="size-full rounded-lg object-contain"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">
                      {d.nickname || nomeDoPal(d.palId)} · {nomeDaPassiva(d.passivaUsada)}
                    </div>
                    <div className="text-[10.5px]" style={{ color: "#5c6e66" }}>
                      doado em {new Date(d.doadoEm).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px]" style={{ color: "#3ddc84" }}>
                    ✓ consumido
                  </div>
                </div>
              ))}
            </div>

            {ritualAndando.status === "ativo" && (
              <div className="mt-4">
                {CAMARA_EM_MANUTENCAO ? (
                  <p className="text-sm" style={{ color: "#5c6e66" }}>
                    A Câmara está em manutenção — a doação fica fora do ar
                    por enquanto.
                  </p>
                ) : disponiveis.erro ? (
                  <p className="text-sm text-danger">{disponiveis.erro}</p>
                ) : (
                  <DoarPal
                    pals={disponiveis.pals}
                    passivasAceitas={ritualAndando.passivasAceitas}
                    palIdDoAlvo={ritualAndando.palId}
                  />
                )}
              </div>
            )}

            {historico.length > 0 && (
              <details className="mt-4 border-t pt-3.5" style={{ borderColor: "#182420" }}>
                <summary
                  className="cursor-pointer text-[11.5px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: "#8fa39a" }}
                >
                  Ver purificação completa · já consumiu {historico.length} Pal
                  {historico.length === 1 ? "" : "s"}
                </summary>
                <div className="mt-3 flex flex-col gap-2.5">
                  {historico.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                      style={{ background: "#0d1512", border: "1px solid #182420" }}
                    >
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "linear-gradient(145deg,#1f6b45,#0d1512)", border: "1px solid #1f2e27" }}
                      >
                        {urlDoIcone(d.palId) && (
                          <img
                            src={urlDoIcone(d.palId)!}
                            alt=""
                            loading="lazy"
                            className="size-full rounded-lg object-contain"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold">
                          {d.nickname || nomeDoPal(d.palId)} · {nomeDaPassiva(d.passivaUsada)}
                        </div>
                        <div className="text-[10.5px]" style={{ color: "#5c6e66" }}>
                          rodada {d.rodada + 1} · doado em {new Date(d.doadoEm).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px]" style={{ color: "#3ddc84" }}>
                        ✓ consumido
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <p className="pt-3.5 text-xs leading-relaxed" style={{ borderTop: "1px solid #1f2e27", color: "#5c6e66" }}>
            O registro do ritual já é real — só falta aplicar o IV de
            verdade dentro do jogo, que ainda depende de uma etapa futura.
            Gênero travado desde a 1ª rodada — nunca entra em incubadora, é
            peça única da guilda.
          </p>
        </div>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono"
      style={{ background: "var(--bg)", color: "#e7f1ea", minHeight: "100%" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p
          className="text-xs font-bold tracking-[0.16em] uppercase"
          style={{ color: "#3ddc84" }}
        >
          Palleira · Câmara de Purificação
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Perfil da cápsula
        </h1>

        {CAMARA_EM_MANUTENCAO && <BannerDeManutencao />}

        <ExplicacaoDaCamara />

        {children}
      </div>
    </div>
  );
}

function BannerDeManutencao() {
  return (
    <div
      className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3"
      style={{ background: "rgba(232,163,61,0.1)", border: "1px solid #8a6321" }}
    >
      <span className="text-sm font-semibold" style={{ color: "#e8a33d" }}>
        🛠️ Em manutenção
      </span>
      <span className="text-sm" style={{ color: "#c9a876" }}>
        A Câmara de Purificação ainda está sendo preparada — iniciar,
        doar, resgatar e cancelar ficam fora do ar por enquanto. Volta em
        breve.
      </span>
    </div>
  );
}

function ExplicacaoDaCamara() {
  return (
    <div
      className="mt-6 rounded-2xl p-5"
      style={{ background: "#111a16", border: "1px solid #1f2e27" }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#e8a33d" }}>
            O que é a Câmara de Purificação?
          </h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "#8fa39a" }}>
            É um sistema do servidor para levar um Pal já perfeito além do
            limite padrão do jogo. Um Pal normal trava em IV 100 e rank 5 — a
            Câmara deixa ele passar disso.
          </p>
        </div>
        <div>
          <h2 className="text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#e8a33d" }}>
            Como funciona?
          </h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "#8fa39a" }}>
            Você coloca na cápsula um Pal com IV 100 em Vida, Ataque e Defesa
            e Full Condensado. Depois disso você doa outros Pals para
            alimentar a purificação: a cada {DOADORES_POR_RODADA} doações
            confirmadas, o Pal da cápsula ganha +1 de IV em Vida, Ataque{" "}
            <em>e</em> Defesa, juntos, até o teto de {IV_TETO_RITUAL}. Cada
            Pal doado é consumido — não volta.
          </p>
        </div>
      </div>

      <div
        className="mt-4 pt-4"
        style={{ borderTop: "1px solid #1f2e27" }}
      >
        <h2 className="text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
          Requisitos para doar um Pal
        </h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm" style={{ color: "#8fa39a" }}>
          <li>• Mesma espécie do Pal que está na cápsula.</li>
          <li>• IV 100 em Vida, Ataque e Defesa.</li>
          <li>• Full Condensado (rank 5).</li>
          <li>• Ter pelo menos uma das passivas que o staff escolheu para esta purificação.</li>
        </ul>
      </div>
    </div>
  );
}
