"use client";

import { useActionState } from "react";
import { adicionarFoto, removerFoto, type Estado } from "./actions";
import type { ImagemEvento } from "@/lib/eventos";

const SEM_ESTADO: Estado = { ok: false, mensagem: "" };

const botao =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50";

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

export function AdicionarFoto({ eventId }: { eventId: number }) {
  const [estado, acao, pendente] = useActionState(adicionarFoto, SEM_ESTADO);

  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="eventId" value={eventId} />
      <div>
        <label htmlFor="url" className="block text-sm text-muted">
          Link da foto
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://..."
          className={`${campo} mt-1.5`}
        />
      </div>
      <div>
        <label htmlFor="caption" className="block text-sm text-muted">
          Legenda (opcional)
        </label>
        <input
          id="caption"
          name="caption"
          placeholder="Campeão: Fulano"
          className={`${campo} mt-1.5`}
        />
      </div>
      <button type="submit" disabled={pendente} className={botao}>
        {pendente ? "Adicionando…" : "Adicionar"}
      </button>
      {estado.mensagem && (
        <div className="sm:col-span-3">
          <Aviso {...estado} />
        </div>
      )}
    </form>
  );
}

export function FotoDoEvento({
  imagem,
  eventId,
}: {
  imagem: ImagemEvento;
  eventId: number;
}) {
  const [estado, acao, pendente] = useActionState(removerFoto, SEM_ESTADO);

  return (
    <li className="group relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element -- link colado de qualquer host (Discord, Imgur...), sem lista fixa de domínio pra otimizar */}
      <img
        src={imagem.url}
        alt={imagem.caption || "Foto do evento"}
        className="aspect-square w-full bg-surface-2 object-contain"
      />
      {imagem.caption && (
        <p className="truncate px-2.5 py-2 text-xs text-muted">{imagem.caption}</p>
      )}
      <form action={acao} className="absolute top-2 right-2">
        <input type="hidden" name="imageId" value={imagem.id} />
        <input type="hidden" name="eventId" value={eventId} />
        <button
          type="submit"
          disabled={pendente}
          className="rounded-full border border-danger/40 bg-bg/85 px-2.5 py-1 text-xs font-semibold text-danger opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
        >
          Remover
        </button>
      </form>
      {!estado.ok && estado.mensagem && (
        <p className="px-2.5 pb-2 text-xs text-danger">{estado.mensagem}</p>
      )}
    </li>
  );
}
