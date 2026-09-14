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
import { elegibilidadeDoador, elegibilidadeAlvo } from "@/lib/purificacao-regras";
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

  if (pals.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhum Pal disponível — entre no jogo com o time ou a palbox aberta
        para escolher.
      </p>
    );
  }

  return (
    <form action={acao}>
      <input type="hidden" name="servidor" value={servidor} />
      <input type="hidden" name="instanceId" value={selecionado ?? ""} />

      <div className="grid max-h-[32rem] grid-cols-1 gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-2 sm:grid-cols-2 sm:auto-rows-fr">
        {pals.map((p) => {
          const elegivel = elegibilidadeAlvo(p);
          return (
            <label
              key={p.instanceId}
              title={elegivel.ok ? "" : elegivel.motivo}
              className={`flex cursor-pointer flex-col rounded-[var(--radius-control)] border p-2.5 transition-colors has-checked:border-gold has-checked:bg-gold/[0.06] ${
                elegivel.ok
                  ? "border-line bg-bg hover:border-line-strong"
                  : "border-line bg-bg opacity-45"
              }`}
            >
              <input
                type="radio"
                name="_escolha"
                checked={selecionado === p.instanceId}
                onChange={() => setSelecionado(p.instanceId)}
                className="sr-only"
              />
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
              <p className="mt-1.5 text-[0.7rem] text-danger">
                {!elegivel.ok && elegivel.motivo}
              </p>
            </label>
          );
        })}
      </div>

      <div className="mt-4">
        <Enviar>Iniciar purificação com este Pal</Enviar>
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
}: {
  ritualId: number;
  passivasAceitas: string[];
  staff: boolean;
  catalogo: PassivaListada[];
  /** Padrão define a regra de um ritual ativo; passar `acaoAtualizarReferencia` edita a referência sem ritual em andamento. */
  action?: typeof acaoDefinirRegra;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-[0.04em] uppercase" style={{ color: "#e8a33d" }}>
            Editar regra
          </h3>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-xs text-muted underline"
          >
            cancelar
          </button>
        </div>
        <EscolherPassivasDoRitual ritualId={ritualId} passivas={catalogo} action={action} />
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
      <p className="mt-3 text-sm" style={{ color: "#5c6e66" }}>
        E ter pelo menos uma dessas passivas.
      </p>
      {staff && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="mt-3 rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-xs font-semibold transition-colors hover:border-gold hover:text-gold"
        >
          Editar passivas (staff)
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
}: {
  ritualId: number;
  passivas: PassivaListada[];
  /** Padrão define a regra de um ritual ativo; passar `acaoAtualizarReferencia` edita a referência sem ritual em andamento. */
  action?: typeof acaoDefinirRegra;
  /** Chaves já marcadas ao abrir — ex: a regra do último ritual configurado, como sugestão. */
  pontoDePartida?: string[];
}) {
  const [estado, acao] = useActionState(action, INICIAL);
  const [busca, setBusca] = useState("");
  const [escolhidas, setEscolhidas] = useState<Set<string>>(() => new Set(pontoDePartida));

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
      <input type="hidden" name="ritualId" value={ritualId} />
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

      <div className="mt-3">
        <Enviar>Ativar purificação com esta regra</Enviar>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* ------------------------------------------------------------- cancelar */

export function CancelarRitual({ ritualId }: { ritualId: number }) {
  const [estado, acao] = useActionState(acaoCancelarRitual, INICIAL);

  const confirmar = (e: React.FormEvent<HTMLFormElement>) => {
    if (!confirm("Tem certeza? O Pal sai da câmara e o progresso desta purificação se perde.")) {
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
      className={`flex flex-col rounded-[var(--radius-control)] border p-2.5 transition-colors has-checked:border-gold has-checked:bg-gold/[0.06] ${
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
      <p className="mt-1.5 text-[0.7rem] text-danger">
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
    <div className="grid max-h-[32rem] grid-cols-1 gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-2 sm:grid-cols-2 sm:auto-rows-fr">
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

  // Só a mesma espécie do alvo pode doar de qualquer forma
  // (`elegibilidadeDoador`) — filtrar antes de renderizar em vez de
  // desenhar e desabilitar os ~280 Pals da palbox inteira. Numa palbox
  // cheia, montar todos os cards a cada clique travava a aba por meio
  // segundo (visível como "tela preta" — não era crash, era o navegador
  // ocupado demais pra pintar a tela).
  const candidatos = useMemo(
    () => pals.filter((p) => p.palId === palIdDoAlvo),
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
