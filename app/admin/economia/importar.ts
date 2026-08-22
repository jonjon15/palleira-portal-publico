"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canManageEconomy } from "@/lib/roles";
import {
  listarMembros,
  SemIntentError,
  SemAcessoAoCanalError,
} from "@/lib/discord";
import { lerSaldosDoCanal } from "@/lib/palbot";
import { migrarDoPalbot, jaFoiMigrado } from "@/lib/economia";
import type { Achado, EstadoCanal } from "./actions";

/**
 * Importa os saldos lendo as respostas do Palbot no Discord (§7.1).
 *
 * Duas passadas de propósito: **ver** mostra o que tem lá sem gravar nada, e
 * **importar** grava. Ninguém mexe em saldo dos outros às cegas.
 */

async function exigirCupula() {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  if (!canManageEconomy(levelOf(session.user.roles, session.user.isMember))) {
    throw new Error("Sem permissão");
  }
  return session.user.discordId;
}

const nada = (mensagem: string): EstadoCanal => ({
  ok: false,
  mensagem,
  aplicou: false,
  achados: [],
  semDono: [],
});

export async function lerOuImportar(
  _anterior: EstadoCanal,
  form: FormData,
): Promise<EstadoCanal> {
  const actorId = await exigirCupula();

  const canalId = String(form.get("canal") ?? "");
  const gravar = String(form.get("acao") ?? "") === "importar";
  if (!/^\d{15,25}$/.test(canalId)) {
    return nada("Escolha o canal onde o Palbot respondeu.");
  }

  let leitura;
  try {
    leitura = await lerSaldosDoCanal(canalId);
  } catch (e) {
    if (e instanceof SemAcessoAoCanalError) {
      return nada(
        "O bot não enxerga esse canal. Nas permissões do canal, dê ao cargo do bot Ver canal e Ler histórico de mensagens.",
      );
    }
    throw e;
  }

  if (leitura.semConteudo) {
    return nada(
      "O Discord devolveu as mensagens vazias. Ligue o Message Content Intent no Developer Portal → Bot → Privileged Gateway Intents.",
    );
  }

  // Consultas de admin (/checkpoints) trazem só o nome — resolver se der.
  const semDono: { nome: string; saldo: number }[] = [];
  const porNome = new Map<string, string[]>();
  if (leitura.nomesSoltos.length) {
    try {
      for (const m of await listarMembros()) {
        for (const chave of [m.username, m.displayName]) {
          const k = chave.toLowerCase();
          const atual = porNome.get(k) ?? [];
          if (!atual.includes(m.id)) porNome.set(k, [...atual, m.id]);
        }
      }
    } catch (e) {
      if (!(e instanceof SemIntentError)) throw e;
    }
  }

  const achados: Achado[] = leitura.saldos.map((s) => ({
    discordId: s.discordId,
    nome: s.nome,
    saldo: s.saldo,
    via: s.via,
    jaMigrado: false,
    importado: false,
  }));

  const jaTem = new Set(achados.map((a) => a.discordId));
  for (const n of leitura.nomesSoltos) {
    const ids = porNome.get(n.nome.toLowerCase()) ?? [];
    // Um nome só entra se resolver para exatamente uma pessoa que ainda não
    // apareceu — palpite em saldo alheio não vale a pena.
    if (ids.length === 1 && !jaTem.has(ids[0])) {
      jaTem.add(ids[0]);
      achados.push({
        discordId: ids[0],
        nome: n.nome,
        saldo: n.saldo,
        via: "checkpoints",
        jaMigrado: false,
        importado: false,
      });
    } else {
      semDono.push({ nome: n.nome, saldo: n.saldo });
    }
  }

  for (const a of achados) {
    a.jaMigrado = await jaFoiMigrado(a.discordId);
  }

  if (achados.length === 0 && semDono.length === 0) {
    return nada(
      `Li ${leitura.mensagensLidas} mensagens e não achei nenhuma resposta de saldo. Peça para o pessoal rodar /balance nesse canal.`,
    );
  }

  if (!gravar) {
    const novos = achados.filter((a) => !a.jaMigrado).length;
    return {
      ok: true,
      aplicou: false,
      mensagem: `Achei ${achados.length} saldo${achados.length > 1 ? "s" : ""} em ${leitura.mensagensLidas} mensagens — ${novos} ainda não migrado${novos === 1 ? "" : "s"}. Confira e clique em importar.`,
      achados,
      semDono,
    };
  }

  let novos = 0;
  for (const a of achados) {
    if (a.jaMigrado) continue;
    const r = await migrarDoPalbot(a.discordId, a.saldo, actorId);
    a.importado = r.status === "ok";
    if (a.importado) novos++;
  }

  revalidatePath("/admin/economia");
  revalidatePath("/painel/carteira");

  return {
    ok: true,
    aplicou: true,
    mensagem:
      novos === 0
        ? "Nada novo: todo mundo desse canal já tinha sido migrado."
        : `${novos} carteira${novos > 1 ? "s" : ""} migrada${novos > 1 ? "s" : ""} direto do Discord.`,
    achados,
    semDono,
  };
}
