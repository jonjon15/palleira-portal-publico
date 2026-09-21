"use client";

import { useActionState, useState } from "react";
import { ajustarSaldo, type EstadoAjuste } from "./actions";

const SEM_AJUSTE: EstadoAjuste = { ok: false, mensagem: "" };

const botao =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50";

const campo =
  "w-full rounded-[var(--radius-control)] border border-line bg-bg px-4 py-2.5 outline-none focus:border-gold";

function Aviso({ ok, mensagem }: { ok: boolean; mensagem: string }) {
  if (!mensagem) return null;
  return (
    <p
      role="status"
      className={`mt-4 rounded-[var(--radius-control)] border px-4 py-3 text-sm ${
        ok
          ? "border-success/30 bg-success/[0.08] text-success"
          : "border-danger/30 bg-danger/[0.08] text-danger"
      }`}
    >
      {mensagem}
    </p>
  );
}

/* --------------------------------------------------------------- ajuste */

/**
 * Único formulário de ajuste de saldo — junta o que antes eram duas telas
 * (migrar em lote via Palbot, e ajuste com delta). O jogador vem de um
 * `<select>` com quem já vinculou personagem, em vez de colar o ID na mão.
 */
export function AjustarSaldo({
  jogadores,
}: {
  jogadores: { discordId: string; nome: string }[];
}) {
  const [estado, acao, pendente] = useActionState(ajustarSaldo, SEM_AJUSTE);
  const [modo, setModo] = useState<"delta" | "definir">("delta");

  return (
    <form action={acao} className="space-y-3">
      <div>
        <label htmlFor="discordId" className="block text-sm text-muted">
          Jogador
        </label>
        <select
          id="discordId"
          name="discordId"
          required
          defaultValue=""
          className={`${campo} mt-1.5`}
        >
          <option value="" disabled>
            Escolha quem já vinculou personagem…
          </option>
          {jogadores.map((j) => (
            <option key={j.discordId} value={j.discordId}>
              {j.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="block text-sm text-muted">O que fazer</span>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => setModo("delta")}
            className={`flex-1 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold transition-colors ${
              modo === "delta"
                ? "border-gold bg-gold/[0.08] text-gold"
                : "border-line text-muted hover:border-line-strong"
            }`}
          >
            Somar/subtrair
          </button>
          <button
            type="button"
            onClick={() => setModo("definir")}
            className={`flex-1 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold transition-colors ${
              modo === "definir"
                ? "border-gold bg-gold/[0.08] text-gold"
                : "border-line text-muted hover:border-line-strong"
            }`}
          >
            Definir saldo final
          </button>
        </div>
        <input type="hidden" name="modo" value={modo} />
      </div>

      <div>
        <label htmlFor="valor" className="block text-sm text-muted">
          {modo === "delta" ? "Quanto (negativo tira)" : "Saldo final"}
        </label>
        <input
          id="valor"
          name="valor"
          type="number"
          step={1}
          min={modo === "definir" ? 0 : undefined}
          required
          placeholder={modo === "delta" ? "10" : "26"}
          className={`${campo} tabular mt-1.5`}
        />
      </div>

      <div>
        <label htmlFor="motivo" className="block text-sm text-muted">
          Motivo — aparece no extrato da pessoa
        </label>
        <input
          id="motivo"
          name="motivo"
          required
          minLength={5}
          placeholder={
            modo === "delta"
              ? "Prêmio do evento das Guitarras Elementais"
              : "Saldo que a pessoa já tinha antes do site"
          }
          className={`${campo} mt-1.5`}
        />
      </div>

      <button type="submit" disabled={pendente} className={botao}>
        {pendente ? "Lançando…" : "Lançar ajuste"}
      </button>
      <Aviso ok={estado.ok} mensagem={estado.mensagem} />
    </form>
  );
}
