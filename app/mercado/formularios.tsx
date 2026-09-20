"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  acaoComprar,
  acaoComprarKit,
  acaoAnunciar,
  acaoCancelar,
  type Estado,
} from "./actions";
import { nomeDoItem, semTraducao } from "@/lib/itens";
import { taxaDaVenda, PRECO_MINIMO, PRECO_MAXIMO } from "@/lib/mercado-regras";
import type { ItemNoCofre } from "@/lib/cofre";
import { ItemIcon } from "@/components/item-icon";

const INICIAL: Estado = { ok: false, mensagem: "" };

/* ------------------------------------------------------------------- peças */

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

/* ---------------------------------------------------------------- comprar */

function BotaoComprar({ preco }: { preco: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[var(--radius-control)] bg-gold px-4 py-2 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Comprando…" : `Comprar por ${preco}`}
    </button>
  );
}

/**
 * A compra fica num formulário por anúncio, com estado próprio.
 *
 * Assim a mensagem de erro — "alguém comprou primeiro", "faltam Paletas" —
 * aparece no card em que a pessoa clicou, e não num aviso solto no topo da
 * página que ela não vai relacionar com nada.
 */
export function Comprar({ id, preco }: { id: number; preco: number }) {
  const [estado, acao] = useActionState(acaoComprar, INICIAL);

  return (
    <form action={acao} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <BotaoComprar preco={preco} />
      <Aviso estado={estado} />
    </form>
  );
}

/**
 * Compra de kit — mesmo desenho do botão de anúncio, ação diferente: aqui a
 * entrega é RCON na hora, e a mensagem de volta já diz se chegou ou por que
 * não chegou (`lib/kits.ts`).
 */
export function ComprarKit({ id, preco }: { id: number; preco: number }) {
  const [estado, acao] = useActionState(acaoComprarKit, INICIAL);

  return (
    <form action={acao}>
      <input type="hidden" name="id" value={id} />
      <BotaoComprar preco={preco} />
      <Aviso estado={estado} />
    </form>
  );
}

/* ----------------------------------------------------------------- vender */

/**
 * O anúncio em uma tela só.
 *
 * A §7.10 desenha um wizard de três passos, mas com item o passo do meio não
 * existe: escolher o lote e dizer o preço é a mesma decisão. Wizard aqui
 * seria cerimônia — o Pal, que tem ficha grande, é que vai pedir isso.
 */
export function Anunciar({ itens }: { itens: ItemNoCofre[] }) {
  const [estado, acao] = useActionState(acaoAnunciar, INICIAL);

  return (
    <form action={acao}>
      <fieldset>
        <legend className="text-sm text-muted">O que sai do cofre</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {itens.map((i, indice) => (
            <label
              key={`${i.itemId}|${i.serverSlug}`}
              className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-line-strong has-checked:border-gold has-checked:bg-gold/[0.06]"
            >
              <input
                type="radio"
                name="pilha"
                value={`${i.itemId}|${i.serverSlug}`}
                defaultChecked={indice === 0}
                required
                className="size-4 shrink-0 accent-[var(--gold)]"
              />
              <ItemIcon itemId={i.itemId} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  <NomeDoItem itemId={i.itemId} />
                </span>
                <span className="tabular block text-sm text-muted">
                  {i.qty} no cofre
                  {i.serverSlug && (
                    <>
                      {" "}
                      · <span className="text-gold">só {i.serverNome}</span>
                    </>
                  )}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="qty" className="block text-sm text-muted">
            Quantidade
          </label>
          <input
            id="qty"
            name="qty"
            type="number"
            min={1}
            defaultValue={1}
            required
            className="tabular mt-1.5 w-28 rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 py-2 text-right"
          />
        </div>

        <div>
          <label htmlFor="preco" className="block text-sm text-muted">
            Preço do lote inteiro
          </label>
          <input
            id="preco"
            name="preco"
            type="number"
            min={PRECO_MINIMO}
            max={PRECO_MAXIMO}
            defaultValue={10}
            required
            className="tabular mt-1.5 w-28 rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 py-2 text-right"
          />
        </div>

        <button
          type="submit"
          className="rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
        >
          Publicar anúncio
        </button>
      </div>

      <TabelaDaTaxa />
      <Aviso estado={estado} />
    </form>
  );
}

/** A taxa explicada com os números, não com a fórmula. */
function TabelaDaTaxa() {
  const exemplos = [10, 30, 80, 200];
  return (
    <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h3 className="text-sm font-semibold">Quanto você recebe</h3>
      <p className="mt-1 text-sm text-muted">
        A taxa é queimada — ela some da economia, não vai para ninguém. É o que
        segura a inflação da Paleta.
      </p>
      <ul className="tabular mt-3 grid gap-1 text-sm sm:grid-cols-2">
        {exemplos.map((p) => (
          <li key={p} className="text-muted">
            anúncio de <b className="text-text">{p}</b> → taxa{" "}
            {taxaDaVenda(p)}, você fica com{" "}
            <b className="text-text">{p - taxaDaVenda(p)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- cancelar */

export function Cancelar({ id }: { id: number }) {
  const [estado, acao] = useActionState(acaoCancelar, INICIAL);

  return (
    <form action={acao}>
      <input type="hidden" name="id" value={id} />
      <BotaoCancelar />
      <Aviso estado={estado} />
    </form>
  );
}

function BotaoCancelar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm font-semibold transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "…" : "Cancelar"}
    </button>
  );
}
