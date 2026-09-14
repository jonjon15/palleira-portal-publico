import type { Metadata } from "next";
import { Camara3D } from "@/components/camara-3d";

export const metadata: Metadata = { title: "Câmara de Purificação" };

/**
 * Vitrine da Câmara de Purificação — protótipo estático, mesmo espírito do
 * `/vip`: aprovar layout e texto antes de existir qualquer banco por trás.
 *
 * Nada aqui lê ou escreve o save do jogo. Os números (IV 100 de entrada,
 * +1 por rodada, teto 150) são a regra pretendida da mecânica, não dados
 * de um ritual real — ainda não existe tabela nem lógica de verificação.
 *
 * Visual próprio: fundo dourado do site, mas os cards e o conteúdo em
 * verde de regeneração e fonte monoespaçada — pedido explícito do dono
 * para esta página parecer um painel de laboratório dentro da Palleira,
 * não uma vitrine institucional igual ao resto do site.
 */

const DOADORES = [
  { nome: "Tenshi_", data: "01/09/2026" },
  { nome: "Mari_lua", data: "02/09/2026" },
  { nome: "Leo_Raposa", data: "03/09/2026" },
];

export default function Purificacao() {
  return (
    <div
      className="font-mono"
      style={{
        background: "var(--bg)",
        color: "#e7f1ea",
        minHeight: "100%",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p
          className="text-xs font-bold tracking-[0.16em] uppercase"
          style={{ color: "#3ddc84" }}
        >
          Palleira · Câmara de Purificação
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Perfil da cápsula — MedicalPalBed_05
        </h1>
        <p className="mt-3 max-w-2xl text-sm" style={{ color: "#8fa39a" }}>
          A cápsula de regeneração do jogo: o Pal mais perfeito da sua palbox
          entra, uma rodada de doadores igualmente perfeitos sai — e ele volta
          com um pouco mais de IV do que o próprio jogo permite sozinho.
        </p>

        <div className="mt-10 grid gap-7 md:grid-cols-[minmax(0,380px)_1fr] md:items-start">
          {/* CAPSULE PANEL */}
          <div
            className="flex flex-col items-center gap-4 rounded-2xl p-6"
            style={{ background: "#111a16", border: "1px solid #1f2e27" }}
          >
            <span
              className="self-stretch text-center text-[10.5px] tracking-[0.12em] uppercase"
              style={{ color: "#5c6e66" }}
            >
              Unidade 03 · Setor Leste
            </span>

            <Camara3D className="aspect-[3/4] w-full max-w-[280px]" />

            <div className="text-center">
              <p className="text-xl font-bold">Broncha das Marés</p>
              <p className="text-xs" style={{ color: "#8fa39a" }}>
                Suzaku · macho · lv. 62
              </p>
            </div>

            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] tracking-[0.06em] uppercase"
              style={{
                background: "rgba(61,220,132,0.14)",
                border: "1px solid #1f6b45",
                color: "#3ddc84",
              }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: "#3ddc84" }}
              />
              Em regeneração
            </span>

            <div className="flex w-full justify-between text-[11px]" style={{ color: "#5c6e66" }}>
              <span>Ritual iniciado</span>
              <b style={{ color: "#8fa39a", fontWeight: 500 }}>03/09/2026</b>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#182420", border: "1px solid #1f2e27" }}>
              <div
                className="h-full rounded-full"
                style={{ width: "68%", background: "linear-gradient(90deg,#1f6b45,#3ddc84)" }}
              />
            </div>
            <div className="flex w-full justify-between text-[11px]" style={{ color: "#5c6e66" }}>
              <span>Doadores confirmados</span>
              <b style={{ color: "#8fa39a", fontWeight: 500 }}>3 de 4</b>
            </div>
          </div>

          {/* INFO COLUMN */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
              <h2 className="mb-1 text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
                Regra da câmara
              </h2>
              <div
                className="mt-3 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: "#0d1512", border: "1px solid #1f6b45" }}
              >
                <span className="text-sm font-semibold">4 doadores perfeitos</span>
                <span style={{ color: "#3ddc84" }}>→</span>
                <span className="text-sm font-semibold" style={{ color: "#e8a33d" }}>
                  +1 IV em HP, Ataque <em>e</em> Defesa, juntos
                </span>
              </div>
              <p className="mt-3 text-sm" style={{ color: "#5c6e66" }}>
                Sempre essa proporção, rodada após rodada — nunca mais que 1
                ponto por vez em cada status.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {[
                  { label: "HP", valor: 103 },
                  { label: "Ataque", valor: 103 },
                  { label: "Defesa", valor: 103 },
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
                      perfeito era 100
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="mt-4 flex flex-wrap justify-between gap-1.5 pt-3 text-[11.5px]"
                style={{ borderTop: "1px solid #182420", color: "#5c6e66" }}
              >
                <span>3 rodadas completas · 12 doadores já consumidos</span>
                <b style={{ color: "#e8a33d" }}>faltam 47 rodadas até 150</b>
              </div>
            </div>

            <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
              <h2 className="mb-3 text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
                Requisito de entrada — alvo e doadores
              </h2>
              <div className="flex flex-wrap gap-2">
                <span
                  className="rounded-lg px-3 py-1.5 text-[11.5px]"
                  style={{ background: "rgba(232,163,61,0.14)", border: "1px solid #8a6321", color: "#e8a33d" }}
                >
                  IV 100 em HP / Ataque / Defesa
                </span>
                <span
                  className="rounded-lg px-3 py-1.5 text-[11.5px]"
                  style={{ background: "rgba(232,163,61,0.14)", border: "1px solid #8a6321", color: "#e8a33d" }}
                >
                  Full Condensado (rank 4)
                </span>
              </div>
              <p className="mt-3 text-sm" style={{ color: "#5c6e66" }}>
                Vale para o Pal que entra na câmara e para cada um dos 4
                doadores — nenhum é aceito abaixo disso.
              </p>
            </div>

            <div className="rounded-2xl p-5" style={{ background: "#111a16", border: "1px solid #1f2e27" }}>
              <h2 className="text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#8fa39a" }}>
                Doadores da rodada nº 4
              </h2>
              <p className="mt-1 mb-3.5 text-[12.5px]" style={{ color: "#5c6e66" }}>
                Faltando o 4º, HP/Ataque/Defesa sobem +1 cada, todos juntos.
              </p>
              <div className="flex flex-col gap-2.5">
                {DOADORES.map((d) => (
                  <div
                    key={d.nome}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                    style={{ background: "#0d1512", border: "1px solid #182420" }}
                  >
                    <div
                      className="size-9 shrink-0 rounded-lg"
                      style={{ background: "linear-gradient(145deg,#1f6b45,#0d1512)", border: "1px solid #1f2e27" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">
                        Suzaku · Full Condensado (rank 4)
                      </div>
                      <div className="text-[10.5px]" style={{ color: "#5c6e66" }}>
                        doado por {d.nome} · {d.data}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px]" style={{ color: "#3ddc84" }}>
                      ✓ consumido
                    </div>
                  </div>
                ))}
                <div
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-45"
                  style={{ background: "#0d1512", border: "1px solid #182420" }}
                >
                  <div className="size-9 shrink-0 rounded-lg" style={{ background: "#0d1512" }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">
                      Suzaku · Full Condensado (rank 4)
                    </div>
                    <div className="text-[10.5px]" style={{ color: "#5c6e66" }}>
                      aguardando 4º doador
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px]" style={{ color: "#5c6e66" }}>
                    pendente
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                disabled
                className="rounded-lg px-5 py-2.5 text-[13.5px] font-semibold"
                style={{ background: "linear-gradient(180deg,#3ddc84,#2bb56b)", color: "#06140c" }}
              >
                Resgatar no jogo
              </button>
              <button
                disabled
                className="rounded-lg px-5 py-2.5 text-[13.5px] font-semibold"
                style={{ background: "#0d1512", border: "1px solid #1f2e27", color: "#8fa39a" }}
              >
                Ver ritual completo
              </button>
            </div>

            <p className="pt-3.5 text-xs leading-relaxed" style={{ borderTop: "1px solid #1f2e27", color: "#5c6e66" }}>
              Em construção: a verificação de IV/condensação e a ferramenta
              para indicar o Pal e os doadores direto da sua palbox ainda não
              existem — esta página só mostra a regra que a câmara vai seguir
              quando estiver no ar. Gênero travado desde a 1ª rodada — nunca
              entra em incubadora, é peça única da guilda.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
