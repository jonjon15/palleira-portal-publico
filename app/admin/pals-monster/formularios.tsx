"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  acaoCriarPalMonster,
  acaoEditarPalMonster,
  acaoAlternarPalMonster,
  acaoExcluirPalMonster,
  type Estado,
} from "./actions";
import type { PalMonster } from "@/lib/pals-monster";
import { PalCard } from "@/components/pal-card";

const SEM_ESTADO: Estado = { ok: false, mensagem: "" };

const botao =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50";

const botaoFantasma =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

const botaoPerigo =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] border border-danger bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50";

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

type Molde = Record<string, unknown>;

/** A ficha do Pal a partir do molde — a mesma que o comprador vê na vitrine. */
export function FichaDoMolde({ molde }: { molde: Molde }) {
  return (
    <PalCard
      pal={{
        palId: String(molde.PalID ?? ""),
        nickname: molde.Nickname as string | undefined,
        level: Number(molde.Level ?? 1),
        gender: molde.Gender as string | undefined,
        shiny: molde.Shiny as boolean | undefined,
        condensedPals: molde.PartnerSkillLevel as number | undefined,
        ivs: molde.IVs as Record<string, number> | undefined,
        passives: molde.Passives as string[] | undefined,
        activeSkills: molde.ActiveSkills as string[] | undefined,
      }}
      detalhado
    />
  );
}

/**
 * Monta um Pal Monster novo ou edita um existente. O JSON é o mesmo que o
 * "Entregar Pal manual" aceita (ex: o do Pal Creator do Paldeck), e a ficha
 * aparece embaixo enquanto se digita — erro de passiva ou IV se vê antes de
 * ir para a vitrine.
 */
export function FormularioDePalMonster({
  pal,
  onPronto,
}: {
  pal?: PalMonster;
  onPronto?: () => void;
}) {
  const [estado, acao, pendente] = useActionState(
    pal ? acaoEditarPalMonster : acaoCriarPalMonster,
    SEM_ESTADO,
  );
  const [json, setJson] = useState(pal ? JSON.stringify(pal.template, null, 2) : "");
  const chave = pal?.id ?? "novo";

  const molde = useMemo<Molde | null>(() => {
    try {
      const o = JSON.parse(json) as Molde;
      return o && typeof o === "object" && typeof o.PalID === "string" && o.PalID ? o : null;
    } catch {
      return null;
    }
  }, [json]);

  // Mesmo cuidado do formulário de kit: `onPronto` num efeito, nunca no render.
  useEffect(() => {
    if (estado.ok && pal && onPronto) onPronto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.ok, pal]);

  return (
    <form action={acao} className="space-y-4">
      {pal && <input type="hidden" name="id" value={pal.id} />}

      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
        <div>
          <label htmlFor={`nome-${chave}`} className="block text-sm text-muted">
            Nome na vitrine
          </label>
          <input
            id={`nome-${chave}`}
            name="nome"
            required
            maxLength={60}
            defaultValue={pal?.nome}
            placeholder="Pal Monster Selyne"
            className={`${campo} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor={`preco-${chave}`} className="block text-sm text-muted">
            Preço (Paletas)
          </label>
          <input
            id={`preco-${chave}`}
            name="preco"
            type="number"
            min={1}
            required
            defaultValue={pal?.preco ?? 100}
            className={`${campo} tabular mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor={`estoque-${chave}`} className="block text-sm text-muted">
            Estoque
          </label>
          <input
            id={`estoque-${chave}`}
            name="estoque"
            type="number"
            min={0}
            defaultValue={pal?.estoque ?? ""}
            placeholder="ilimitado"
            className={`${campo} tabular mt-1.5`}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`desc-${chave}`} className="block text-sm text-muted">
          Descrição — aparece no card do mercado
        </label>
        <input
          id={`desc-${chave}`}
          name="descricao"
          maxLength={200}
          defaultValue={pal?.descricao}
          placeholder="IV 100, almas no máximo, passivas de dano"
          className={`${campo} mt-1.5`}
        />
      </div>

      <div>
        <label htmlFor={`json-${chave}`} className="block text-sm text-muted">
          JSON do Pal — o mesmo do &ldquo;Entregar Pal manual&rdquo;
        </label>
        <textarea
          id={`json-${chave}`}
          name="json"
          required
          rows={8}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{ "PalID": "BOSS_MoonQueen", "Level": 60, ... }'
          className={`${campo} mt-1.5 font-mono text-xs`}
        />
        {json.trim() && !molde && (
          <p className="mt-1.5 text-xs text-danger">
            JSON inválido ou sem PalID — a ficha aparece quando ele estiver certo.
          </p>
        )}
      </div>

      {molde && (
        <div className="max-w-sm rounded-[var(--radius-card)] border border-line bg-bg p-4">
          <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">
            Como vai aparecer
          </p>
          <FichaDoMolde molde={molde} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pendente || !molde} className={botao}>
          {pendente ? "Salvando…" : pal ? "Salvar alterações" : "Pôr na vitrine"}
        </button>
        {pal && onPronto && (
          <button type="button" onClick={onPronto} className={botaoFantasma}>
            Cancelar
          </button>
        )}
      </div>
      <Aviso {...estado} />
    </form>
  );
}

/** Um Pal Monster na lista da administração. */
export function LinhaDePalMonster({ pal }: { pal: PalMonster }) {
  const [estado, acao, pendente] = useActionState(acaoAlternarPalMonster, SEM_ESTADO);
  const [apagar, acaoApagar, apagando] = useActionState(acaoExcluirPalMonster, SEM_ESTADO);
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const esgotado = pal.estoque !== null && pal.vendidos >= pal.estoque;

  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      {editando ? (
        <FormularioDePalMonster pal={pal} onPronto={() => setEditando(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold">
                {pal.nome}
                {!pal.ativo && (
                  <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                    Fora da vitrine
                  </span>
                )}
                {pal.ativo && esgotado && (
                  <span className="ml-2 rounded-full border border-warning/40 px-2 py-0.5 text-[0.65rem] font-bold tracking-wider text-warning uppercase">
                    Esgotado
                  </span>
                )}
              </h3>
              {pal.descricao && <p className="mt-1 text-sm text-muted">{pal.descricao}</p>}
              <p className="tabular mt-1 text-xs text-muted">
                {pal.vendidos} vendido{pal.vendidos === 1 ? "" : "s"} ·{" "}
                {pal.estoque === null
                  ? "estoque ilimitado"
                  : `${Math.max(0, pal.estoque - pal.vendidos)} de ${pal.estoque} restantes`}
              </p>
            </div>
            <span className="tabular shrink-0 font-semibold text-gold">{pal.preco} Paletas</span>
          </div>

          <div className="mt-3 max-w-sm">
            <FichaDoMolde molde={pal.template as unknown as Molde} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditando(true)} className={botaoFantasma}>
              Editar
            </button>
            <form action={acao}>
              <input type="hidden" name="id" value={pal.id} />
              <input type="hidden" name="ativo" value={pal.ativo ? "0" : "1"} />
              <button type="submit" disabled={pendente} className={botaoFantasma}>
                {pendente ? "Salvando…" : pal.ativo ? "Tirar da vitrine" : "Pôr na vitrine"}
              </button>
            </form>
            {confirmando ? (
              <form action={acaoApagar} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={pal.id} />
                <button type="submit" disabled={apagando} className={botaoPerigo}>
                  {apagando ? "Apagando…" : "Apagar de vez"}
                </button>
                <button type="button" onClick={() => setConfirmando(false)} className={botaoFantasma}>
                  Não
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className={`${botaoFantasma} text-muted hover:border-danger hover:text-danger`}
              >
                Apagar
              </button>
            )}
          </div>
          <Aviso {...estado} />
          <Aviso {...apagar} />
        </>
      )}
    </li>
  );
}
