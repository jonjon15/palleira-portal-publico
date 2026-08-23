"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  acaoGuardar,
  acaoResgatar,
  acaoComprarSlot,
  type Estado,
} from "./actions";
import { nomeDoItem, semTraducao } from "@/lib/itens";
import type { ItemNoCofre, ItemNoJogo, PersonagemOnline } from "@/lib/cofre";

const INICIAL: Estado = { ok: false, mensagem: "" };

/* ------------------------------------------------------------------- peças */

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

/**
 * O nome do item na tela.
 *
 * Quando não há tradução, mostra a chave interna com um sinal discreto — é
 * o que o jogador vê nos comandos do jogo, e é honesto: melhor a chave certa
 * que um nome bonito e errado.
 */
export function NomeDoItem({ itemId }: { itemId: string }) {
  const cru = semTraducao(itemId);
  return (
    <span
      className={cru ? "font-mono text-[0.95em]" : ""}
      title={cru ? "Nome interno do jogo — tradução ainda não cadastrada" : itemId}
    >
      {nomeDoItem(itemId)}
    </span>
  );
}

/** Um `<select>` só aparece quando a escolha existe de verdade. */
function CampoServidor({ onde }: { onde: PersonagemOnline[] }) {
  if (onde.length === 1) {
    return <input type="hidden" name="servidor" value={onde[0].serverSlug} />;
  }
  return (
    <select
      name="servidor"
      aria-label="Servidor"
      className="rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1.5 text-sm"
    >
      {onde.map((o) => (
        <option key={o.serverSlug} value={o.serverSlug}>
          {o.serverName}
        </option>
      ))}
    </select>
  );
}

/* --------------------------------------------------------------- guardar */

/**
 * A mochila mostrada e o servidor de destino são sempre o mesmo — por isso
 * aqui entra um `servidor`, e não a lista. Um seletor solto abriria a porta
 * para a pessoa ver a mochila do Free e mandar guardar "do VIP", que falharia
 * na conferência de posse sem ela entender por quê.
 */
export function GuardarNoCofre({
  itens,
  servidor,
}: {
  itens: ItemNoJogo[];
  servidor: string;
}) {
  const [estado, acao] = useActionState(acaoGuardar, INICIAL);

  return (
    <>
      <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {itens.map((i) => (
          <li key={i.itemId} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                <NomeDoItem itemId={i.itemId} />
              </p>
              <p className="tabular text-sm text-muted">
                {i.negociavel ? `${i.qty} na mochila` : i.motivo}
              </p>
            </div>

            {i.negociavel && (
              <form action={acao} className="flex items-center gap-2">
                <input type="hidden" name="itemId" value={i.itemId} />
                <input type="hidden" name="servidor" value={servidor} />
                <label className="sr-only" htmlFor={`qty-${i.itemId}`}>
                  Quantidade de {nomeDoItem(i.itemId)}
                </label>
                <input
                  id={`qty-${i.itemId}`}
                  name="qty"
                  type="number"
                  min={1}
                  max={i.qty}
                  defaultValue={i.qty}
                  required
                  className="tabular w-20 rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1.5 text-right text-sm"
                />
                <Enviar>Guardar</Enviar>
              </form>
            )}
          </li>
        ))}
      </ul>
      <Aviso estado={estado} />
    </>
  );
}

/* -------------------------------------------------------------- resgatar */

export function ItensDoCofre({
  itens,
  onde,
}: {
  itens: ItemNoCofre[];
  onde: PersonagemOnline[];
}) {
  const [estado, acao] = useActionState(acaoResgatar, INICIAL);

  return (
    <>
      <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {itens.map((i) => (
          <li key={i.itemId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                <NomeDoItem itemId={i.itemId} />
              </p>
              <p className="tabular text-sm text-muted">{i.qty} guardados</p>
            </div>

            {onde.length > 0 ? (
              <form action={acao} className="flex items-center gap-2">
                <input type="hidden" name="itemId" value={i.itemId} />
                <CampoServidor onde={onde} />
                <label className="sr-only" htmlFor={`res-${i.itemId}`}>
                  Quantidade a resgatar de {nomeDoItem(i.itemId)}
                </label>
                <input
                  id={`res-${i.itemId}`}
                  name="qty"
                  type="number"
                  min={1}
                  max={i.qty}
                  defaultValue={i.qty}
                  required
                  className="tabular w-20 rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1.5 text-right text-sm"
                />
                <Enviar>Resgatar</Enviar>
              </form>
            ) : (
              <span className="text-xs text-muted">
                entre no jogo para resgatar
              </span>
            )}
          </li>
        ))}
      </ul>
      <Aviso estado={estado} />
    </>
  );
}

/* ----------------------------------------------------------------- slots */

export function BotaoSlot({ preco }: { preco: number }) {
  const [estado, acao, pendente] = useActionState(
    async () => acaoComprarSlot(),
    INICIAL,
  );

  return (
    <form action={acao}>
      <button
        type="submit"
        disabled={pendente}
        className="rounded-[var(--radius-control)] bg-gold px-4 py-2 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendente ? "Comprando…" : `Comprar slot por ${preco} Paletas`}
      </button>
      <Aviso estado={estado} />
    </form>
  );
}
