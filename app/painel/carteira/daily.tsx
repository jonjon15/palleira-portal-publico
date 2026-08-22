"use client";

import { useActionState } from "react";
import { pegarDaily, type Estado } from "./actions";

const INICIAL: Estado = { ok: false, mensagem: "" };

export function BotaoDaily({ quanto }: { quanto: number }) {
  const [estado, acao, pendente] = useActionState(
    async () => pegarDaily(),
    INICIAL,
  );

  return (
    <form action={acao}>
      <button
        type="submit"
        disabled={pendente}
        className="inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendente ? "Pegando…" : `Pegar ${quanto} Paletas`}
      </button>
      {estado.mensagem && (
        <p
          role="status"
          className={`mt-3 text-sm ${estado.ok ? "text-success" : "text-danger"}`}
        >
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}
