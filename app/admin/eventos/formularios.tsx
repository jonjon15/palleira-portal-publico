"use client";

import { useActionState } from "react";
import { publicarNovoEvento, agirSobreEvento, type Estado } from "./actions";
import type { Evento, StatusEvento } from "@/lib/eventos";
import type { PalleiraServer } from "@/lib/servers";

const SEM_ESTADO: Estado = { ok: false, mensagem: "" };

const botao =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50";

const botaoLinha =
  "rounded-[var(--radius-control)] border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const campo =
  "w-full rounded-[var(--radius-control)] border border-line bg-bg px-4 py-2.5 outline-none focus:border-gold";

function Aviso({ ok, mensagem }: Estado) {
  if (!mensagem) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm ${
        ok
          ? "border-success/30 bg-success/[0.08] text-success"
          : "border-danger/30 bg-danger/[0.08] text-danger"
      }`}
    >
      {mensagem}
    </p>
  );
}

/* --------------------------------------------------------------- criação */

export function NovoEvento({ servidores }: { servidores: PalleiraServer[] }) {
  const [estado, acao, pendente] = useActionState(publicarNovoEvento, SEM_ESTADO);

  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="title" className="block text-sm text-muted">
          Título
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          placeholder="Guerra de Guilds: Cerco em Palpagos"
          className={`${campo} mt-1.5`}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="body" className="block text-sm text-muted">
          Texto
        </label>
        <textarea
          id="body"
          name="body"
          rows={5}
          placeholder="O que vai rolar, quem pode participar, o que rende..."
          className={`${campo} mt-1.5 resize-y`}
        />
      </div>

      <div>
        <label htmlFor="coverEmoji" className="block text-sm text-muted">
          Ícone (opcional)
        </label>
        <input
          id="coverEmoji"
          name="coverEmoji"
          maxLength={4}
          placeholder="⚔️"
          className={`${campo} mt-1.5`}
        />
      </div>

      <div>
        <label htmlFor="serverSlug" className="block text-sm text-muted">
          Servidor
        </label>
        <select id="serverSlug" name="serverSlug" className={`${campo} mt-1.5`}>
          <option value="">Todos os servidores</option>
          {servidores.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.shortName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="startsAt" className="block text-sm text-muted">
          Começa em (opcional)
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          className={`${campo} mt-1.5`}
        />
      </div>

      <div>
        <label htmlFor="endsAt" className="block text-sm text-muted">
          Termina em (opcional)
        </label>
        <input
          id="endsAt"
          name="endsAt"
          type="datetime-local"
          className={`${campo} mt-1.5`}
        />
      </div>

      <div className="flex items-center gap-2">
        <input id="pinned" name="pinned" type="checkbox" className="size-4" />
        <label htmlFor="pinned" className="text-sm">
          Fixar no topo do mural e na home
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="publicar"
          name="publicar"
          type="checkbox"
          defaultChecked
          className="size-4"
        />
        <label htmlFor="publicar" className="text-sm">
          Publicar agora (senão fica como rascunho)
        </label>
      </div>

      <div className="sm:col-span-2">
        <button type="submit" disabled={pendente} className={botao}>
          {pendente ? "Salvando…" : "Salvar evento"}
        </button>
        <Aviso {...estado} />
      </div>
    </form>
  );
}

/* ---------------------------------------------------------- linha de ação */

const ACOES_POR_STATUS: Record<
  StatusEvento,
  { acao: string; rotulo: string; estilo: string }[]
> = {
  rascunho: [
    {
      acao: "publicar",
      rotulo: "Publicar",
      estilo: "border-success/40 bg-success/10 text-success hover:bg-success/20",
    },
    {
      acao: "excluir",
      rotulo: "Excluir",
      estilo: "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
    },
  ],
  publicado: [
    {
      acao: "arquivar",
      rotulo: "Arquivar",
      estilo: "border-line-strong text-text hover:bg-surface-2",
    },
  ],
  arquivado: [
    {
      acao: "republicar",
      rotulo: "Republicar",
      estilo: "border-success/40 bg-success/10 text-success hover:bg-success/20",
    },
  ],
};

export function LinhaEvento({ evento }: { evento: Evento }) {
  const [estado, acao, pendente] = useActionState(agirSobreEvento, SEM_ESTADO);
  const acoes = [...ACOES_POR_STATUS[evento.status]];
  if (evento.status === "publicado") {
    acoes.push(
      evento.pinned
        ? {
            acao: "desfixar",
            rotulo: "Desfixar",
            estilo: "border-line-strong text-text hover:bg-surface-2",
          }
        : {
            acao: "fixar",
            rotulo: "Fixar",
            estilo: "border-gold/40 bg-gold/10 text-gold hover:bg-gold/20",
          },
    );
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {evento.pinned && "📌 "}
            {evento.title}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {STATUS_LABEL[evento.status]} · por {evento.createdByName || "Palleira"}
          </span>
        </span>

        <form action={acao} className="flex shrink-0 gap-2">
          <input type="hidden" name="id" value={evento.id} />
          {acoes.map((a) => (
            <button
              key={a.acao}
              type="submit"
              name="acao"
              value={a.acao}
              disabled={pendente}
              className={`${botaoLinha} ${a.estilo}`}
            >
              {a.rotulo}
            </button>
          ))}
        </form>
      </div>
      <Aviso {...estado} />
    </li>
  );
}

const STATUS_LABEL: Record<StatusEvento, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  arquivado: "Arquivado",
};
