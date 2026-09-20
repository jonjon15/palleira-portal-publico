"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  acaoGuardar,
  acaoResgatar,
  acaoComprarSlot,
  type Estado,
} from "./actions";
import { nomeDoItem, semTraducao, ehSela } from "@/lib/itens";
import type { ItemNoCofre, ItemNoJogo, PersonagemOnline } from "@/lib/cofre";
import { ItemIcon } from "@/components/item-icon";
import { BotaoComprarSlot } from "@/components/botao-comprar-slot";

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

/**
 * Um `<select>` só aparece quando a escolha existe de verdade.
 *
 * `travadoEm`, quando presente, restringe a lista ao único servidor de onde
 * a pilha pode sair (§ trava de mercado do Dominantes) — sem isso a pessoa
 * escolheria um servidor livre onde está online e o resgate falharia sem
 * explicar o motivo.
 */
function CampoServidor({
  onde,
  travadoEm,
}: {
  onde: PersonagemOnline[];
  travadoEm?: string;
}) {
  const opcoes = travadoEm ? onde.filter((o) => o.serverSlug === travadoEm) : onde;
  if (opcoes.length === 1) {
    return <input type="hidden" name="servidor" value={opcoes[0].serverSlug} />;
  }
  return (
    <select
      name="servidor"
      aria-label="Servidor"
      className="rounded-[var(--radius-control)] border border-line-strong bg-bg px-2 py-1.5 text-sm"
    >
      {opcoes.map((o) => (
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
            <ItemIcon itemId={i.itemId} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                <NomeDoItem itemId={i.itemId} />
              </p>
              <p className="tabular text-sm text-muted">
                {i.negociavel
                  ? `${i.qty} ${ehSela(i.itemId) ? "nos itens importantes" : "na mochila"}`
                  : i.motivo}
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
        {itens.map((i) => {
          // Pilha travada (§ Dominantes): só pode resgatar estando online
          // justamente nesse servidor — sem isso o resgate falharia sem
          // explicar o motivo.
          const podeResgatar =
            !i.serverSlug || onde.some((o) => o.serverSlug === i.serverSlug);
          return (
            <li
              key={`${i.itemId}|${i.serverSlug}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <ItemIcon itemId={i.itemId} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <NomeDoItem itemId={i.itemId} />
                </p>
                <p className="tabular text-sm text-muted">
                  {i.qty} guardados
                  {i.serverSlug && (
                    <>
                      {" "}
                      · <span className="text-gold">só {i.serverNome}</span>
                    </>
                  )}
                </p>
              </div>

              {onde.length > 0 && podeResgatar ? (
                <form action={acao} className="flex items-center gap-2">
                  <input type="hidden" name="itemId" value={i.itemId} />
                  <CampoServidor onde={onde} travadoEm={i.serverSlug || undefined} />
                  <label className="sr-only" htmlFor={`res-${i.itemId}-${i.serverSlug}`}>
                    Quantidade a resgatar de {nomeDoItem(i.itemId)}
                  </label>
                  <input
                    id={`res-${i.itemId}-${i.serverSlug}`}
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
                  {i.serverSlug
                    ? `entre no jogo no ${i.serverNome} para resgatar`
                    : "entre no jogo para resgatar"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Aviso estado={estado} />
    </>
  );
}

/* ----------------------------------------------------------------- slots */

export function BotaoSlot({ preco }: { preco: number }) {
  return (
    <BotaoComprarSlot preco={preco} acao={acaoComprarSlot} oQue="slot" />
  );
}
