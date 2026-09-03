"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { levelOf, canManageEvents } from "@/lib/roles";
import {
  adicionarImagemDoEvento,
  removerImagemDoEvento,
  editarEvento,
  type EdicaoEvento,
} from "@/lib/eventos";

export interface Estado {
  ok: boolean;
  mensagem: string;
}

/** Mesma trava de `/admin/eventos/actions.ts` — quem mexe na galeria também precisa poder escrever no mural. */
async function exigirCriador() {
  const session = await auth();
  if (!session) throw new Error("Sem sessão");
  const nivel = levelOf(session.user.roles, session.user.isMember);
  if (!canManageEvents(nivel, session.user.roles)) throw new Error("Sem permissão");
}

export async function salvarEdicao(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  await exigirCriador();
  const eventId = Number(form.get("eventId"));
  if (!Number.isInteger(eventId)) return { ok: false, mensagem: "Evento inválido." };

  const input: EdicaoEvento = {
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? ""),
    coverEmoji: String(form.get("coverEmoji") ?? ""),
    coverImageUrl: String(form.get("coverImageUrl") ?? ""),
    serverSlug: String(form.get("serverSlug") ?? ""),
    startsAt: String(form.get("startsAt") ?? ""),
    endsAt: String(form.get("endsAt") ?? ""),
  };

  const resultado = await editarEvento(eventId, input);
  if (resultado.ok) {
    revalidatePath("/");
    revalidatePath("/eventos");
    revalidatePath(`/eventos/${eventId}`);
    revalidatePath(`/admin/eventos/${eventId}`);
    revalidatePath("/admin/eventos");
  }
  return resultado;
}

export async function adicionarFoto(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  await exigirCriador();
  const eventId = Number(form.get("eventId"));
  if (!Number.isInteger(eventId)) return { ok: false, mensagem: "Evento inválido." };

  const resultado = await adicionarImagemDoEvento(
    eventId,
    String(form.get("url") ?? ""),
    String(form.get("caption") ?? ""),
  );
  if (resultado.ok) {
    revalidatePath(`/admin/eventos/${eventId}`);
    revalidatePath("/eventos");
  }
  return resultado;
}

export async function removerFoto(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  await exigirCriador();
  const eventId = Number(form.get("eventId"));
  const imageId = Number(form.get("imageId"));
  if (!Number.isInteger(imageId)) return { ok: false, mensagem: "Foto inválida." };

  const resultado = await removerImagemDoEvento(imageId);
  if (resultado.ok) {
    revalidatePath(`/admin/eventos/${eventId}`);
    revalidatePath("/eventos");
  }
  return resultado;
}
