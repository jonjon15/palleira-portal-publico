"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  acaoCriarKit,
  acaoEditarKit,
  acaoAlternarKit,
  acaoExcluirKit,
  type Estado,
} from "./actions";
import type { ItemDoCatalogo } from "@/lib/itens";
import type { Kit } from "@/lib/kits";
import { GradeDeItens, LinhaDoLote } from "@/components/seletor-de-itens";
import { ItemIcon } from "@/components/item-icon";

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

interface LinhaDeItem {
  chave: number;
  itemId: string;
  quantidade: string;
}

/**
 * Monta um kit novo ou edita um existente — a mesma grade de ícones da
 * entrega manual (`components/seletor-de-itens.tsx`), mais nome, descrição
 * e preço.
 *
 * Com `kit` preenchido vira formulário de edição; sem ele, de criação. São
 * o mesmo formulário de propósito: quem edita espera exatamente a tela em
 * que montou.
 */
export function FormularioDeKit({
  catalogo,
  kit,
  onPronto,
}: {
  catalogo: ItemDoCatalogo[];
  kit?: Kit;
  onPronto?: () => void;
}) {
  const [estado, acao, pendente] = useActionState(
    kit ? acaoEditarKit : acaoCriarKit,
    SEM_ESTADO,
  );
  const [itens, setItens] = useState<LinhaDeItem[]>(
    kit
      ? kit.itens.map((i, n) => ({
          chave: n,
          itemId: i.itemId,
          quantidade: String(i.quantidade),
        }))
      : [],
  );
  const [painelAberto, setPainelAberto] = useState(false);
  const proximaChave = useRef(kit ? kit.itens.length : 0);

  const porId = useMemo(() => {
    const m = new Map<string, ItemDoCatalogo>();
    for (const c of catalogo) m.set(c.id, c);
    return m;
  }, [catalogo]);

  const idsEscolhidos = useMemo(() => new Set(itens.map((l) => l.itemId)), [itens]);

  function escolherDaGrade(item: ItemDoCatalogo) {
    setItens((atual) => {
      // Item repetido vira ajuste de quantidade, não linha nova: duas linhas
      // do mesmo ItemID virariam dois `giveitems` seguidos na entrega.
      if (atual.some((l) => l.itemId === item.id)) return atual;
      return [...atual, { chave: proximaChave.current++, itemId: item.id, quantidade: "1" }];
    });
  }

  const itensValidos = itens
    .filter((l) => l.itemId.trim())
    .map((l) => ({
      itemId: l.itemId.trim(),
      quantidade: Math.max(1, Math.floor(Number(l.quantidade) || 1)),
    }));

  // Sucesso fecha o formulário de edição, mas não o de criação: quem acabou
  // de montar um kit costuma montar o próximo logo em seguida.
  //
  // Em `useEffect` e não solto no corpo do componente: chamar `onPronto`
  // durante o render altera o estado do pai no meio do render do filho, que
  // é o aviso clássico "Cannot update a component while rendering a
  // different component" do React.
  useEffect(() => {
    if (estado.ok && kit && onPronto) onPronto();
    // `onPronto` fora das dependências de propósito: o pai recria a função a
    // cada render, e incluí-la faria o efeito disparar sozinho em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.ok, kit]);

  return (
    <form action={acao} className="space-y-4">
      {kit && <input type="hidden" name="id" value={kit.id} />}
      <input type="hidden" name="itens" value={JSON.stringify(itensValidos)} />

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div>
          <label htmlFor={`nome-${kit?.id ?? "novo"}`} className="block text-sm text-muted">
            Nome do kit
          </label>
          <input
            id={`nome-${kit?.id ?? "novo"}`}
            name="nome"
            required
            maxLength={60}
            defaultValue={kit?.nome}
            placeholder="Kit Iniciante"
            className={`${campo} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor={`preco-${kit?.id ?? "novo"}`} className="block text-sm text-muted">
            Preço em Paletas
          </label>
          <input
            id={`preco-${kit?.id ?? "novo"}`}
            name="preco"
            type="number"
            min={1}
            required
            defaultValue={kit?.preco ?? 10}
            className={`${campo} tabular mt-1.5`}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`desc-${kit?.id ?? "novo"}`} className="block text-sm text-muted">
          Descrição — aparece no card do mercado
        </label>
        <input
          id={`desc-${kit?.id ?? "novo"}`}
          name="descricao"
          maxLength={200}
          defaultValue={kit?.descricao}
          placeholder="Tudo que você precisa para começar bem"
          className={`${campo} mt-1.5`}
        />
      </div>

      <div>
        <p className="mb-2 text-sm text-muted">O que vai dentro</p>
        {itens.length === 0 ? (
          <p className="text-sm text-muted">
            Nenhum item ainda — abra a grade e clique nos ícones.
          </p>
        ) : (
          <div className="space-y-2">
            {itens.map((linha) => (
              <LinhaDoLote
                key={linha.chave}
                item={porId.get(linha.itemId)}
                itemId={linha.itemId}
                quantidade={linha.quantidade}
                onQuantidade={(v) =>
                  setItens((a) =>
                    a.map((l) => (l.chave === linha.chave ? { ...l, quantidade: v } : l)),
                  )
                }
                onRemover={() =>
                  setItens((a) => a.filter((l) => l.chave !== linha.chave))
                }
              />
            ))}
          </div>
        )}

        <div className="mt-3">
          {painelAberto ? (
            <GradeDeItens
              catalogo={catalogo}
              jaEscolhidos={idsEscolhidos}
              onEscolher={escolherDaGrade}
              onFechar={() => setPainelAberto(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPainelAberto(true)}
              className={botaoFantasma}
            >
              {itens.length === 0 ? "Escolher itens" : "Escolher mais itens"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pendente || itensValidos.length === 0}
          className={botao}
        >
          {pendente ? "Salvando…" : kit ? "Salvar alterações" : "Criar kit"}
        </button>
        {kit && onPronto && (
          <button type="button" onClick={onPronto} className={botaoFantasma}>
            Cancelar
          </button>
        )}
      </div>
      {itensValidos.length === 0 && (
        <p className="text-xs text-muted">
          Escolha ao menos um item para liberar o botão.
        </p>
      )}
      <Aviso {...estado} />
    </form>
  );
}

/** Um kit na lista da administração, com editar e tirar/pôr na vitrine. */
export function LinhaDeKit({
  kit,
  catalogo,
}: {
  kit: Kit;
  catalogo: ItemDoCatalogo[];
}) {
  const [estado, acao, pendente] = useActionState(acaoAlternarKit, SEM_ESTADO);
  const [apagar, acaoApagar, apagando] = useActionState(
    acaoExcluirKit,
    SEM_ESTADO,
  );
  const [editando, setEditando] = useState(false);
  // Apagar é o único botão sem volta desta tela, então ele pede confirmação
  // no lugar — um segundo clique no mesmo canto, sem `confirm()` do
  // navegador, que a pessoa aperta no reflexo.
  const [confirmando, setConfirmando] = useState(false);

  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      {editando ? (
        <FormularioDeKit
          catalogo={catalogo}
          kit={kit}
          onPronto={() => setEditando(false)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold">
                {kit.nome}
                {!kit.ativo && (
                  <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                    Fora da vitrine
                  </span>
                )}
              </h3>
              {kit.descricao && (
                <p className="mt-1 text-sm text-muted">{kit.descricao}</p>
              )}
            </div>
            <span className="tabular shrink-0 font-semibold text-gold">
              {kit.preco} Paletas
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {kit.itens.map((i) => (
              <span
                key={i.itemId}
                title={i.itemId}
                className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface-2/60 py-1 pr-2.5 pl-1"
              >
                <ItemIcon itemId={i.itemId} className="size-6" bare />
                <span className="tabular text-xs text-muted">×{i.quantidade}</span>
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className={botaoFantasma}
            >
              Editar
            </button>
            <form action={acao}>
              <input type="hidden" name="id" value={kit.id} />
              <input type="hidden" name="ativo" value={kit.ativo ? "0" : "1"} />
              <button type="submit" disabled={pendente} className={botaoFantasma}>
                {pendente
                  ? "Salvando…"
                  : kit.ativo
                    ? "Tirar da vitrine"
                    : "Pôr na vitrine"}
              </button>
            </form>

            {confirmando ? (
              <form action={acaoApagar} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={kit.id} />
                <button
                  type="submit"
                  disabled={apagando}
                  className={botaoPerigo}
                >
                  {apagando ? "Apagando…" : "Apagar de vez"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className={botaoFantasma}
                >
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
