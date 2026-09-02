"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  acaoGuardarPal,
  acaoResgatarPal,
  acaoAnunciarPal,
  acaoSemearTeste,
  consultarResgate,
  type Estado,
  type EstadoResgate,
} from "./actions";
import { nomeDoPal } from "@/lib/pals";
import { PalCard } from "@/components/pal-card";
import { PRECO_MINIMO, PRECO_MAXIMO } from "@/lib/mercado-regras";
import type { PalDisponivel, ResgatePendente } from "@/lib/pal-cofre";
import type { PersonagemOnline } from "@/lib/cofre";

const INICIAL: Estado = { ok: false, mensagem: "" };
const INICIAL_RESGATE: EstadoResgate = { ok: false, mensagem: "" };

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
      className="shrink-0 rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm font-semibold transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "…" : children}
    </button>
  );
}

/* --------------------------------------------------------------- guardar */

export function GuardarPals({
  pals,
  servidor,
}: {
  pals: PalDisponivel[];
  servidor: string;
}) {
  const [estado, acao] = useActionState(acaoGuardarPal, INICIAL);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  return (
    <form action={acao}>
      <input type="hidden" name="servidor" value={servidor} />
      <input type="hidden" name="instanceId" value={selecionado ?? ""} />

      <div className="grid max-h-[32rem] grid-cols-1 gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-2 sm:grid-cols-2">
        {pals.map((p) => (
          <label
            key={p.instanceId}
            className="cursor-pointer rounded-[var(--radius-control)] border border-line bg-bg p-2.5 transition-colors hover:border-line-strong has-checked:border-gold has-checked:bg-gold/[0.06]"
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
                condensedPals: p.condensedPals,
                ivs: p.ivs,
                passives: p.passives,
              }}
            />
          </label>
        ))}
      </div>

      <div className="mt-4">
        <Enviar>Guardar Pal escolhido</Enviar>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* -------------------------------------------------------------- resgatar */

interface ItemDoCofre {
  id: number;
  palId: string;
  /** De qual servidor este Pal saiu — nulo para Pal de antes da trava (§006). */
  serverSlug?: string | null;
  serverNome?: string | null;
}

function CampoServidor({ onde }: { onde: PersonagemOnline[] }) {
  if (onde.length === 1) {
    return <input type="hidden" name="servidor" value={onde[0].serverSlug} />;
  }
  return (
    <select
      name="servidor"
      aria-label="Servidor"
      className="rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1.5 text-sm"
    >
      {onde.map((o) => (
        <option key={o.serverSlug} value={o.serverSlug}>
          {o.serverName}
        </option>
      ))}
    </select>
  );
}

export function ResgatarPal({
  pal,
  onde,
}: {
  pal: ItemDoCofre;
  onde: PersonagemOnline[];
}) {
  const [estado, acao] = useActionState(acaoResgatarPal, INICIAL_RESGATE);

  if (estado.transferId) {
    return <Acompanhar transferId={estado.transferId} palId={pal.palId} />;
  }

  // Trava de servidor (§006): este Pal só resgata onde saiu. Sem isso, dava
  // para escolher outro servidor a cada resgate e inflar contador de
  // captura do jogo sem capturar nada de novo.
  if (pal.serverSlug) {
    const online = onde.find((o) => o.serverSlug === pal.serverSlug);
    if (!online) {
      return (
        <span className="text-xs text-muted">
          entre no jogo no {pal.serverNome ?? pal.serverSlug} para resgatar
        </span>
      );
    }
    return (
      <form action={acao} className="flex items-center gap-2">
        <input type="hidden" name="vaultPalId" value={pal.id} />
        <input type="hidden" name="servidor" value={online.serverSlug} />
        <Enviar>Resgatar no {online.serverName}</Enviar>
        <Aviso estado={estado} />
      </form>
    );
  }

  if (!onde.length) {
    return (
      <span className="text-xs text-muted">entre no jogo para resgatar</span>
    );
  }

  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="vaultPalId" value={pal.id} />
      <CampoServidor onde={onde} />
      <Enviar>Resgatar</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}

/* -------------------------------------------------------------- anunciar */

export function AnunciarPal({ pal }: { pal: ItemDoCofre }) {
  const [estado, acao] = useActionState(acaoAnunciarPal, INICIAL);

  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="vaultPalId" value={pal.id} />
      <label className="sr-only" htmlFor={`preco-${pal.id}`}>
        Preço em Paletas
      </label>
      <input
        id={`preco-${pal.id}`}
        name="preco"
        type="number"
        min={PRECO_MINIMO}
        max={PRECO_MAXIMO}
        defaultValue={30}
        required
        className="tabular w-20 rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1.5 text-right text-sm"
      />
      <Enviar>Anunciar</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}

const ESTADO_LABEL: Record<string, string> = {
  aguardando_arquivo: "Preparando a entrega…",
  arquivo_pronto: "Entregando no jogo…",
  concluido: "Entregue!",
  falhou: "Não deu certo",
  andando: "Aguardando confirmação…",
};

/**
 * Acompanha a entrega, com polling.
 *
 * Duas fases visíveis: o GitHub Actions escreve o arquivo (leva alguns
 * segundos para o workflow sequer começar), depois a Vercel chama o
 * `givepal_j`. Sem isso na tela, a pessoa acha que travou.
 */
export function Acompanhar({ transferId, palId }: { transferId: number; palId: string }) {
  const [status, setStatus] = useState<string>("aguardando_arquivo");
  const [detalhe, setDetalhe] = useState("");
  const parado = useRef(false);

  useEffect(() => {
    parado.current = false;
    let ativo = true;

    const consultar = async () => {
      const r = await consultarResgate(transferId);
      if (!ativo) return;
      if (!r) return;
      setStatus(r.status);
      setDetalhe(r.detail);
      if (r.status === "concluido" || r.status === "falhou") {
        parado.current = true;
      }
    };

    consultar();
    const intervalo = setInterval(() => {
      if (!parado.current) consultar();
    }, 4000);

    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [transferId]);

  const cor =
    status === "concluido"
      ? "text-success"
      : status === "falhou"
        ? "text-danger"
        : "text-muted";

  return (
    <div className="text-right">
      <p className={`text-sm font-medium ${cor}`}>
        {ESTADO_LABEL[status] ?? status}
      </p>
      {status === "falhou" && detalhe && (
        <p className="mt-0.5 max-w-56 text-xs text-danger">{detalhe}</p>
      )}
      {status !== "concluido" && status !== "falhou" && (
        <p className="text-xs text-muted">{nomeDoPal(palId)}</p>
      )}
    </div>
  );
}

/**
 * Resgates que ficaram pelo meio: a aba fechou antes do `Acompanhar` acabar
 * o polling. A entrada aqui basta para o efeito de `Acompanhar` retomar
 * sozinho — sem isso o Pal fica preso para sempre entre o cofre e o jogo.
 */
export function EntregasPendentes({ pendentes }: { pendentes: ResgatePendente[] }) {
  if (!pendentes.length) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Entregas pendentes</h2>
      <p className="mt-1 text-sm text-muted">
        Ficaram no meio do caminho — provavelmente a aba fechou antes de
        terminar. Retomando sozinho.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {pendentes.map((p) => (
          <div
            key={p.transferId}
            className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface p-4"
          >
            <span className="text-sm font-medium">{nomeDoPal(p.palId)}</span>
            <Acompanhar transferId={p.transferId} palId={p.palId} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------ semear Pal de teste (§9.2) */

/**
 * Cola um `PalTemplate` (ex.: exportado de paldeck.cc/palcreator) e guarda
 * no cofre de quem está logado — sem passar pelo jogo. Só aparece na tela
 * para staff (a checagem de verdade mora em `semearPalDeTeste`).
 *
 * Serve para testar a metade que importa validar: a **entrega**. Um Pal de
 * teste percorre exatamente o mesmo caminho de risco (SFTP + `givepal_j`)
 * que um Pal vendido de verdade, sem precisar tirar nada de ninguém.
 */
export function SemearPalDeTeste() {
  const [estado, acao] = useActionState(acaoSemearTeste, INICIAL);

  return (
    <details className="mt-10 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-5">
      <summary className="cursor-pointer text-sm font-semibold text-muted">
        🔧 Staff — semear Pal de teste
      </summary>

      <p className="mt-3 max-w-xl text-sm text-muted">
        Cole aqui o JSON de um <code>PalTemplate</code> — por exemplo,
        exportado do{" "}
        <a
          href="https://paldeck.cc/palcreator"
          target="_blank"
          rel="noreferrer"
          className="text-gold hover:text-gold-hi"
        >
          paldeck.cc/palcreator
        </a>
        . Ele entra direto no seu cofre, sem tocar em Pal de ninguém — dá
        para testar o resgate (SFTP + entrega) sem risco.
      </p>

      <form action={acao} className="mt-3">
        <textarea
          name="json"
          required
          rows={6}
          placeholder='{ "PalID": "Anubis", "Level": 20, ... }'
          className="w-full rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-gold"
        />
        <div className="mt-3">
          <Enviar>Guardar no meu cofre</Enviar>
        </div>
        <Aviso estado={estado} />
      </form>
    </details>
  );
}
