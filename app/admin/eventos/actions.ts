"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canManageEvents } from "@/lib/roles";
import {
  criarEvento,
  mudarStatusEvento,
  fixarEvento,
  desfixarEvento,
  excluirRascunho,
  type NovoEvento,
} from "@/lib/eventos";

export interface Estado {
  ok: boolean;
  mensagem: string;
}

/** Todo mundo que escreve no mural passa por aqui antes — staff ou cargo Criador de Evento. */
async function exigirCriador() {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  const nivel = levelOf(session.user.roles, session.user.isMember);
  if (!canManageEvents(nivel, session.user.roles)) throw new Error("Sem permissão");
  return {
    discordId: session.user.discordId,
    nome: session.user.nick || session.user.name || "Palleira",
  };
}

function revalidarMural() {
  revalidatePath("/");
  revalidatePath("/eventos");
  revalidatePath("/admin/eventos");
}

export async function publicarNovoEvento(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const { discordId, nome } = await exigirCriador();

  const input: NovoEvento = {
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? ""),
    coverEmoji: String(form.get("coverEmoji") ?? ""),
    serverSlug: String(form.get("serverSlug") ?? ""),
    startsAt: String(form.get("startsAt") ?? ""),
    endsAt: String(form.get("endsAt") ?? ""),
    pinned: form.get("pinned") === "on",
    publicar: form.get("publicar") === "on",
  };

  const resultado = await criarEvento(input, discordId, nome);
  if (resultado.ok) revalidarMural();
  return resultado;
}

/** Publicar, arquivar, republicar, fixar, desfixar e excluir rascunho — tudo pela mesma linha. */
export async function agirSobreEvento(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  await exigirCriador();

  const id = Number(form.get("id"));
  const acao = String(form.get("acao") ?? "");
  if (!Number.isInteger(id)) return { ok: false, mensagem: "Evento inválido." };

  const resultado = await (async () => {
    switch (acao) {
      case "publicar":
      case "republicar":
        return mudarStatusEvento(id, "publicado");
      case "arquivar":
        return mudarStatusEvento(id, "arquivado");
      case "fixar":
        return fixarEvento(id);
      case "desfixar":
        return desfixarEvento(id);
      case "excluir":
        return excluirRascunho(id);
      default:
        return { ok: false, mensagem: "Ação desconhecida." };
    }
  })();

  if (resultado.ok) revalidarMural();
  return resultado;
}
