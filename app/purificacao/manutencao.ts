import type { Resultado } from "@/lib/purificacao";

/**
 * Câmara de Purificação em manutenção (21/09/2026) — o feedback do
 * Dayvison no Discord (15/09) pediu texto explicativo, que já entrou, mas
 * o dono avisou que o resto ainda não está pronto para produção.
 *
 * Trava só as ações de JOGADOR (iniciar, doar, cancelar, resgatar) — staff
 * segue podendo ajustar regra/IV mínimo por trás enquanto prepara o resto
 * (pedido do dono). O banner em `page.tsx` é só o aviso visual; quem
 * segura de verdade é esta constante, para o caso de algum botão escapar
 * desabilitado na tela.
 *
 * Módulo separado de `actions.ts`: um arquivo `"use server"` só pode
 * exportar `async function` — uma `const` aqui quebra o build.
 *
 * Para reabrir: `false` aqui.
 */
export const CAMARA_EM_MANUTENCAO = true;

export const MENSAGEM_MANUTENCAO: Resultado = {
  ok: false,
  mensagem: "A Câmara de Purificação está em manutenção — volta em breve.",
};
