"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { acaoDoar, acaoStatusDaDoacao, type Estado } from "./actions";
import type { StatusDaDoacao } from "@/lib/vip";

const INICIAL: Estado = { ok: false, mensagem: "" };

function BotaoDoar({ liberado, rotulo }: { liberado: boolean; rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!liberado || pending}
      className="w-full rounded-[var(--radius-control)] bg-gold px-5 py-2.5 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Abrindo o pagamento…" : rotulo}
    </button>
  );
}

/**
 * Doar para um plano. O botão só libera depois de marcar que é doação — o
 * servidor confere de novo (`iniciarDoacao`).
 */
export function Doar({ plano, valor }: { plano: string; valor: string }) {
  const [estado, acao] = useActionState(acaoDoar, INICIAL);
  const [aceite, setAceite] = useState(false);

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="plano" value={plano} />
      <input type="hidden" name="aceite" value={aceite ? "1" : ""} />
      <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={aceite}
          onChange={(e) => setAceite(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Entendo que é uma <b className="text-text">doação voluntária</b>, não
          uma compra, e que ela não é reembolsável.
        </span>
      </label>
      <BotaoDoar liberado={aceite} rotulo={`Doar ${valor} via Pix`} />
      {estado.mensagem && (
        <p
          role="status"
          className="rounded-[var(--radius-control)] border border-danger/30 bg-danger/[0.08] px-3 py-2 text-sm text-danger"
        >
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}

/**
 * Na página de volta: enquanto a InfinitePay ainda não confirmou, pergunta
 * a cada 5 segundos (por até 3 minutos) e mostra quando o cargo chegar.
 */
export function AcompanharDoacao({ id, inicial }: { id: number; inicial: StatusDaDoacao }) {
  const [s, setS] = useState(inicial);

  useEffect(() => {
    if (s.status !== "aguardando") return;
    let vezes = 0;
    const t = setInterval(async () => {
      vezes++;
      const novo = await acaoStatusDaDoacao(id);
      if (novo) setS(novo);
      if ((novo && novo.status !== "aguardando") || vezes >= 36) clearInterval(t);
    }, 5000);
    return () => clearInterval(t);
  }, [id, s.status]);

  const ate = s.vipAte ? new Date(s.vipAte).toLocaleDateString("pt-BR") : null;

  if (s.status === "entregue") {
    return (
      <div className="rounded-[var(--radius-card)] border border-success/30 bg-success/[0.08] p-6">
        <h2 className="text-lg font-semibold text-success">Obrigado pela doação! 💛</h2>
        <p className="mt-2 text-sm text-muted">
          O cargo <b className="text-text">VIP {s.planoNome}</b> já está no seu
          Discord{ate ? <> até <b className="text-text">{ate}</b></> : null}
          {s.paletas > 0 ? <>, e <b className="text-text">{s.paletas} Paletas</b> entraram na sua carteira</> : null}.
          O site reconhece o cargo em até 5 minutos.
        </p>
      </div>
    );
  }
  if (s.status === "pago") {
    return (
      <div className="rounded-[var(--radius-card)] border border-gold/40 bg-gold/[0.06] p-6">
        <h2 className="text-lg font-semibold">Doação confirmada — obrigado! 💛</h2>
        <p className="mt-2 text-sm text-muted">
          Recebemos, mas parte da entrega não saiu sozinha
          {!s.cargoOk ? " (o cargo no Discord)" : ""}
          {!s.paletasOk ? " (as Paletas)" : ""}. A administração já foi avisada
          e resolve — não precisa doar de novo.
        </p>
      </div>
    );
  }
  if (s.status === "falhou") {
    return (
      <div className="rounded-[var(--radius-card)] border border-danger/30 bg-danger/[0.08] p-6 text-sm">
        O pagamento não foi aberto. Volte para a página VIP e tente de novo.
      </div>
    );
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">Esperando a confirmação…</h2>
      <p className="mt-2 text-sm text-muted">
        Assim que a InfinitePay confirmar o Pix, o cargo e as Paletas saem
        sozinhos. Pode deixar esta página aberta ou fechar — a entrega não
        depende dela. Se passar de alguns minutos, fale com a administração
        no Discord com o comprovante.
      </p>
    </div>
  );
}
