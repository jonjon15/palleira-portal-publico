"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { acaoIniciarRitual, acaoDoarPal, type Estado } from "./actions";
import { PalCard } from "@/components/pal-card";
import { elegibilidadeDoador } from "@/lib/purificacao-regras";
import type { PalDisponivel } from "@/lib/pal-cofre";

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
        <Enviar>Iniciar ritual com este Pal</Enviar>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* ------------------------------------------------------------------- doar */

export function DoarPal({
  pals,
  passivasAceitas,
}: {
  pals: PalDisponivel[];
  passivasAceitas: string[];
}) {
  const [estado, acao] = useActionState(acaoDoarPal, INICIAL);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  if (pals.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhum Pal disponível — entre no jogo com o time ou a palbox aberta
        para doar.
      </p>
    );
  }

  return (
    <form action={acao}>
      <input type="hidden" name="instanceId" value={selecionado ?? ""} />

      <div className="grid max-h-[32rem] grid-cols-1 gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-2 sm:grid-cols-2">
        {pals.map((p) => {
          const elegivel = elegibilidadeDoador(p, passivasAceitas);
          return (
            <label
              key={p.instanceId}
              title={elegivel.ok ? "" : elegivel.motivo}
              className={`cursor-pointer rounded-[var(--radius-control)] border p-2.5 transition-colors has-checked:border-gold has-checked:bg-gold/[0.06] ${
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
                  condensedPals: p.condensedPals,
                  ivs: p.ivs,
                  passives: p.passives,
                }}
              />
              {!elegivel.ok && (
                <p className="mt-1.5 text-[0.7rem] text-danger">{elegivel.motivo}</p>
              )}
            </label>
          );
        })}
      </div>

      <div className="mt-4">
        <Enviar>Doar Pal escolhido</Enviar>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}
