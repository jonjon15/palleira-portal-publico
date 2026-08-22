"use client";

import { useActionState } from "react";
import {
  migrarEmLote,
  ajustarSaldo,
  type Relatorio,
  type EstadoAjuste,
  type LinhaResultado,
  type EstadoCanal,
} from "./actions";
import { lerOuImportar } from "./importar";

const SEM_RELATORIO: Relatorio = { ok: false, mensagem: "", linhas: [] };
const SEM_AJUSTE: EstadoAjuste = { ok: false, mensagem: "" };

const SITUACAO: Record<LinhaResultado["situacao"], string> = {
  migrado: "migrado",
  "ja-tinha": "já tinha sido migrado",
  "nao-achei": "não achei essa pessoa no Discord",
  ambiguo: "mais de uma pessoa com esse nome — use o ID",
  "numero-ruim": "não entendi o valor",
};

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

/* ------------------------------------------------------ migração em lote */

export function MigrarEmLote({ podeNome }: { podeNome: boolean }) {
  const [estado, acao, pendente] = useActionState(
    migrarEmLote,
    SEM_RELATORIO,
  );

  return (
    <form action={acao}>
      <label htmlFor="lista" className="block text-sm text-muted">
        Uma pessoa por linha: {podeNome ? "nome ou ID" : "ID do Discord"} e o
        saldo que o Palbot mostrou.
      </label>
      <textarea
        id="lista"
        name="lista"
        rows={8}
        spellCheck={false}
        placeholder={
          podeNome
            ? "jonjon7D 26\nThiago1311 4\n882283198518804500 12"
            : "882283198518804500 26\n1451355546300186626 4"
        }
        className={`${campo} mt-2 font-mono text-sm leading-relaxed`}
      />
      <div className="mt-4">
        <button type="submit" disabled={pendente} className={botao}>
          {pendente ? "Migrando…" : "Migrar saldos"}
        </button>
      </div>

      <Aviso ok={estado.ok} mensagem={estado.mensagem} />

      {estado.linhas.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line">
          {estado.linhas.map((l, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
            >
              <span className="font-medium">{l.quem}</span>
              <span className="tabular text-muted">{l.quanto}</span>
              <span
                className={`ml-auto text-xs ${
                  l.situacao === "migrado"
                    ? "text-success"
                    : l.situacao === "ja-tinha"
                      ? "text-muted"
                      : "text-danger"
                }`}
              >
                {SITUACAO[l.situacao]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/* --------------------------------------------------------------- ajuste */

export function AjustarSaldo() {
  const [estado, acao, pendente] = useActionState(ajustarSaldo, SEM_AJUSTE);

  return (
    <form action={acao} className="space-y-3">
      <div>
        <label htmlFor="alvo" className="block text-sm text-muted">
          ID do Discord
        </label>
        <input
          id="alvo"
          name="alvo"
          required
          inputMode="numeric"
          placeholder="882283198518804500"
          className={`${campo} mt-1.5 font-mono text-sm`}
        />
      </div>
      <div>
        <label htmlFor="delta" className="block text-sm text-muted">
          Quanto (negativo tira)
        </label>
        <input
          id="delta"
          name="delta"
          type="number"
          step={1}
          required
          placeholder="10"
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
          placeholder="Prêmio do evento das Guitarras Elementais"
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

/* ------------------------------------------ importar direto do Discord */

const SEM_CANAL: EstadoCanal = {
  ok: false,
  mensagem: "",
  aplicou: false,
  achados: [],
  semDono: [],
};

export function ImportarDoCanal({
  canais,
}: {
  canais: { id: string; nome: string }[];
}) {
  const [estado, acao, pendente] = useActionState(lerOuImportar, SEM_CANAL);
  const novos = estado.achados.filter((a) => !a.jaMigrado);

  return (
    <form action={acao}>
      <label htmlFor="canal" className="block text-sm text-muted">
        Canal onde o Palbot respondeu
      </label>
      <select
        id="canal"
        name="canal"
        required
        defaultValue=""
        className={`${campo} mt-1.5`}
      >
        <option value="" disabled>
          Escolha o canal…
        </option>
        {canais.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.nome}
          </option>
        ))}
      </select>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="submit"
          name="acao"
          value="ver"
          disabled={pendente}
          className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-line-strong px-5 py-2.5 font-semibold transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          {pendente ? "Lendo…" : "Ver o que tem lá"}
        </button>
        {novos.length > 0 && !estado.aplicou && (
          <button
            type="submit"
            name="acao"
            value="importar"
            disabled={pendente}
            className={botao}
          >
            Importar {novos.length} saldo{novos.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      <Aviso ok={estado.ok} mensagem={estado.mensagem} />

      {estado.achados.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line">
          {estado.achados.map((a) => (
            <li
              key={a.discordId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
            >
              <span className="font-medium">{a.nome}</span>
              <span className="tabular font-bold text-gold">{a.saldo}</span>
              {a.via === "checkpoints" && (
                <span className="text-xs text-muted">via /checkpoints</span>
              )}
              <span
                className={`ml-auto text-xs ${
                  a.importado
                    ? "text-success"
                    : a.jaMigrado
                      ? "text-muted"
                      : "text-gold"
                }`}
              >
                {a.importado
                  ? "importado"
                  : a.jaMigrado
                    ? "já migrado"
                    : "pronto para importar"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {estado.semDono.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-4">
          <p className="text-sm font-semibold">
            {estado.semDono.length} saldo
            {estado.semDono.length > 1 ? "s" : ""} sem dono certo
          </p>
          <p className="mt-1 text-xs text-muted">
            Vieram de <code>/checkpoints</code> e o nome não bateu com uma
            pessoa só. Migre pelo ID na caixa de baixo:
          </p>
          <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted">
            {estado.semDono.map((s, i) => (
              <li key={i}>
                {s.nome} · {s.saldo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
