"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canManageEconomy } from "@/lib/roles";
import { listarMembros, buscarMembro, SemIntentError } from "@/lib/discord";
import { migrarDoPalbot, ajustar } from "@/lib/economia";

export interface LinhaResultado {
  entrada: string;
  quem: string;
  quanto: number;
  situacao: "migrado" | "ja-tinha" | "nao-achei" | "ambiguo" | "numero-ruim";
}

export interface Relatorio {
  ok: boolean;
  mensagem: string;
  linhas: LinhaResultado[];
}

const VAZIO: Relatorio = { ok: false, mensagem: "", linhas: [] };

/** Todo mundo que mexe em economia passa por aqui antes (§7.8). */
async function exigirCupula() {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  const nivel = levelOf(session.user.roles, session.user.isMember);
  if (!canManageEconomy(nivel)) throw new Error("Sem permissão");
  return session.user.discordId;
}

const soDigitos = (s: string) => /^\d{15,25}$/.test(s);

/**
 * Migra em lote os saldos lidos do Palbot.
 *
 * O admin roda `/checkpoints @fulano` no Discord, anota, e cola aqui uma
 * linha por pessoa: `nome 26`.
 *
 * Estratégia: **entende tudo primeiro, grava depois**. Se uma linha sequer
 * não fizer sentido, nada é gravado — assim ninguém descobre no meio da
 * lista que metade entrou e metade não.
 */
export async function migrarEmLote(
  _anterior: Relatorio,
  form: FormData,
): Promise<Relatorio> {
  const actorId = await exigirCupula();
  const texto = String(form.get("lista") ?? "").trim();

  if (!texto) {
    return { ...VAZIO, mensagem: "Cole a lista antes de migrar." };
  }

  // Índice de nome → ID. Só precisa do Discord se alguma linha vier por nome.
  const linhasBrutas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const precisaNome = linhasBrutas.some((l) => {
    const p = l.split(/[\s,;\t]+/).filter(Boolean);
    return p.length >= 2 && !soDigitos(p[0]);
  });

  let porNome = new Map<string, string[]>();
  if (precisaNome) {
    try {
      porNome = indexar(await listarMembros());
    } catch (e) {
      if (e instanceof SemIntentError) {
        return {
          ...VAZIO,
          mensagem:
            "Para migrar por nome, ligue o Server Members Intent no Developer Portal do Discord. Enquanto isso, dá para colar o ID numérico de cada pessoa.",
        };
      }
      throw e;
    }
  }

  // ------------------------------------------------------------- entender
  const planejadas: { entrada: string; id: string; nome: string; quanto: number }[] =
    [];
  const problemas: LinhaResultado[] = [];

  for (const linha of linhasBrutas) {
    const partes = linha.split(/[\s,;\t]+/).filter(Boolean);
    const quanto = Number(partes[partes.length - 1]);
    const alvo = partes.slice(0, -1).join(" ").replace(/^@/, "");

    if (
      partes.length < 2 ||
      !Number.isInteger(quanto) ||
      quanto < 0 ||
      quanto > 1_000_000
    ) {
      problemas.push({
        entrada: linha,
        quem: alvo || linha,
        quanto: 0,
        situacao: "numero-ruim",
      });
      continue;
    }

    if (soDigitos(alvo)) {
      planejadas.push({ entrada: linha, id: alvo, nome: alvo, quanto });
      continue;
    }

    const achados = porNome.get(alvo.toLowerCase()) ?? [];
    if (achados.length === 0) {
      problemas.push({
        entrada: linha,
        quem: alvo,
        quanto,
        situacao: "nao-achei",
      });
    } else if (achados.length > 1) {
      problemas.push({
        entrada: linha,
        quem: alvo,
        quanto,
        situacao: "ambiguo",
      });
    } else {
      planejadas.push({ entrada: linha, id: achados[0], nome: alvo, quanto });
    }
  }

  if (problemas.length) {
    return {
      ok: false,
      mensagem: `${problemas.length} linha${problemas.length > 1 ? "s" : ""} não deu para entender. Nada foi gravado — corrija e mande de novo.`,
      linhas: problemas,
    };
  }

  // --------------------------------------------------------------- gravar
  const linhas: LinhaResultado[] = [];
  for (const p of planejadas) {
    const r = await migrarDoPalbot(p.id, p.quanto, actorId);
    linhas.push({
      entrada: p.entrada,
      quem: p.nome,
      quanto: p.quanto,
      situacao: r.status === "ok" ? "migrado" : "ja-tinha",
    });
  }

  const novos = linhas.filter((l) => l.situacao === "migrado").length;
  revalidatePath("/admin/economia");
  revalidatePath("/painel/carteira");

  return {
    ok: true,
    mensagem:
      novos === 0
        ? "Todo mundo dessa lista já tinha sido migrado. Nada mudou."
        : `${novos} carteira${novos > 1 ? "s" : ""} migrada${novos > 1 ? "s" : ""}.`,
    linhas,
  };
}

/** Nome → IDs. Guarda o @ e o apelido do servidor, os dois em minúsculo. */
function indexar(membros: Awaited<ReturnType<typeof listarMembros>>) {
  const mapa = new Map<string, string[]>();
  const por = (chave: string, id: string) => {
    const k = chave.toLowerCase();
    const atual = mapa.get(k) ?? [];
    if (!atual.includes(id)) mapa.set(k, [...atual, id]);
  };
  for (const m of membros) {
    por(m.username, m.id);
    por(m.displayName, m.id);
  }
  return mapa;
}

/* ------------------------------------------------------------------ ajuste */

export interface EstadoAjuste {
  ok: boolean;
  mensagem: string;
}

export async function ajustarSaldo(
  _anterior: EstadoAjuste,
  form: FormData,
): Promise<EstadoAjuste> {
  const actorId = await exigirCupula();

  const alvo = String(form.get("alvo") ?? "").trim().replace(/^@/, "");
  const delta = Number(form.get("delta"));
  const motivo = String(form.get("motivo") ?? "").trim();

  if (!soDigitos(alvo)) {
    return {
      ok: false,
      mensagem: "Cole o ID numérico do Discord (clique direito na pessoa → Copiar ID).",
    };
  }
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false, mensagem: "O valor tem que ser inteiro e diferente de zero." };
  }
  if (motivo.length < 5) {
    return { ok: false, mensagem: "Escreva o motivo. Ele fica no extrato da pessoa." };
  }

  const membro = await buscarMembro(alvo).catch(() => null);

  const r = await ajustar({ discordId: alvo, delta, motivo, actorId });
  revalidatePath("/admin/economia");
  revalidatePath("/painel/carteira");

  if (r.status === "sem-saldo") {
    return {
      ok: false,
      mensagem: `Não dá: ${membro?.displayName ?? alvo} tem ${r.saldo} e isso deixaria a carteira negativa.`,
    };
  }

  return {
    ok: true,
    mensagem: `${delta > 0 ? "+" : ""}${delta} para ${membro?.displayName ?? alvo}. Saldo agora: ${r.saldo}.`,
  };
}

/* ------------------------------------------- importar direto do Discord */

export interface Achado {
  discordId: string;
  nome: string;
  saldo: number;
  via: "balance" | "checkpoints";
  jaMigrado: boolean;
  importado: boolean;
}

export interface EstadoCanal {
  ok: boolean;
  mensagem: string;
  aplicou: boolean;
  achados: Achado[];
  semDono: { nome: string; saldo: number }[];
}
