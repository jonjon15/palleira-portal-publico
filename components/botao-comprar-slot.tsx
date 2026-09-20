"use client";

import { useActionState, useEffect, useRef, useState } from "react";

/**
 * O botão de comprar slot — com confirmação em duas etapas.
 *
 * O cofre de item e o de Pal compram slot do mesmo jeito, mudando só a ação
 * do servidor, então o botão mora aqui em vez de repetido nos dois
 * `formularios.tsx`.
 *
 * Por que a confirmação: o clique único cobrava na hora, e em 20/09/2026 um
 * jogador gastou 100 Paletas sem querer só porque a aba apareceu embaixo do
 * dedo dele. No cofre de Pals o estrago é bem maior — o preço dobra a cada
 * slot, e já houve compra na casa dos milhões. Um passo a mais custa um
 * clique; o engano custa o dobro do slot anterior.
 *
 * A confirmação se desarma sozinha depois de alguns segundos: se a pessoa
 * parou para pensar e desistiu, o botão volta ao estado seguro em vez de
 * ficar armado esperando um clique distraído.
 */

const SEGUNDOS_ARMADO = 5;

interface Estado {
  ok: boolean;
  mensagem: string;
}

const INICIAL: Estado = { ok: false, mensagem: "" };

export function BotaoComprarSlot({
  preco,
  acao,
  oQue,
}: {
  preco: number;
  /** A server action que cobra de fato. */
  acao: () => Promise<Estado>;
  /** "slot" ou "slot de Pal" — entra na frase da confirmação. */
  oQue: string;
}) {
  const [estado, enviar, pendente] = useActionState(
    async () => acao(),
    INICIAL,
  );
  const [armado, setArmado] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Desarma sozinho, e limpa o relógio se o componente sair da tela.
  useEffect(() => {
    if (!armado) return;
    relogio.current = setTimeout(
      () => setArmado(false),
      SEGUNDOS_ARMADO * 1000,
    );
    return () => {
      if (relogio.current) clearTimeout(relogio.current);
    };
  }, [armado]);

  // Comprou (ou deu erro): volta ao estado seguro.
  useEffect(() => {
    if (estado.mensagem) setArmado(false);
  }, [estado]);

  return (
    <div>
      {armado ? (
        <form action={enviar}>
          <button
            type="submit"
            disabled={pendente}
            autoFocus
            className="w-full rounded-[var(--radius-control)] bg-gold px-4 py-2 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendente ? "Comprando…" : `Confirmar — pagar ${preco} Paletas`}
          </button>
          {!pendente && (
            <button
              type="button"
              onClick={() => setArmado(false)}
              className="mt-2 text-xs font-semibold text-muted underline underline-offset-2 transition-colors hover:text-text"
            >
              Cancelar
            </button>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setArmado(true)}
          className="w-full rounded-[var(--radius-control)] bg-gold px-4 py-2 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
        >
          {`Comprar ${oQue} por ${preco} Paletas`}
        </button>
      )}

      {armado && !pendente && (
        <p role="status" className="mt-2 text-xs text-muted">
          Vão sair <b className="tabular text-text">{preco}</b> Paletas do seu
          saldo. Confirme para comprar.
        </p>
      )}

      {estado.mensagem && (
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
      )}
    </div>
  );
}
