"use client";

import { memo, useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  acaoIniciarRitual,
  acaoDoarPal,
  acaoDefinirRegra,
  acaoAtualizarReferencia,
  acaoCancelarRitual,
  acaoResgatarPal,
  acaoConsultarResgate,
  acaoAtualizarIvMinimoResgate,
  type Estado,
  type EstadoResgate,
} from "./actions";
import { PalCard } from "@/components/pal-card";
import {
  elegibilidadeDoador,
  elegibilidadeAlvo,
  AVISO_DESPERTAR,
  mesmaEspecie,
  DIAS_REFERENCIA_MAXIMO,
} from "@/lib/purificacao-regras";
import type { PalDisponivel } from "@/lib/pal-cofre";
import { nomeDaPassiva, rankDaPassiva, corDoRank, urlDoIconeRank, type PassivaListada } from "@/lib/passivas";

const INICIAL: Estado = { ok: false, mensagem: "" };

function Aviso({ estado }: { estado: Estado }) {
  if (!estado.mensagem) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm ${
        estado.ok
          ? "border-success/30 bg-success/[0.08] text-success"
          : "border-danger/30 bg-danger/[0.08] text-danger"
      }`}
    >
      {estado.mensagem}
    </p>
  );
}

function Enviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-[var(--radius-control)] bg-gold px-5 py-2.5 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "…" : children}
    </button>
  );
}

/* ---------------------------------------------------------- escolher o Pal */

export function EscolherPalDoRitual({
  pals,
  servidor,
}: {
  pals: PalDisponivel[];
  servidor: string;
}) {
  const [estado, acao] = useActionState(acaoIniciarRitual, INICIAL);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aceitaDespertar, setAceitaDespertar] = useState(false);
  const despertadoSelecionado = pals.find((p) => p.instanceId === selecionado)?.isAwakening === true;

  // Só quem pode entrar na câmara aparece — a palbox inteira acinzentada com
  // o motivo em vermelho virava uma lista longa de Pal que não serve.
  // `iniciarRitual` revalida com a mesma regra no server.
  const elegiveis = useMemo(
    () => pals.filter((p) => elegibilidadeAlvo(p).ok),
    [pals],
  );

  if (pals.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhum Pal disponível — entre no jogo com o time ou a palbox aberta
        para escolher.
      </p>
    );
  }

  if (elegiveis.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhum Pal da sua palbox pode entrar na câmara — precisa de IV 100 em
        Vida, Ataque e Defesa e ser Full Condensado (rank 5).
      </p>
    );
  }

  return (
    <form action={acao}>
      <input type="hidden" name="servidor" value={servidor} />
      <input type="hidden" name="instanceId" value={selecionado ?? ""} />
      <input type="hidden" name="aceitaPerderDespertar" value={despertadoSelecionado && aceitaDespertar ? "1" : ""} />

      {/*
        O destaque vem do estado do React (`marcado`), nunca do CSS
        `has-checked:`. Com `has-checked:`, o dourado dependia do `:checked`
        real do DOM — e ao cancelar um ritual sem recarregar, o React
        reaproveitava os `<input>` da grade de doação (mesma estrutura, mesma
        `key` de `instanceId`, a mesma palbox nas duas). `checked` só é
        reescrito quando o valor muda, então um rádio já marcado continuava
        `:checked` e o card ficava aceso para sempre.
      */}
      <div className="grid max-h-[32rem] grid-cols-1 gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-2 sm:grid-cols-2">
        {elegiveis.map((p) => {
          const marcado = selecionado === p.instanceId;
          return (
            <label
              key={p.instanceId}
              className={`flex h-full cursor-pointer flex-col rounded-[var(--radius-control)] border p-2.5 transition-colors ${
                marcado
                  ? "border-gold bg-gold/[0.06]"
                  : "border-line bg-bg hover:border-line-strong"
              }`}
            >
              <input
                type="radio"
                name="_escolha"
                checked={marcado}
                onChange={() => {
                  setSelecionado(p.instanceId);
                  setAceitaDespertar(false);
                }}
                className="sr-only"
              />
              {p.isAwakening && (
                <span className="mb-1.5 self-start rounded-full border border-gold/40 bg-gold/[0.08] px-2 py-0.5 text-[11px] font-semibold text-gold">
                  Despertado · perde o despertar na Câmara
                </span>
              )}
              <PalCard
                pal={{
                  palId: p.palId,
                  nickname: p.nickname,
                  level: p.level,
                  gender: p.gender,
                  shiny: p.shiny,
                  condensedPals: p.partnerSkillLevel,
                  ivs: p.ivs,
                  passives: p.passives,
                }}
              />
            </label>
          );
        })}
      </div>

      {despertadoSelecionado && (
        <div className="mt-4 rounded-[var(--radius-control)] border border-gold/40 bg-gold/[0.06] px-4 py-3 text-sm">
          <p>{AVISO_DESPERTAR}</p>
          <label className="mt-2.5 flex cursor-pointer items-start gap-2 font-semibold">
            <input
              type="checkbox"
              checked={aceitaDespertar}
              onChange={(e) => setAceitaDespertar(e.target.checked)}
              className="mt-0.5"
            />
            Entendo que ele não volta despertado.
          </label>
        </div>
      )}

      <div className="mt-4">
        {despertadoSelecionado && !aceitaDespertar ? (
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-[var(--radius-control)] bg-gold px-5 py-2.5 text-sm font-semibold text-[#14120f] opacity-50"
          >
            Iniciar purificação com este Pal
          </button>
        ) : (
          <Enviar>Iniciar purificação com este Pal</Enviar>
        )}
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* --------------------------------------------- definir regra (só staff) */

/**
 * A lista de passivas aceitas do ritual, com um botão "Editar" visível só
 * para staff — abre o mesmo `EscolherPassivasDoRitual`, para redefinir a
 * regra mesmo depois do ritual já estar ativo (mudança de ideia do staff).
 */
export function PassivasDoRitual({
  ritualId,
  passivasAceitas,
  staff,
  catalogo,
  action,
  ehReferencia = false,
}: {
  /** Ausente quando `ehReferencia` — a sugestão não pertence a nenhum ritual. */
  ritualId?: number;
  passivasAceitas: string[];
  staff: boolean;
  catalogo: PassivaListada[];
  /** Padrão define a regra de um ritual ativo; passar `acaoAtualizarReferencia` edita a sugestão sem ritual em andamento. */
  action?: typeof acaoDefinirRegra;
  /**
   * Se `action` é `acaoAtualizarReferencia` — sinalizado explicitamente pelo
   * chamador em vez de comparar `action === acaoAtualizarReferencia`: Server
   * Actions passadas como prop nem sempre preservam igualdade de referência
   * entre o Server Component que as importa e o Client Component que as
   * recebe (bundling/HMR), o que fazia a comparação falhar em silêncio.
   */
  ehReferencia?: boolean;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#e8a33d" }}>
            {ehReferencia ? "Editar sugestão" : "Editar regra"}
          </h3>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-xs text-muted underline"
          >
            cancelar
          </button>
        </div>
        <EscolherPassivasDoRitual
          ritualId={ritualId}
          passivas={catalogo}
          action={action}
          ehReferencia={ehReferencia}
          onSucesso={() => setEditando(false)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {passivasAceitas.map((p) => {
          const rank = rankDaPassiva(p);
          const cor = rank !== null ? corDoRank(rank) : undefined;
          return (
            <span
              key={p}
              title={nomeDaPassiva(p)}
              className={`fundo-losango flex items-center gap-1 overflow-hidden rounded-full border bg-surface py-1 pr-2.5 pl-1.5 text-[0.75rem] ${rank === 5 ? "brilho-lendario" : ""}`}
              style={cor ? { borderColor: `${cor}88` } : undefined}
            >
              {rank !== null && (
                <span
                  aria-hidden
                  className="inline-block size-3.5 shrink-0"
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
            </span>
          );
        })}
      </div>
      {passivasAceitas.length > 0 && (
        <p className="mt-3 text-sm" style={{ color: "#5c6e66" }}>
          E ter pelo menos uma dessas passivas.
        </p>
      )}
      {staff && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="mt-3 rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-xs font-semibold transition-colors hover:border-gold hover:text-gold"
        >
          {ehReferencia
            ? passivasAceitas.length > 0
              ? "Editar sugestão (staff)"
              : "Definir sugestão (staff)"
            : "Editar passivas (staff)"}
        </button>
      )}
    </>
  );
}

/**
 * Campo numérico, visível só pra staff, pra mudar o IV mínimo de resgate —
 * configuração GLOBAL da Câmara inteira (padrão 110, até o teto de 150),
 * não por ritual: vale pra todo mundo ao mesmo tempo.
 */
export function IvMinimoResgateEditor({ ivAtual }: { ivAtual: number }) {
  const [estado, acao] = useActionState(acaoAtualizarIvMinimoResgate, INICIAL);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (estado.ok) setEditando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-xs font-semibold transition-colors hover:border-gold hover:text-gold"
      >
        Mudar IV mínimo de resgate — vale pra todos (staff) — hoje {ivAtual}
      </button>
    );
  }

  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <label htmlFor="iv-minimo-global" className="text-xs text-muted">
        IV mínimo de resgate (para todo mundo)
      </label>
      <input
        id="iv-minimo-global"
        name="ivMinimo"
        type="number"
        min={100}
        max={150}
        defaultValue={ivAtual}
        required
        className="w-20 rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1 text-sm outline-none focus:border-gold"
      />
      <Enviar>Salvar</Enviar>
      <button type="button" onClick={() => setEditando(false)} className="text-xs text-muted underline">
        cancelar
      </button>
      <Aviso estado={estado} />
    </form>
  );
}

export function EscolherPassivasDoRitual({
  ritualId,
  passivas,
  action = acaoDefinirRegra,
  pontoDePartida = [],
  ehReferencia = false,
  onSucesso,
}: {
  /** Ausente quando `ehReferencia` — a sugestão não pertence a nenhum ritual. */
  ritualId?: number;
  passivas: PassivaListada[];
  /** Padrão define a regra de um ritual ativo; passar `acaoAtualizarReferencia` edita a sugestão sem ritual em andamento. */
  action?: typeof acaoDefinirRegra;
  /** Chaves já marcadas ao abrir — ex: a sugestão configurada, como ponto de partida. */
  pontoDePartida?: string[];
  /** Só a "sugestão" (sem ritual ativo) tem prazo de validade — o ritual real, não. */
  ehReferencia?: boolean;
  /** Chamado depois de salvar com sucesso — o pai usa para fechar o modo de edição sozinho. */
  onSucesso?: () => void;
}) {
  const [estado, acao] = useActionState(action, INICIAL);
  const [busca, setBusca] = useState("");
  const [escolhidas, setEscolhidas] = useState<Set<string>>(() => new Set(pontoDePartida));
  const [dias, setDias] = useState(2);
  const [horas, setHoras] = useState(0);
  const [minutos, setMinutos] = useState(0);

  useEffect(() => {
    if (estado.ok) onSucesso?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const filtradas = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return passivas;
    return passivas.filter((p) => p.nome.toLowerCase().includes(alvo));
  }, [busca, passivas]);

  const alternar = (chave: string) => {
    setEscolhidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  };

  return (
    <form action={acao}>
      {ritualId !== undefined && <input type="hidden" name="ritualId" value={ritualId} />}
      {[...escolhidas].map((chave) => (
        <input key={chave} type="hidden" name="passivas" value={chave} />
      ))}

      <input
        type="search"
        placeholder="Buscar passiva…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="w-full rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 py-1.5 text-sm outline-none focus:border-gold"
      />

      <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-[var(--radius-control)] border border-line bg-bg p-2">
        {filtradas.map((p) => {
          const cor = p.rank !== null ? corDoRank(p.rank) : undefined;
          const marcada = escolhidas.has(p.chave);
          return (
            <button
              key={p.chave}
              type="button"
              onClick={() => alternar(p.chave)}
              title={p.nome}
              className={`fundo-losango flex cursor-pointer items-center gap-1 overflow-hidden rounded-full border py-0.5 pr-2 pl-1 text-[0.7rem] transition-colors ${
                p.rank === 5 ? "brilho-lendario" : ""
              } ${marcada ? "" : "bg-surface hover:bg-surface-2"}`}
              style={
                marcada
                  ? { backgroundColor: "rgba(232,163,61,0.28)", borderColor: "var(--gold)", borderWidth: 2 }
                  : { borderColor: cor ? `${cor}88` : undefined }
              }
            >
              {p.rank !== null && (
                <span
                  aria-hidden
                  className="inline-block size-3 shrink-0"
                  style={{
                    backgroundColor: cor,
                    WebkitMaskImage: `url(${urlDoIconeRank(p.rank)})`,
                    maskImage: `url(${urlDoIconeRank(p.rank)})`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                  }}
                />
              )}
              {p.nome}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-muted">
        {escolhidas.size} passiva(s) escolhida(s) — qualquer uma delas serve
        para qualquer um dos 4 doadores desta purificação.
      </p>

      {ehReferencia && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <span className="w-full text-xs text-muted">Vale por quanto tempo</span>
          <input type="hidden" name="dias" value={dias} />
          <input type="hidden" name="horas" value={horas} />
          <input type="hidden" name="minutos" value={minutos} />
          <label className="flex flex-col gap-1 text-xs text-muted">
            dias
            <input
              type="number"
              min={0}
              max={DIAS_REFERENCIA_MAXIMO}
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              className="w-16 rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1 text-sm outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            horas
            <input
              type="number"
              min={0}
              max={23}
              value={horas}
              onChange={(e) => setHoras(Number(e.target.value))}
              className="w-16 rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1 text-sm outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            min
            <input
              type="number"
              min={0}
              max={59}
              value={minutos}
              onChange={(e) => setMinutos(Number(e.target.value))}
              className="w-16 rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1 text-sm outline-none focus:border-gold"
            />
          </label>
        </div>
      )}

      <div className="mt-3">
        <Enviar>{ehReferencia ? "Salvar sugestão" : "Ativar purificação com esta regra"}</Enviar>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* ------------------------------------------------------------- cancelar */

/**
 * `cooldownHoras`: quanto tempo o Pal fica preso no cofre depois de
 * cancelar — vem do server (`COOLDOWN_RESGATE_HORAS`, `lib/pal-cofre.ts`),
 * que não pode ser importado aqui direto (puxa `@/lib/db`/`@/auth`).
 * Avisado no popup de confirmação: cancelar não devolve o Pal na hora, ele
 * some da tela até esse prazo passar — pedido do dono em 21/09/2026, depois
 * do Felbat do SantØs ter sumido ao cancelar sem nenhum aviso disso.
 */
export function CancelarRitual({
  ritualId,
  cooldownHoras,
}: {
  ritualId: number;
  cooldownHoras: number;
}) {
  const [estado, acao] = useActionState(acaoCancelarRitual, INICIAL);

  const confirmar = (e: React.FormEvent<HTMLFormElement>) => {
    if (
      !confirm(
        `Tem certeza? O progresso desta purificação se perde, e o Pal vai para o seu cofre — ` +
          `só pode ser resgatado de lá depois de ${cooldownHoras}h.`,
      )
    ) {
      e.preventDefault();
    }
  };

  return (
    <form action={acao} onSubmit={confirmar}>
      <input type="hidden" name="ritualId" value={ritualId} />
      <button
        type="submit"
        className="rounded-[var(--radius-control)] border border-danger/40 px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/[0.08]"
      >
        Trocar de Pal (cancela esta purificação)
      </button>
      <Aviso estado={estado} />
    </form>
  );
}

/* ------------------------------------------------------------------- doar */

/**
 * Um card da grade de doadores, memoizado — com listas de 100+ Pals, sem
 * isso todo card recalculava `elegibilidadeDoador` e re-renderizava a cada
 * clique em QUALQUER item (o clique só muda `selecionado`, mas o
 * `.map()` inteiro rodava de novo), travando a aba por meio segundo a cada
 * seleção. `React.memo` faz cada card só re-renderizar quando a própria
 * seleção dele muda.
 */
const CardDeDoador = memo(function CardDeDoador({
  pal,
  passivasAceitas,
  palIdDoAlvo,
  marcado,
  desabilitado,
  onSelecionar,
}: {
  pal: PalDisponivel;
  passivasAceitas: string[];
  palIdDoAlvo: string;
  marcado: boolean;
  desabilitado: boolean;
  onSelecionar: (instanceId: string) => void;
}) {
  const elegivel = elegibilidadeDoador(pal, passivasAceitas, palIdDoAlvo);
  return (
    <label
      title={elegivel.ok ? "" : elegivel.motivo}
      className={`flex h-full flex-col rounded-[var(--radius-control)] border p-2.5 transition-colors has-checked:border-gold has-checked:bg-gold/[0.06] ${
        desabilitado ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${elegivel.ok ? "border-line bg-bg hover:border-line-strong" : "border-line bg-bg opacity-45"}`}
    >
      <input
        type="radio"
        name="_escolha"
        checked={marcado}
        disabled={desabilitado}
        onChange={() => onSelecionar(pal.instanceId)}
        className="sr-only"
      />
      <PalCard
        pal={{
          palId: pal.palId,
          nickname: pal.nickname,
          level: pal.level,
          gender: pal.gender,
          shiny: pal.shiny,
          condensedPals: pal.partnerSkillLevel,
          ivs: pal.ivs,
          passives: pal.passives,
        }}
      />
      <p className="mt-1.5 min-h-[2.1em] text-[0.7rem] text-danger">
        {!elegivel.ok && elegivel.motivo}
      </p>
    </label>
  );
});

/**
 * A grade de Pals candidatos a doador, travada enquanto o envio está em
 * andamento (`pending` de `useFormStatus`) — só funciona aqui, dentro do
 * `<form>`, não no componente pai que o renderiza. Sem isso, um clique
 * duplo/rápido em Pals diferentes enquanto o servidor ainda processa a
 * doação anterior podia deixar a seleção inconsistente com o que já foi
 * enviado.
 */
function ListaDeDoadores({
  pals,
  passivasAceitas,
  palIdDoAlvo,
  selecionado,
  onSelecionar,
}: {
  pals: PalDisponivel[];
  passivasAceitas: string[];
  palIdDoAlvo: string;
  selecionado: string | null;
  onSelecionar: (instanceId: string) => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="grid max-h-[32rem] grid-cols-1 gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-2 sm:grid-cols-2">
      {pals.map((p) => (
        <CardDeDoador
          key={p.instanceId}
          pal={p}
          passivasAceitas={passivasAceitas}
          palIdDoAlvo={palIdDoAlvo}
          marcado={selecionado === p.instanceId}
          desabilitado={pending}
          onSelecionar={onSelecionar}
        />
      ))}
    </div>
  );
}

export function DoarPal({
  pals,
  passivasAceitas,
  palIdDoAlvo,
}: {
  pals: PalDisponivel[];
  passivasAceitas: string[];
  palIdDoAlvo: string;
}) {
  const [estado, acao] = useActionState(acaoDoarPal, INICIAL);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const router = useRouter();

  // Depois de doar com sucesso, o Pal já saiu da palbox de verdade (RCON),
  // mas a prop `pals` deste componente client continua sendo a da carga
  // anterior da página — sem isso, o card doado continuava selecionável na
  // tela até um F5 manual. `router.refresh()` reexecuta o server component
  // pai, que busca a palbox de novo sem o Pal que acabou de sair.
  useEffect(() => {
    if (estado.ok) {
      setSelecionado(null);
      router.refresh();
    }
  }, [estado, router]);

  // Só a mesma espécie do alvo (alfa e comum contam iguais) pode doar
  // (`elegibilidadeDoador`) — filtrar antes de renderizar em vez de
  // desenhar e desabilitar os ~280 Pals da palbox inteira. Numa palbox
  // cheia, montar todos os cards a cada clique travava a aba por meio
  // segundo (visível como "tela preta" — não era crash, era o navegador
  // ocupado demais pra pintar a tela).
  const candidatos = useMemo(
    () => pals.filter((p) => mesmaEspecie(p.palId, palIdDoAlvo)),
    [pals, palIdDoAlvo],
  );

  if (pals.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhum Pal disponível — entre no jogo com o time ou a palbox aberta
        para doar.
      </p>
    );
  }

  if (candidatos.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhum Pal da mesma espécie disponível na palbox agora.
      </p>
    );
  }

  return (
    <form action={acao}>
      <input type="hidden" name="instanceId" value={selecionado ?? ""} />

      <p className="mb-1.5 text-[0.7rem] text-muted">Escolha 1 Pal por vez para doar.</p>
      <ListaDeDoadores
        pals={candidatos}
        passivasAceitas={passivasAceitas}
        palIdDoAlvo={palIdDoAlvo}
        selecionado={selecionado}
        onSelecionar={setSelecionado}
      />

      <div className="mt-4">
        <Enviar>Doar Pal escolhido</Enviar>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* --------------------------------------------------------------- resgatar */

const SEM_RESGATE: EstadoResgate = { ok: false, mensagem: "" };

/**
 * Resgata o Pal purificado de volta pra palbox, a partir de IV 110 — mesmo
 * mecanismo de duas fases do cofre, com polling até o `givepal_j` confirmar.
 *
 * `pendente`: quando a página descobre no server (`meuResgatePendenteDaCamara`)
 * que já existe uma transferência em andamento — a pessoa clicou "Resgatar",
 * fechou a aba ou navegou antes do polling terminar, e o `transferId` que
 * vivia só no `useActionState` deste componente se perdeu no remount. Sem
 * isso, a transferência ficava presa em `arquivo_pronto` para sempre: o
 * arquivo já estava pronto no servidor, mas o `givepal_j` nunca era chamado
 * de novo porque ninguém mais consultava aquele `transferId`.
 */
export function ResgatarPal({
  ritualId,
  pendente,
}: {
  ritualId: number;
  pendente?: { transferId: number; palId: string };
}) {
  const [estado, acao] = useActionState(acaoResgatarPal, SEM_RESGATE);
  const [status, setStatus] = useState<{ status: string; detail: string; palId: string } | null>(null);

  const transferId = estado.transferId ?? pendente?.transferId;

  useEffect(() => {
    if (!transferId) return;
    if (status?.status === "concluido" || status?.status === "falhou") return;

    let ativo = true;
    const consultar = async () => {
      const r = await acaoConsultarResgate(transferId);
      if (ativo && r) setStatus(r);
    };
    consultar();
    const t = setInterval(consultar, 3000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, [transferId, status?.status]);

  if (status?.status === "concluido") {
    return (
      <p
        className="rounded-[var(--radius-control)] border px-4 py-3 text-sm"
        style={{ borderColor: "rgba(61,220,132,0.3)", background: "rgba(61,220,132,0.08)", color: "#3ddc84" }}
      >
        Pal resgatado — confira sua palbox.
      </p>
    );
  }

  if (pendente && !estado.transferId) {
    return (
      <p className="text-center text-xs text-muted">
        {status?.status === "falhou" ? "O resgate falhou — fale com o staff." : "Resgatando…"}
      </p>
    );
  }

  return (
    <form action={acao}>
      <input type="hidden" name="ritualId" value={ritualId} />
      <Enviar>Resgatar Pal</Enviar>
      {status && status.status !== "concluido" && (
        <p className="mt-2 text-xs text-muted">
          {status.status === "falhou" ? "O resgate falhou — fale com o staff." : "Resgatando…"}
        </p>
      )}
      <Aviso estado={estado} />
    </form>
  );
}

/* ------------------------------------------------------ contagem regressiva */

/**
 * Quanto tempo falta para a "sugestão de passivas" (`ReferenciaDeRegra`)
 * expirar — client component porque precisa recalcular sozinho enquanto o
 * tempo passa, sem esperar o jogador recarregar a página.
 *
 * Ao chegar a zero, chama `router.refresh()` — sem isso a tela ficava presa
 * em "expirando…" para sempre, porque só um F5 de verdade reexecutava o
 * Server Component e buscava a sugestão nova (`passivasDoUltimoRitual`
 * sorteia uma automaticamente quando a atual expirou). Pedido do dono em
 * 21/09/2026: o sorteio precisa acontecer sozinho, sem depender de alguém
 * recarregar a página na mão.
 */
export function ContagemRegressiva({ expiraEm }: { expiraEm: string }) {
  const router = useRouter();
  const alvo = useMemo(() => new Date(expiraEm).getTime(), [expiraEm]);
  const [restanteMs, setRestanteMs] = useState(() => alvo - Date.now());
  const [jaAtualizou, setJaAtualizou] = useState(false);

  useEffect(() => {
    setRestanteMs(alvo - Date.now());
    setJaAtualizou(false);
    const t = setInterval(() => setRestanteMs(alvo - Date.now()), 1000);
    return () => clearInterval(t);
  }, [alvo]);

  useEffect(() => {
    if (restanteMs <= 0 && !jaAtualizou) {
      setJaAtualizou(true);
      router.refresh();
    }
  }, [restanteMs, jaAtualizou, router]);

  if (restanteMs <= 0) {
    return <span style={{ color: "#5c6e66" }}>atualizando…</span>;
  }

  const horas = Math.floor(restanteMs / 3_600_000);
  const minutos = Math.floor((restanteMs % 3_600_000) / 60_000);
  const segundos = Math.floor((restanteMs % 60_000) / 1000);

  const texto =
    horas > 0
      ? `${horas}h ${String(minutos).padStart(2, "0")}min`
      : `${minutos}min ${String(segundos).padStart(2, "0")}s`;

  return <span style={{ color: "#e8a33d" }}>{texto}</span>;
}
