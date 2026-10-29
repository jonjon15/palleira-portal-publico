"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { acaoEntregarItens, type EstadoEntregaItens } from "./actions";
import type { JogadorOnlineParaItens } from "@/lib/admin-entregar-itens";
import type { ItemDoCatalogo } from "@/lib/itens";
import { nomeDoItem } from "@/lib/itens";
import { ItemIcon } from "@/components/item-icon";
import { GradeDeItens, LinhaDoLote } from "@/components/seletor-de-itens";
import { Aviso, ListaDeJogadores, botao, botaoFantasma, botaoPerigo, campo } from "./formularios";

const SEM_ENTREGA_ITENS: EstadoEntregaItens = { ok: false, mensagem: "" };
const CHAVE_KITS_LOCAIS = "palleira:kits-premio-locais";

interface KitLocal {
  id: string;
  nome: string;
  itens: { itemId: string; quantidade: number }[];
}

function lerKitsLocais(): KitLocal[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_KITS_LOCAIS) ?? "[]");
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function gravarKitsLocais(kits: KitLocal[]) {
  try {
    localStorage.setItem(CHAVE_KITS_LOCAIS, JSON.stringify(kits));
  } catch {
    /* navegador sem armazenamento: o kit vale só até recarregar */
  }
}

/**
 * Kits de prêmio quando o banco está fora por cota (29/10/2026): ficam no
 * `localStorage` de quem montou e entregam pelo mesmo `acaoEntregarItens`
 * da entrega avulsa — o RCON não depende do banco. Provisório: os kits de
 * verdade continuam em `kits_premio` e voltam junto com o banco.
 */
export function KitsDoNavegador({
  catalogo,
  online,
}: {
  catalogo: ItemDoCatalogo[];
  online: JogadorOnlineParaItens[];
}) {
  const [kits, setKits] = useState<KitLocal[]>([]);
  const [nome, setNome] = useState("");
  const [itens, setItens] = useState<{ chave: number; itemId: string; quantidade: string }[]>([]);
  const [painelAberto, setPainelAberto] = useState(false);
  const proximaChave = useRef(1);

  useEffect(() => setKits(lerKitsLocais()), []);

  const porId = useMemo(() => {
    const m = new Map<string, ItemDoCatalogo>();
    for (const c of catalogo) m.set(c.id, c);
    return m;
  }, [catalogo]);

  const idsEscolhidos = useMemo(() => new Set(itens.map((l) => l.itemId)), [itens]);

  const itensValidos = itens
    .filter((l) => l.itemId.trim())
    .map((l) => ({ itemId: l.itemId.trim(), quantidade: Math.max(1, Math.floor(Number(l.quantidade) || 1)) }));

  function mudar(novos: KitLocal[]) {
    setKits(novos);
    gravarKitsLocais(novos);
  }

  function salvar() {
    if (!nome.trim() || itensValidos.length === 0) return;
    mudar([...kits, { id: String(Date.now()), nome: nome.trim().slice(0, 60), itens: itensValidos }]);
    setNome("");
    setItens([]);
    setPainelAberto(false);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="kl-nome" className="block text-sm text-muted">
            Nome do kit
          </label>
          <input
            id="kl-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={60}
            placeholder="Prêmio do evento das Guitarras Elementais"
            className={`${campo} mt-1.5`}
          />
        </div>

        <div>
          <p className="mb-2 text-sm text-muted">O que vai dentro</p>
          {itens.length > 0 && (
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
                onEscolher={(item) =>
                  setItens((atual) =>
                    atual.some((l) => l.itemId === item.id)
                      ? atual
                      : [...atual, { chave: proximaChave.current++, itemId: item.id, quantidade: "1" }],
                  )
                }
                onFechar={() => setPainelAberto(false)}
              />
            ) : (
              <button type="button" onClick={() => setPainelAberto(true)} className={botaoFantasma}>
                {itens.length === 0 ? "Escolher itens" : "Escolher mais itens"}
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={salvar}
          disabled={!nome.trim() || itensValidos.length === 0}
          className={botao}
        >
          Salvar kit neste navegador
        </button>
      </div>

      {kits.length > 0 && (
        <ul className="space-y-3">
          {kits.map((k) => (
            <LinhaDeKitLocal
              key={k.id}
              kit={k}
              online={online}
              onApagar={() => mudar(kits.filter((x) => x.id !== k.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaDeKitLocal({
  kit,
  online,
  onApagar,
}: {
  kit: KitLocal;
  online: JogadorOnlineParaItens[];
  onApagar: () => void;
}) {
  const [entrega, acaoEntrega, entregando] = useActionState(acaoEntregarItens, SEM_ENTREGA_ITENS);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const alvos = online
    .filter((p) => selecionados.has(p.discordId))
    .map((p) => ({ discordId: p.discordId, nome: p.nome, uid: p.uid, serverSlug: p.serverSlug }));

  useEffect(() => {
    if (entrega.ok) setSelecionados(new Set());
  }, [entrega.ok]);

  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-bg/40 p-5">
      <h3 className="font-semibold">{kit.nome}</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {kit.itens.map((i) => (
          <span
            key={i.itemId}
            title={nomeDoItem(i.itemId)}
            className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface-2/60 py-1 pr-2.5 pl-1"
          >
            <ItemIcon itemId={i.itemId} className="size-6" bare />
            <span className="tabular text-xs text-muted">×{i.quantidade}</span>
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAberto((v) => !v)} className={botao}>
          {aberto ? "Fechar entrega" : "Entregar este kit"}
        </button>
        {confirmando ? (
          <>
            <button type="button" onClick={onApagar} className={botaoPerigo}>
              Apagar de vez
            </button>
            <button type="button" onClick={() => setConfirmando(false)} className={botaoFantasma}>
              Não
            </button>
          </>
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

      {aberto && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-sm text-muted">Quem recebe este kit</p>
          <ListaDeJogadores
            online={online}
            selecionados={selecionados}
            onAlternar={(id) =>
              setSelecionados((atual) => {
                const novo = new Set(atual);
                if (novo.has(id)) novo.delete(id);
                else novo.add(id);
                return novo;
              })
            }
          />
          <form action={acaoEntrega}>
            <input type="hidden" name="alvos" value={JSON.stringify(alvos)} />
            <input type="hidden" name="itens" value={JSON.stringify(kit.itens)} />
            <button type="submit" disabled={entregando || alvos.length === 0} className={botao}>
              {entregando ? "Entregando…" : `Entregar para ${alvos.length} jogador(es)`}
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
    </li>
  );
}
