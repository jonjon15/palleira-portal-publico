"use client";

import { useMemo, useState } from "react";
import type { ItemDoCatalogo } from "@/lib/itens";
import { ItemIcon } from "@/components/item-icon";

/**
 * O seletor visual de item — a grade de ícones clicáveis do Creative Menu
 * (mod do jogo) trazida para o site.
 *
 * Mora em `components/` porque serve dois donos: "Entregar itens manual" na
 * moderação e a montagem de kit em `/admin/kits`. As duas telas escolhem
 * itens do mesmo jeito, e duplicar a grade significaria consertar cor de
 * raridade em dois lugares na próxima vez.
 */

/** As abas do painel, na ordem em que aparecem. `null` = todas. */
const ABAS: { chave: string | null; rotulo: string }[] = [
  { chave: null, rotulo: "Todos" },
  { chave: "esfera", rotulo: "Esferas" },
  { chave: "municao", rotulo: "Munição" },
  { chave: "recurso", rotulo: "Recursos" },
  { chave: "equipamento", rotulo: "Equipamento" },
  { chave: "comida", rotulo: "Comida" },
  { chave: "consumo", rotulo: "Consumíveis" },
  { chave: "esquema", rotulo: "Esquemas" },
  { chave: "moeda", rotulo: "Moedas" },
  { chave: "outro", rotulo: "Outros" },
];

/** Quantos ícones a grade desenha antes de pedir para refinar o filtro. */
const TETO_DA_GRADE = 300;

/**
 * O fundo de cada célula por grau do item (`grauDoItem` em `lib/itens.ts`).
 *
 * Escala clássica de raridade, porque é a que o jogador já lê sem legenda:
 * cinza → verde → azul → roxo → dourado. Bem apagado de propósito — a
 * grade tem centenas de células, e cor forte em todas viraria vitral.
 *
 * Item sem grau (Madeira, Pedra, Ouro) fica sem cor: não é "comum", é fora
 * da escala.
 */
export const FUNDO_POR_GRAU: Record<number, string> = {
  1: "border-line bg-surface",
  2: "border-success/30 bg-success/[0.07]",
  3: "border-[#4a9eff]/30 bg-[#4a9eff]/[0.07]",
  4: "border-[#a855f7]/30 bg-[#a855f7]/[0.07]",
  5: "border-gold/35 bg-gold/[0.09]",
};

export const SEM_GRAU = "border-line bg-surface";

export const ROTULO_DO_GRAU: Record<number, string> = {
  1: "Comum",
  2: "Incomum",
  3: "Raro",
  4: "Épico",
  5: "Lendário",
};

const campo =
  "w-full rounded-[var(--radius-control)] border border-line bg-bg px-4 py-2.5 outline-none focus:border-gold";

export function GradeDeItens({
  catalogo,
  jaEscolhidos,
  onEscolher,
  onFechar,
}: {
  catalogo: ItemDoCatalogo[];
  jaEscolhidos: Set<string>;
  onEscolher: (item: ItemDoCatalogo) => void;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(() => {
    const base = aba ? catalogo.filter((c) => c.categoria === aba) : catalogo;
    return termo ? base.filter((c) => c.nome.toLowerCase().includes(termo)) : base;
  }, [catalogo, aba, termo]);

  const mostrados = filtrados.slice(0, TETO_DA_GRADE);

  return (
    <div className="rounded-[var(--radius-card)] border border-line-strong bg-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">Escolher itens</p>
        <button
          type="button"
          onClick={onFechar}
          className="shrink-0 rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface"
        >
          Fechar
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ABAS.map((a) => {
          const ativa = a.chave === aba;
          return (
            <button
              key={a.rotulo}
              type="button"
              onClick={() => setAba(a.chave)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                ativa
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-line text-muted hover:border-line-strong hover:text-text"
              }`}
            >
              {a.rotulo}
            </button>
          );
        })}
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Filtrar por nome dentro da categoria…"
        autoComplete="off"
        className={`${campo} mt-3 text-sm`}
      />

      {mostrados.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nenhum item{termo && ` com “${busca.trim()}”`} nesta categoria.
        </p>
      ) : (
        <div className="mt-3 grid max-h-96 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 overflow-y-auto pr-1">
          {mostrados.map((c) => {
            const escolhido = jaEscolhidos.has(c.id);
            const fundo = c.grau ? FUNDO_POR_GRAU[c.grau] : SEM_GRAU;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onEscolher(c)}
                title={c.grau ? `${c.nome} · ${ROTULO_DO_GRAU[c.grau]}` : c.nome}
                className={`flex flex-col items-center gap-1 rounded-[var(--radius-control)] border p-2 transition-colors ${
                  escolhido
                    ? "border-gold/70 bg-gold/20 ring-1 ring-gold/40"
                    : `${fundo} hover:border-gold/40`
                }`}
              >
                <ItemIcon itemId={c.id} className="size-14" bare />
                <span className="line-clamp-2 text-center text-[0.7rem] leading-tight text-muted">
                  {c.nome}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
        <span>
          {filtrados.length > TETO_DA_GRADE
            ? `Mostrando ${TETO_DA_GRADE} de ${filtrados.length} — use a busca ou uma categoria para afinar.`
            : `${filtrados.length} item(ns). Clique em quantos quiser.`}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {([1, 2, 3, 4, 5] as const).map((g) => (
            <span key={g} className="flex items-center gap-1">
              <span className={`size-2.5 rounded-sm border ${FUNDO_POR_GRAU[g]}`} aria-hidden />
              {ROTULO_DO_GRAU[g]}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** Uma linha do lote montado — ícone, nome com o grau, quantidade e remover. */
export function LinhaDoLote({
  item,
  itemId,
  quantidade,
  onQuantidade,
  onRemover,
}: {
  item: ItemDoCatalogo | undefined;
  itemId: string;
  quantidade: string;
  onQuantidade: (valor: string) => void;
  onRemover: () => void;
}) {
  const nome = item?.nome ?? itemId;
  return (
    <div
      className={`flex items-center gap-2 rounded-[var(--radius-control)] border px-2 py-1.5 ${
        item?.grau ? FUNDO_POR_GRAU[item.grau] : SEM_GRAU
      }`}
    >
      <ItemIcon itemId={itemId} className="size-9 shrink-0" bare />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {nome}
        {item?.grau && (
          <span className="ml-2 text-xs font-normal text-muted">
            {ROTULO_DO_GRAU[item.grau]}
          </span>
        )}
      </span>
      {/*
        Sem a classe `campo` aqui: ela traz `w-full`, que é a mesma
        propriedade CSS do `w-24` e ganha dela na folha gerada pelo Tailwind
        — o campo de quantidade esticava e espremia o resto da linha.
      */}
      <input
        type="number"
        min={1}
        max={99_999}
        value={quantidade}
        onChange={(e) => onQuantidade(e.target.value)}
        className="w-24 shrink-0 rounded-[var(--radius-control)] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-gold"
        aria-label={`Quantidade de ${nome}`}
      />
      <button
        type="button"
        onClick={onRemover}
        className="shrink-0 rounded-[var(--radius-control)] border border-line-strong px-2.5 py-2 text-xs text-muted transition-colors hover:border-danger/40 hover:text-danger"
        aria-label="Tirar do lote"
      >
        ✕
      </button>
    </div>
  );
}
