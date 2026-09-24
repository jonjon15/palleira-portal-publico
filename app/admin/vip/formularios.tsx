"use client";

import { useActionState } from "react";
import { acaoSalvarTag, acaoSalvarPlano, acaoReentregar, type Estado } from "./actions";
import type { PlanoVip } from "@/lib/vip";

const SEM_ESTADO: Estado = { ok: false, mensagem: "" };

const botao =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50";
const botaoFantasma =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";
const campo =
  "w-full rounded-[var(--radius-control)] border border-line bg-bg px-4 py-2.5 outline-none focus:border-gold";

function Aviso({ ok, mensagem }: Estado) {
  if (!mensagem) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm ${
        ok ? "border-success/30 bg-success/[0.08] text-success" : "border-danger/30 bg-danger/[0.08] text-danger"
      }`}
    >
      {mensagem}
    </p>
  );
}

export function FormularioDaTag({ tag }: { tag: string }) {
  const [estado, acao, pendente] = useActionState(acaoSalvarTag, SEM_ESTADO);
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <div className="min-w-60 flex-1">
        <label htmlFor="tag" className="block text-sm text-muted">
          InfiniteTag (sem o $) — vazio desliga as doações
        </label>
        <input id="tag" name="tag" defaultValue={tag} placeholder="palleira" className={`${campo} mt-1.5`} />
      </div>
      <button type="submit" disabled={pendente} className={botao}>
        {pendente ? "Salvando…" : "Salvar"}
      </button>
      <div className="w-full">
        <Aviso {...estado} />
      </div>
    </form>
  );
}

export function FormularioDePlano({ plano }: { plano: PlanoVip }) {
  const [estado, acao, pendente] = useActionState(acaoSalvarPlano, SEM_ESTADO);
  const k = plano.key;
  return (
    <form action={acao} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <input type="hidden" name="key" value={k} />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
        <div>
          <label htmlFor={`nome-${k}`} className="block text-sm text-muted">Nome</label>
          <input id={`nome-${k}`} name="nome" defaultValue={plano.nome} maxLength={40} required className={`${campo} mt-1.5`} />
        </div>
        <div>
          <label htmlFor={`preco-${k}`} className="block text-sm text-muted">Valor (R$)</label>
          <input
            id={`preco-${k}`}
            name="preco"
            inputMode="decimal"
            defaultValue={(plano.precoCentavos / 100).toFixed(2).replace(".", ",")}
            required
            className={`${campo} tabular mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor={`paletas-${k}`} className="block text-sm text-muted">Paletas</label>
          <input
            id={`paletas-${k}`}
            name="paletas"
            type="number"
            min={0}
            defaultValue={plano.paletasNoMes}
            className={`${campo} tabular mt-1.5`}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`benef-${k}`} className="block text-sm text-muted">Benefícios — um por linha</label>
        <textarea
          id={`benef-${k}`}
          name="beneficios"
          rows={8}
          defaultValue={plano.beneficios.join("\n")}
          className={`${campo} mt-1.5 text-sm`}
        />
      </div>
      <p className="text-xs text-muted">
        Fixo no site (muda só no código): daily de {plano.dailyPaletas} Paletas e{" "}
        {plano.slotsCofre} slots grátis no cofre.
      </p>
      <div className="flex flex-wrap items-center gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="destaque" value="1" defaultChecked={plano.destaque} /> Destaque (“Maior apoio”)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="ativo" value="1" defaultChecked={plano.ativo} /> Aparece na página
        </label>
      </div>
      <button type="submit" disabled={pendente} className={botao}>
        {pendente ? "Salvando…" : `Salvar ${plano.nome}`}
      </button>
      <Aviso {...estado} />
    </form>
  );
}

export function Reentregar({ id }: { id: number }) {
  const [estado, acao, pendente] = useActionState(acaoReentregar, SEM_ESTADO);
  return (
    <form action={acao}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pendente} className={botaoFantasma}>
        {pendente ? "Entregando…" : "Entregar de novo"}
      </button>
      {estado.mensagem && (
        <p className={`mt-1 text-xs ${estado.ok ? "text-success" : "text-danger"}`}>{estado.mensagem}</p>
      )}
    </form>
  );
}
