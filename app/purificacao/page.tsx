import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { Camara3D } from "@/components/camara-3d";
import { meuVinculo } from "@/lib/linking";
import { ondeEstouOnline } from "@/lib/cofre";
import { palsNoJogo } from "@/lib/pal-cofre";
import {
  meuRitualAtivo,
  DOADORES_POR_RODADA,
  IV_INICIAL_RITUAL,
  IV_TETO_RITUAL,
} from "@/lib/purificacao";
import { nomeDoPal } from "@/lib/pals";
import { nomeDaPassiva } from "@/lib/passivas";
import { EscolherPalDoRitual, DoarPal } from "./formularios";

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

  const [vinculo, ritual] = await Promise.all([
    meuVinculo(discordId),
    meuRitualAtivo(discordId),
  ]);

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

  // Sem ritual: a cápsula fica vazia na tela, com um botão que abre a
  // palbox para escolher o Pal — a cápsula nunca some, só o que está dentro
  // dela muda.
  if (!ritualAndando) {
    const servidor = onde[0]?.serverSlug ?? null;
    const disponiveis = servidor ? await palsNoJogo(discordId, servidor) : { pals: [], erro: "" };

    return (
      <Wrapper>
        <p className="mt-3 max-w-2xl text-sm" style={{ color: "#8fa39a" }}>
          Escolha o Pal da sua palbox que vai entrar na cápsula. Depois disso
          o staff define quais passivas os doadores precisam ter, e você
          começa a doar Pals para purificá-lo.
        </p>

        <div className="mt-10 grid gap-7 md:grid-cols-[minmax(0,380px)_1fr] md:items-start">
          <div
            className="flex flex-col items-center gap-4 rounded-2xl p-6"
            style={{ background: "#111a16", border: "1px solid #1f2e27" }}
          >
            <Camara3D className="aspect-[3/4] w-full max-w-[280px]" />
            <p className="text-sm" style={{ color: "#5c6e66" }}>
              Cápsula vazia
            </p>
          </div>

          <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
            <h2 className="text-sm font-semibold">Escolher Pal da palbox</h2>
            {!servidor ? (
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

  return (
    <Wrapper>
      <div className="mt-10 grid gap-7 md:grid-cols-[minmax(0,380px)_1fr] md:items-start">
        {/* CAPSULE PANEL */}
        <div
          className="flex flex-col items-center gap-4 rounded-2xl p-6"
          style={{ background: "#111a16", border: "1px solid #1f2e27" }}
        >
          <Camara3D palId={ritualAndando.palId} className="aspect-[3/4] w-full max-w-[280px]" />

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
            </div>
          )}

          {ritualAndando.status !== "aguardando_regra" && (
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
                ].map((iv) => (
                  <div
                    key={iv.label}
                    className="rounded-lg p-3 text-center"
                    style={{ background: "#0d1512", border: "1px solid #182420" }}
                  >
                    <div className="text-[10px] tracking-[0.08em] uppercase" style={{ color: "#5c6e66" }}>
                      {iv.label}
                    </div>
                    <div className="mt-1.5 text-2xl font-bold tabular">{iv.valor}</div>
                    <div className="mt-1 text-[10.5px]" style={{ color: "#3ddc84" }}>
                      perfeito era {IV_INICIAL_RITUAL}
                    </div>
                  </div>
                ))}
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
          )}

          {ritualAndando.status !== "aguardando_regra" && (
            <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
              <h2 className="mb-3 text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
                Passivas aceitas neste ritual
              </h2>
              <div className="flex flex-wrap gap-2">
                {ritualAndando.passivasAceitas.map((p) => (
                  <span
                    key={p}
                    className="rounded-lg px-3 py-1.5 text-[11.5px]"
                    style={{ background: "rgba(232,163,61,0.14)", border: "1px solid #8a6321", color: "#e8a33d" }}
                  >
                    {nomeDaPassiva(p)}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm" style={{ color: "#5c6e66" }}>
                Cada doador precisa ter IV 100 em Vida, Ataque e Defesa, ser
                Full Condensado (rank 4), e pelo menos uma dessas passivas.
              </p>
            </div>
          )}

          {ritualAndando.status !== "aguardando_regra" && (
            <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
              <h2 className="text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
                Doadores da rodada nº {ritualAndando.rodadasCompletas + 1}
              </h2>
              <p className="mt-1 mb-3.5 text-[12.5px]" style={{ color: "#5c6e66" }}>
                Faltando {DOADORES_POR_RODADA - doadoresNaRodada}, Vida/Ataque/Defesa sobem +1 cada, todos juntos.
              </p>
              <div className="flex flex-col gap-2.5">
                {ritualAndando.doadoresDaRodada.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                    style={{ background: "#0d1512", border: "1px solid #182420" }}
                  >
                    <div
                      className="size-9 shrink-0 rounded-lg"
                      style={{ background: "linear-gradient(145deg,#1f6b45,#0d1512)", border: "1px solid #1f2e27" }}
                    />
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
                  {disponiveis.erro ? (
                    <p className="text-sm text-danger">{disponiveis.erro}</p>
                  ) : (
                    <DoarPal pals={disponiveis.pals} passivasAceitas={ritualAndando.passivasAceitas} />
                  )}
                </div>
              )}
            </div>
          )}

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
        {children}
      </div>
    </div>
  );
}
