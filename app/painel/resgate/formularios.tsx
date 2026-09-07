"use client";

import { useActionState } from "react";
import { acaoPedirRestauracao, acaoCancelarPedido, type Estado } from "./actions";

const SEM_ESTADO: Estado = { ok: false, mensagem: "" };

const botao =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50";

const botaoFantasma =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] border border-line-strong px-5 py-2.5 font-semibold transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

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

export function PedirRestauracao({
  serverSlug,
  serverName,
  snapshotId,
  online,
  preco,
}: {
  serverSlug: string;
  serverName: string;
  snapshotId: number;
  online: boolean;
  preco: number;
}) {
  const [estado, acao, enviando] = useActionState(acaoPedirRestauracao, SEM_ESTADO);

  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (preco > 0) {
          const ok = window.confirm(
            `Isto vai cobrar ${preco} Paletas e devolver sua base em ${serverName}, no lugar onde você está agora.\n\nConfirmar?`,
          );
          if (!ok) e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="servidor" value={serverSlug} />
      <input type="hidden" name="snapshotId" value={snapshotId} />
      <button type="submit" disabled={enviando || !online} className={botao}>
        {enviando
          ? "Pedindo…"
          : preco === 0
            ? "Resgatar de graça, aqui"
            : `Resgatar por ${preco} Paletas, aqui`}
      </button>
      {!online && (
        <p className="mt-2 text-xs text-muted">
          Você precisa estar dentro do jogo, no {serverName}, no lugar onde
          quer a base — sem isso não dá para ler sua posição.
        </p>
      )}
      <Aviso {...estado} />
    </form>
  );
}

export function CancelarPedido() {
  const [estado, acao, enviando] = useActionState(
    async () => acaoCancelarPedido(),
    SEM_ESTADO,
  );

  return (
    <form action={acao}>
      <button type="submit" disabled={enviando} className={botaoFantasma}>
        {enviando ? "Cancelando…" : "Cancelar pedido"}
      </button>
      <Aviso {...estado} />
    </form>
  );
}
