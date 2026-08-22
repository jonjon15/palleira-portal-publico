"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { acaoPedirCodigo, acaoConfirmar, type Estado } from "./actions";
import type { Personagem, Pendente } from "@/lib/linking";

/** Nada de mensagem antes da primeira tentativa. */
const ESTADO_INICIAL: Estado = { ok: false, mensagem: "" };

/* ------------------------------------------------------------------- peças */

function Botao({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Só um instante…" : children}
    </button>
  );
}

function Aviso({ estado }: { estado: Estado }) {
  if (!estado.mensagem) return null;
  return (
    <p
      role="status"
      className={`mt-4 rounded-[var(--radius-control)] border px-4 py-3 text-sm ${
        estado.ok
          ? "border-success/30 bg-success/[0.08] text-success"
          : "border-danger/30 bg-danger/[0.08] text-danger"
      }`}
    >
      {estado.mensagem}
    </p>
  );
}

/* ------------------------------------------------- passo 1: qual personagem */

export function EscolherPersonagem({
  personagens,
}: {
  personagens: Personagem[];
}) {
  const [estado, acao] = useActionState(acaoPedirCodigo, ESTADO_INICIAL);

  return (
    <form action={acao}>
      <fieldset>
        <legend className="sr-only">Escolha o seu personagem</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {personagens.map((p) => (
            <label
              key={`${p.serverSlug}:${p.uid}`}
              className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-line-strong has-checked:border-gold has-checked:bg-gold/[0.06]"
            >
              <input
                type="radio"
                name="alvo"
                value={`${p.serverSlug}|${p.uid}`}
                required
                className="size-4 shrink-0 accent-[var(--gold)]"
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-sm text-muted">
                  {p.serverName} · {p.guildName}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <Botao>Enviar código no jogo</Botao>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* ------------------------------------------------------ passo 2: o código */

export function DigitarCodigo({ pendente }: { pendente: Pendente }) {
  const [estado, acao] = useActionState(acaoConfirmar, ESTADO_INICIAL);

  return (
    <form action={acao}>
      <label htmlFor="codigo" className="block text-sm text-muted">
        Código que apareceu no chat de <b className="text-text">
          {pendente.playerName}
        </b>
      </label>
      <div className="mt-2 flex flex-wrap gap-3">
        <input
          id="codigo"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          placeholder="000000"
          required
          autoFocus
          className="tabular w-40 rounded-[var(--radius-control)] border border-line-strong bg-bg px-4 py-2.5 text-center text-2xl font-bold tracking-[0.3em] outline-none focus:border-gold"
        />
        <Botao>Confirmar</Botao>
      </div>
      <p className="mt-2 text-xs text-muted">
        {pendente.tentativasRestantes} tentativa
        {pendente.tentativasRestantes === 1 ? "" : "s"} restante
        {pendente.tentativasRestantes === 1 ? "" : "s"} · vale 10 minutos
      </p>
      <Aviso estado={estado} />
    </form>
  );
}
