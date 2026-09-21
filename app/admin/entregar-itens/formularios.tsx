"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  acaoEntregarItens,
  acaoCriarKitPremio,
  acaoEditarKitPremio,
  acaoAlternarKitPremio,
  acaoExcluirKitPremio,
  acaoEntregarKitPremio,
  type Estado,
  type EstadoEntregaItens,
  type EstadoEntregaKit,
} from "./actions";
import type { JogadorOnlineParaItens } from "@/lib/admin-entregar-itens";
import type { ItemDoCatalogo } from "@/lib/itens";
import { nomeDoItem } from "@/lib/itens";
import type { KitPremio } from "@/lib/kits-premio";
import { ItemIcon } from "@/components/item-icon";
import { GradeDeItens, LinhaDoLote } from "@/components/seletor-de-itens";

const SEM_ESTADO: Estado = { ok: false, mensagem: "" };
const SEM_ENTREGA_ITENS: EstadoEntregaItens = { ok: false, mensagem: "" };
const SEM_ENTREGA_KIT: EstadoEntregaKit = { ok: false, mensagem: "" };

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

/* --------------------------------------------------- lista de jogadores online */

/**
 * O checkbox de "quem recebe", compartilhado pela entrega avulsa e pela
 * entrega de kit — mesma lista, mesmo comportamento.
 */
function ListaDeJogadores({
  online,
  selecionados,
  onAlternar,
}: {
  online: JogadorOnlineParaItens[];
  selecionados: Set<string>;
  onAlternar: (discordId: string) => void;
}) {
  if (online.length === 0) {
    return <p className="text-sm text-muted">Ninguém online em nenhum servidor agora.</p>;
  }
  return (
    <>
      <ul className="max-h-64 divide-y divide-[var(--line)] overflow-y-auto rounded-[var(--radius-card)] border border-line">
        {online.map((p) => {
          const marcado = selecionados.has(p.discordId);
          return (
            <li key={p.discordId}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-2 has-checked:bg-gold/[0.06]">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => onAlternar(p.discordId)}
                  className="size-4 shrink-0 accent-[var(--gold)]"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                <span className="shrink-0 text-xs text-muted">{p.serverName}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {selecionados.size > 0 && (
        <p className="mt-2 text-xs text-muted">
          {selecionados.size} jogador{selecionados.size === 1 ? "" : "es"} selecionado
          {selecionados.size === 1 ? "" : "s"}.
        </p>
      )}
    </>
  );
}

/* --------------------------------------------------------- entrega avulsa */

interface LinhaDeItem {
  chave: number;
  itemId: string;
  quantidade: string;
}

/**
 * A versão mascarada do `/giveitems <UserId> <ItemId>[:<Amount>] ...` do
 * jogo: escolhe um ou mais jogadores online por checkbox, monta o lote
 * clicando nos ícones de uma grade por categoria, e entrega tudo de uma vez.
 *
 * Migrado de `app/admin/moderacao` em 21/09/2026 — mesmo componente, só de
 * casa nova, ao lado dos kits de prêmio.
 */
export function EntregarItens({
  online,
  catalogo,
}: {
  online: JogadorOnlineParaItens[];
  catalogo: ItemDoCatalogo[];
}) {
  const [estado, acao, pendente] = useActionState(acaoEntregarItens, SEM_ENTREGA_ITENS);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [itens, setItens] = useState<LinhaDeItem[]>([]);
  const [painelAberto, setPainelAberto] = useState(false);
  const proximaChave = useRef(1);

  const porId = useMemo(() => {
    const m = new Map<string, ItemDoCatalogo>();
    for (const c of catalogo) m.set(c.id, c);
    return m;
  }, [catalogo]);

  function alternar(discordId: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(discordId)) novo.delete(discordId);
      else novo.add(discordId);
      return novo;
    });
  }

  function removerLinha(chave: number) {
    setItens((atual) => atual.filter((l) => l.chave !== chave));
  }

  function atualizarQuantidade(chave: number, valor: string) {
    setItens((atual) =>
      atual.map((l) => (l.chave === chave ? { ...l, quantidade: valor } : l)),
    );
  }

  function escolherDaGrade(item: ItemDoCatalogo) {
    setItens((atual) => {
      if (atual.some((l) => l.itemId === item.id)) return atual;
      return [...atual, { chave: proximaChave.current++, itemId: item.id, quantidade: "1" }];
    });
  }

  const idsEscolhidos = useMemo(() => new Set(itens.map((l) => l.itemId)), [itens]);

  const alvos = online
    .filter((p) => selecionados.has(p.discordId))
    .map((p) => ({ discordId: p.discordId, nome: p.nome, uid: p.uid, serverSlug: p.serverSlug }));

  const itensValidos = itens
    .filter((l) => l.itemId.trim())
    .map((l) => ({ itemId: l.itemId.trim(), quantidade: Math.max(1, Math.floor(Number(l.quantidade) || 1)) }));

  const prontoParaEnviar = alvos.length > 0 && itensValidos.length > 0;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- jogadores */}
      <div>
        <p className="mb-2 text-sm text-muted">
          Quem recebe — só quem está no jogo agora aparece aqui, porque{" "}
          <code>giveitems</code> só funciona com o jogador online
        </p>
        <ListaDeJogadores online={online} selecionados={selecionados} onAlternar={alternar} />
      </div>

      {/* ----------------------------------------------------------- itens */}
      <div>
        <p className="mb-2 text-sm text-muted">O que entregar</p>

        {itens.length === 0 ? (
          <p className="text-sm text-muted">
            Nenhum item escolhido ainda — abra a grade abaixo e clique nos
            ícones.
          </p>
        ) : (
          <div className="space-y-2">
            {itens.map((linha) => (
              <LinhaDoLote
                key={linha.chave}
                item={porId.get(linha.itemId)}
                itemId={linha.itemId}
                quantidade={linha.quantidade}
                onQuantidade={(v) => atualizarQuantidade(linha.chave, v)}
                onRemover={() => removerLinha(linha.chave)}
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
              className={`${botaoFantasma} text-sm`}
            >
              {itens.length === 0 ? "Escolher itens" : "Escolher mais itens"}
            </button>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- envio */}
      <form action={acao} className="space-y-3 border-t border-line pt-4">
        <input type="hidden" name="alvos" value={JSON.stringify(alvos)} />
        <input type="hidden" name="itens" value={JSON.stringify(itensValidos)} />
        <button type="submit" disabled={pendente || !prontoParaEnviar} className={botao}>
          {pendente ? "Entregando…" : "Entregar itens"}
        </button>
        {!prontoParaEnviar && (
          <p className="text-xs text-muted">
            Escolha ao menos um jogador e preencha ao menos um item para liberar o botão.
          </p>
        )}
        <Aviso {...estado} />
      </form>

      {estado.resultados && estado.resultados.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">Resultado, item a item:</p>
          {estado.resultados.map((r, i) => (
            <p
              key={i}
              className={`rounded-[var(--radius-control)] border px-4 py-2 text-sm ${
                r.ok
                  ? "border-success/30 bg-success/[0.08] text-success"
                  : "border-danger/30 bg-danger/[0.08] text-danger"
              }`}
            >
              {nomeDoItem(r.itemId)} ×{r.quantidade} → {r.nome}: {r.resposta || (r.ok ? "entregue" : "falhou")}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ kits de prêmio */

interface LinhaDeItemKit {
  chave: number;
  itemId: string;
  quantidade: string;
}

/**
 * Monta um kit de prêmio novo ou edita um existente — mesma grade de ícones
 * da entrega avulsa, só sem preço (kit de prêmio nunca é vendido).
 */
export function FormularioDeKitPremio({
  catalogo,
  kit,
  onPronto,
}: {
  catalogo: ItemDoCatalogo[];
  kit?: KitPremio;
  onPronto?: () => void;
}) {
  const [estado, acao, pendente] = useActionState(
    kit ? acaoEditarKitPremio : acaoCriarKitPremio,
    SEM_ESTADO,
  );
  const [itens, setItens] = useState<LinhaDeItemKit[]>(
    kit
      ? kit.itens.map((i, n) => ({ chave: n, itemId: i.itemId, quantidade: String(i.quantidade) }))
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
      if (atual.some((l) => l.itemId === item.id)) return atual;
      return [...atual, { chave: proximaChave.current++, itemId: item.id, quantidade: "1" }];
    });
  }

  const itensValidos = itens
    .filter((l) => l.itemId.trim())
    .map((l) => ({ itemId: l.itemId.trim(), quantidade: Math.max(1, Math.floor(Number(l.quantidade) || 1)) }));

  useEffect(() => {
    if (estado.ok && kit && onPronto) onPronto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.ok, kit]);

  return (
    <form action={acao} className="space-y-4">
      {kit && <input type="hidden" name="id" value={kit.id} />}
      <input type="hidden" name="itens" value={JSON.stringify(itensValidos)} />

      <div>
        <label htmlFor={`kp-nome-${kit?.id ?? "novo"}`} className="block text-sm text-muted">
          Nome do kit
        </label>
        <input
          id={`kp-nome-${kit?.id ?? "novo"}`}
          name="nome"
          required
          maxLength={60}
          defaultValue={kit?.nome}
          placeholder="Prêmio do evento das Guitarras Elementais"
          className={`${campo} mt-1.5`}
        />
      </div>

      <div>
        <label htmlFor={`kp-desc-${kit?.id ?? "novo"}`} className="block text-sm text-muted">
          Descrição — só para você reconhecer na lista
        </label>
        <input
          id={`kp-desc-${kit?.id ?? "novo"}`}
          name="descricao"
          maxLength={200}
          defaultValue={kit?.descricao}
          placeholder="1º lugar do evento de setembro"
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
                  setItens((a) => a.map((l) => (l.chave === linha.chave ? { ...l, quantidade: v } : l)))
                }
                onRemover={() => setItens((a) => a.filter((l) => l.chave !== linha.chave))}
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
            <button type="button" onClick={() => setPainelAberto(true)} className={botaoFantasma}>
              {itens.length === 0 ? "Escolher itens" : "Escolher mais itens"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pendente || itensValidos.length === 0} className={botao}>
          {pendente ? "Salvando…" : kit ? "Salvar alterações" : "Criar kit de prêmio"}
        </button>
        {kit && onPronto && (
          <button type="button" onClick={onPronto} className={botaoFantasma}>
            Cancelar
          </button>
        )}
      </div>
      {itensValidos.length === 0 && (
        <p className="text-xs text-muted">Escolha ao menos um item para liberar o botão.</p>
      )}
      <Aviso {...estado} />
    </form>
  );
}

/**
 * Um kit de prêmio salvo — editar, arquivar/reativar, apagar, e o formulário
 * de entrega (escolhe quem recebe, entre quem está online).
 */
export function LinhaDeKitPremio({
  kit,
  catalogo,
  online,
}: {
  kit: KitPremio;
  catalogo: ItemDoCatalogo[];
  online: JogadorOnlineParaItens[];
}) {
  const [estado, acao, pendente] = useActionState(acaoAlternarKitPremio, SEM_ESTADO);
  const [apagar, acaoApagar, apagando] = useActionState(acaoExcluirKitPremio, SEM_ESTADO);
  const [entrega, acaoEntrega, entregando] = useActionState(acaoEntregarKitPremio, SEM_ENTREGA_KIT);
  const [editando, setEditando] = useState(false);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  function alternarSelecionado(discordId: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(discordId)) novo.delete(discordId);
      else novo.add(discordId);
      return novo;
    });
  }

  const alvos = online
    .filter((p) => selecionados.has(p.discordId))
    .map((p) => ({ discordId: p.discordId, nome: p.nome, uid: p.uid, serverSlug: p.serverSlug }));

  useEffect(() => {
    if (entrega.ok) {
      setFormularioAberto(false);
      setSelecionados(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrega.ok]);

  if (editando) {
    return (
      <li className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <FormularioDeKitPremio catalogo={catalogo} kit={kit} onPronto={() => setEditando(false)} />
      </li>
    );
  }

  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {kit.nome}
            {!kit.ativo && (
              <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                Arquivado
              </span>
            )}
          </h3>
          {kit.descricao && <p className="mt-1 text-sm text-muted">{kit.descricao}</p>}
        </div>
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
        {kit.ativo && (
          <button
            type="button"
            onClick={() => setFormularioAberto((v) => !v)}
            className={botao}
          >
            {formularioAberto ? "Fechar entrega" : "Entregar este kit"}
          </button>
        )}
        <button type="button" onClick={() => setEditando(true)} className={botaoFantasma}>
          Editar
        </button>
        <form action={acao}>
          <input type="hidden" name="id" value={kit.id} />
          <input type="hidden" name="ativo" value={kit.ativo ? "0" : "1"} />
          <button type="submit" disabled={pendente} className={botaoFantasma}>
            {pendente ? "Salvando…" : kit.ativo ? "Arquivar" : "Reativar"}
          </button>
        </form>

        {confirmando ? (
          <form action={acaoApagar} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={kit.id} />
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

      {formularioAberto && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-sm text-muted">Quem recebe este kit</p>
          <ListaDeJogadores online={online} selecionados={selecionados} onAlternar={alternarSelecionado} />
          <form action={acaoEntrega}>
            <input type="hidden" name="kitId" value={kit.id} />
            <input type="hidden" name="alvos" value={JSON.stringify(alvos)} />
            <button type="submit" disabled={entregando || alvos.length === 0} className={botao}>
              {entregando ? "Entregando…" : `Entregar para ${alvos.length || 0} jogador(es)`}
            </button>
          </form>
          {entrega.resultados && entrega.resultados.length > 0 && (
            <div className="space-y-1.5">
              {entrega.resultados.map((r, i) => (
                <p
                  key={i}
                  className={`rounded-[var(--radius-control)] border px-4 py-2 text-sm ${
                    r.ok
                      ? "border-success/30 bg-success/[0.08] text-success"
                      : "border-danger/30 bg-danger/[0.08] text-danger"
                  }`}
                >
                  {nomeDoItem(r.itemId)} ×{r.quantidade} → {r.nome}: {r.resposta || (r.ok ? "entregue" : "falhou")}
                </p>
              ))}
            </div>
          )}
          <Aviso {...entrega} />
        </div>
      )}

      <Aviso {...estado} />
      <Aviso {...apagar} />
    </li>
  );
}
