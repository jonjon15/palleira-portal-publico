import type { Resultado } from "@/lib/purificacao";

/**
 * Câmara de Purificação — manutenção ligada em 21/09/2026 (texto
 * explicativo do feedback do Dayvison no Discord, 15/09, entrou primeiro),
 * desligada no mesmo dia depois de validar a sugestão de passivas com
 * validade em localhost.
 *
 * Trava só as ações de JOGADOR (iniciar, doar, cancelar, resgatar) — staff
 * segue podendo ajustar regra/IV mínimo por trás independente desta flag.
 * O banner em `page.tsx` é só o aviso visual; quem segura de verdade é
 * esta constante, para o caso de algum botão escapar desabilitado na tela.
 *
 * Módulo separado de `actions.ts`: um arquivo `"use server"` só pode
 * exportar `async function` — uma `const` aqui quebra o build.
 *
 * Para fechar de novo: `true` aqui.
 */
export const CAMARA_EM_MANUTENCAO = false;

export const MENSAGEM_MANUTENCAO: Resultado = {
  ok: false,
  mensagem: "A Câmara de Purificação está em manutenção — volta em breve.",
};
