"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { acaoDefinirRegra, acaoCancelarRitual, type Estado } from "./actions";
import { PalCard } from "@/components/pal-card";
import type { PassivaListada } from "@/lib/passivas";

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
      className="shrink-0 rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm font-semibold transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "…" : children}
    </button>
  );
}

interface RitualPendenteView {
  id: number;
  palId: string;
  template: {
    Nickname?: string;
    Level?: number;
    Gender?: string;
    Shiny?: boolean;
    CondensedPals?: number;
    IVs?: Record<string, number>;
    Passives?: string[];
  };
}

export function FormularioRegra({
  ritual,
  passivas,
}: {
  ritual: RitualPendenteView;
  passivas: PassivaListada[];
}) {
  const [estado, acao] = useActionState(acaoDefinirRegra, INICIAL);
  const [busca, setBusca] = useState("");
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());

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
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
        <PalCard
          pal={{
            palId: ritual.palId,
            nickname: ritual.template.Nickname,
            level: ritual.template.Level ?? 1,
            gender: ritual.template.Gender,
            shiny: ritual.template.Shiny,
            condensedPals: ritual.template.CondensedPals,
            ivs: ritual.template.IVs,
            passives: ritual.template.Passives,
          }}
          detalhado
        />

        <form action={acao}>
          <input type="hidden" name="ritualId" value={ritual.id} />
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

          <div className="mt-2 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-[var(--radius-control)] border border-line bg-bg p-2 sm:grid-cols-2">
            {filtradas.map((p) => (
              <label
                key={p.chave}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 text-sm hover:bg-surface-2 has-checked:bg-gold/[0.08]"
              >
                <input
                  type="checkbox"
                  checked={escolhidas.has(p.chave)}
                  onChange={() => alternar(p.chave)}
                />
                {p.nome}
              </label>
            ))}
          </div>

          <p className="mt-2 text-xs text-muted">
            {escolhidas.size} passiva(s) escolhida(s) — qualquer uma delas
            serve para qualquer um dos 4 doadores deste ritual.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Enviar>Ativar ritual com esta regra</Enviar>
          </div>
          <Aviso estado={estado} />
        </form>
      </div>
    </div>
  );
}

export function CancelarRitual({ ritualId }: { ritualId: number }) {
  const [estado, acao] = useActionState(acaoCancelarRitual, INICIAL);
  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="ritualId" value={ritualId} />
      <Enviar>Cancelar ritual</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
