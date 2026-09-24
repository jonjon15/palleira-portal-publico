"use server";

import { revalidatePath } from "next/cache";
import {
  iniciarRitual,
  iniciarRitualDoCofre,
  doarPal,
  definirRegraDoRitual,
  atualizarReferenciaDeRegra,
  cancelarRitual,
  resgatarPalPurificado,
  atualizarIvMinimoResgate,
  marcarRitualResgatadoSeConcluido,
  type Resultado,
} from "@/lib/purificacao";
import { consultarResgate } from "@/app/painel/cofre/pals/actions";
import { CAMARA_EM_MANUTENCAO, MENSAGEM_MANUTENCAO } from "./manutencao";

/**
 * Ponte entre a tela do jogador e `lib/purificacao`. Sessão, vínculo e
 * estado do jogo são conferidos lá dentro, nunca aqui — mesma disciplina do
 * cofre de Pals (`app/painel/cofre/pals/actions.ts`).
 *
 * A flag de manutenção mora em `./manutencao.ts` — um arquivo `"use server"`
 * só pode exportar `async function`, uma `const` aqui quebra o build.
 */

export type Estado = Resultado;

function atualiza() {
  revalidatePath("/purificacao");
  revalidatePath("/admin/purificacao");
}

export async function acaoIniciarRitual(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  if (CAMARA_EM_MANUTENCAO) return MENSAGEM_MANUTENCAO;
  const r = await iniciarRitual(
    String(form.get("servidor") ?? ""),
    String(form.get("instanceId") ?? ""),
    form.get("aceitaPerderDespertar") === "1",
  );
  atualiza();
  return r;
}

/** Começa a purificação com um Pal do cofre de Pals do site. Ver `iniciarRitualDoCofre`. */
export async function acaoIniciarRitualDoCofre(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  if (CAMARA_EM_MANUTENCAO) return MENSAGEM_MANUTENCAO;
  const r = await iniciarRitualDoCofre(Number(form.get("vaultPalId") ?? 0));
  atualiza();
  return r;
}

export async function acaoDoarPal(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  if (CAMARA_EM_MANUTENCAO) return MENSAGEM_MANUTENCAO;
  const r = await doarPal(String(form.get("instanceId") ?? ""));
  atualiza();
  return r;
}

/**
 * Mesma ação de `app/admin/purificacao/actions.ts` — exposta aqui também
 * para o staff poder definir a regra sem sair de `/purificacao`. A checagem
 * de staff mora em `definirRegraDoRitual` (`exigirStaff`), nunca aqui.
 */
export async function acaoDefinirRegra(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const ritualId = Number(form.get("ritualId") ?? 0);
  const passivas = form.getAll("passivas").map(String);
  const r = await definirRegraDoRitual(ritualId, passivas);
  atualiza();
  return r;
}

export async function acaoCancelarRitual(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  if (CAMARA_EM_MANUTENCAO) return MENSAGEM_MANUTENCAO;
  const r = await cancelarRitual(Number(form.get("ritualId") ?? 0));
  atualiza();
  return r;
}

/**
 * Define a "sugestão de passivas" da Câmara — configuração única e global
 * (`purification_referencia`), o botão "Editar" fica sempre visível para
 * staff, mesmo sem ritual em andamento (§pedido do dono, 14/09/2026, com
 * prazo de validade a partir de 21/09/2026).
 */
export async function acaoAtualizarReferencia(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const passivas = form.getAll("passivas").map(String);
  const dias = Number(form.get("dias") ?? 0);
  const horas = Number(form.get("horas") ?? 0);
  const minutos = Number(form.get("minutos") ?? 0);
  const minutosValidade = dias * 24 * 60 + horas * 60 + minutos;
  const r = await atualizarReferenciaDeRegra(passivas, minutosValidade);
  atualiza();
  return r;
}

export interface EstadoResgate extends Estado {
  transferId?: number;
}

export async function acaoResgatarPal(
  _anterior: EstadoResgate,
  form: FormData,
): Promise<EstadoResgate> {
  if (CAMARA_EM_MANUTENCAO) return MENSAGEM_MANUTENCAO;
  const ritualId = Number(form.get("ritualId") ?? 0);
  const r = await resgatarPalPurificado(ritualId);
  atualiza();
  return r;
}

/** Polling do resgate — mesma função que o cofre de Pals usa, já confirma dono antes de chamar `givepal_j`. */
export async function acaoConsultarResgate(transferId: number) {
  const r = await consultarResgate(transferId);
  if (r?.status === "concluido") {
    await marcarRitualResgatadoSeConcluido(transferId);
    atualiza();
  }
  return r;
}

/** Staff muda o IV mínimo pra resgatar o Pal purificado — configuração global, vale pra Câmara inteira. */
export async function acaoAtualizarIvMinimoResgate(
  _anterior: Estado,
  form: FormData,
): Promise<Estado> {
  const ivMinimo = Number(form.get("ivMinimo") ?? 0);
  const r = await atualizarIvMinimoResgate(ivMinimo);
  atualiza();
  return r;
}
