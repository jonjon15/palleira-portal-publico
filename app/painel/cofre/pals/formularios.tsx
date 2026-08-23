"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  acaoGuardarPal,
  acaoResgatarPal,
  consultarResgate,
  type Estado,
  type EstadoResgate,
} from "./actions";
import { nomeDoPal, ehAlpha } from "@/lib/pals";
import type { PalDisponivel } from "@/lib/pal-cofre";
import type { PersonagemOnline } from "@/lib/cofre";

const INICIAL: Estado = { ok: false, mensagem: "" };
const INICIAL_RESGATE: EstadoResgate = { ok: false, mensagem: "" };

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

/* --------------------------------------------------------------- guardar */

export function GuardarPals({
  pals,
  servidor,
}: {
  pals: PalDisponivel[];
  servidor: string;
}) {
  const [estado, acao] = useActionState(acaoGuardarPal, INICIAL);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  return (
    <form action={acao}>
      <input type="hidden" name="servidor" value={servidor} />
      <input type="hidden" name="instanceId" value={selecionado ?? ""} />

      <ul className="max-h-96 divide-y divide-[var(--line)] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface">
        {pals.map((p) => (
          <li key={p.instanceId}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 has-checked:bg-gold/[0.06]">
              <input
                type="radio"
                name="_escolha"
                checked={selecionado === p.instanceId}
                onChange={() => setSelecionado(p.instanceId)}
                className="size-4 shrink-0 accent-[var(--gold)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {ehAlpha(p.palId) && <span className="text-gold">Alpha </span>}
                  {p.nickname || nomeDoPal(p.palId)}
                  {p.shiny && " ✨"}
                </span>
                <span className="tabular block text-xs text-muted">
                  Nível {p.level} · {p.gender === "Female" ? "Fêmea" : "Macho"}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Enviar>Guardar Pal escolhido</Enviar>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* -------------------------------------------------------------- resgatar */

interface ItemDoCofre {
  id: number;
  palId: string;
}

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

export function ResgatarPal({
  pal,
  onde,
}: {
  pal: ItemDoCofre;
  onde: PersonagemOnline[];
}) {
  const [estado, acao] = useActionState(acaoResgatarPal, INICIAL_RESGATE);

  if (estado.transferId) {
    return <Acompanhar transferId={estado.transferId} palId={pal.palId} />;
  }

  if (!onde.length) {
    return (
      <span className="text-xs text-muted">entre no jogo para resgatar</span>
    );
  }

  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="vaultPalId" value={pal.id} />
      <CampoServidor onde={onde} />
      <Enviar>Resgatar</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}

const ESTADO_LABEL: Record<string, string> = {
  aguardando_arquivo: "Preparando a entrega…",
  arquivo_pronto: "Entregando no jogo…",
  concluido: "Entregue!",
  falhou: "Não deu certo",
  andando: "Aguardando confirmação…",
};

/**
 * Acompanha a entrega, com polling.
 *
 * Duas fases visíveis: o GitHub Actions escreve o arquivo (leva alguns
 * segundos para o workflow sequer começar), depois a Vercel chama o
 * `givepal_j`. Sem isso na tela, a pessoa acha que travou.
 */
function Acompanhar({ transferId, palId }: { transferId: number; palId: string }) {
  const [status, setStatus] = useState<string>("aguardando_arquivo");
  const [detalhe, setDetalhe] = useState("");
  const parado = useRef(false);

  useEffect(() => {
    parado.current = false;
    let ativo = true;

    const consultar = async () => {
      const r = await consultarResgate(transferId);
      if (!ativo) return;
      if (!r) return;
      setStatus(r.status);
      setDetalhe(r.detail);
      if (r.status === "concluido" || r.status === "falhou") {
        parado.current = true;
      }
    };

    consultar();
    const intervalo = setInterval(() => {
      if (!parado.current) consultar();
    }, 4000);

    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [transferId]);

  const cor =
    status === "concluido"
      ? "text-success"
      : status === "falhou"
        ? "text-danger"
        : "text-muted";

  return (
    <div className="text-right">
      <p className={`text-sm font-medium ${cor}`}>
        {ESTADO_LABEL[status] ?? status}
      </p>
      {status === "falhou" && detalhe && (
        <p className="mt-0.5 max-w-56 text-xs text-danger">{detalhe}</p>
      )}
      {status !== "concluido" && status !== "falhou" && (
        <p className="text-xs text-muted">{nomeDoPal(palId)}</p>
      )}
    </div>
  );
}
