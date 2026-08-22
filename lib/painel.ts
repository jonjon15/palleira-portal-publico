/**
 * Cliente do painel da ENX / Enxada Host (Pterodactyl).
 *
 * Existe por um motivo só: **ligar e reiniciar servidor**.
 *
 * A REST do Palworld não faz isso e nunca vai fazer — ela é servida pelo
 * próprio processo do servidor, então morre junto com ele. Não há ninguém
 * para atender um `start`. Os endpoints são `shutdown` e `stop`, ponto.
 *
 * Quem tem energia é o painel do host, no mesmo mecanismo que roda a tarefa
 * "Restart" diária: `POST /api/client/servers/{id}/power`.
 *
 * ⚠️ A chave daqui é mais poderosa que a senha de admin do jogo: dá acesso a
 * arquivos, backups e energia dos três servidores. Vive só no `vercel env`,
 * roda só em Server Action, e nunca chega perto do navegador.
 *
 * ⚠️ NÃO usar este módulo para saber se o servidor está no ar. O egg de
 * Palworld da ENX procura no log uma frase que o servidor não escreve mais,
 * então o painel mostra "INICIANDO" para sempre — os três apareciam assim
 * com jogador dentro e horas de uptime. Estado do servidor vem de
 * `getMetrics`, que fala a verdade.
 */

import type { PalleiraServer } from "@/lib/servers";

const PANEL_URL = (
  process.env.ENX_PANEL_URL ?? "https://painel.enxadahost.com"
).replace(/\/+$/, "");

const apiKey = () => process.env.ENX_API_KEY ?? "";

/** Os quatro comandos do menu "Enviar energia" do painel. */
export type Sinal = "start" | "restart" | "stop" | "kill";

export const SINAL_LABEL: Record<Sinal, string> = {
  start: "Iniciar",
  restart: "Reiniciar",
  stop: "Desligar",
  kill: "Finalizar",
};

export class PainelError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PainelError";
  }
}

async function call(
  endpoint: string,
  init: RequestInit = {},
): Promise<Response> {
  const chave = apiKey();
  if (!chave) {
    throw new PainelError(
      "Chave da API do painel ausente. Configure ENX_API_KEY no vercel env.",
    );
  }

  const res = await fetch(`${PANEL_URL}/api/client${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${chave}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new PainelError(
      "O painel recusou a chave. Ela pode ter sido revogada ou não ter permissão neste servidor.",
      res.status,
    );
  }

  return res;
}

/**
 * Manda um comando de energia e volta assim que o painel aceita.
 *
 * O painel responde 204 na hora e executa em segundo plano — um `restart`
 * volta "ok" antes de o servidor ter subido. Quem confirma que voltou é o
 * `getMetrics`, não esta função.
 */
export async function enviarEnergia(
  server: PalleiraServer,
  sinal: Sinal,
): Promise<void> {
  if (!server.panelId) {
    throw new PainelError(
      `Falta o ID do painel para ${server.shortName}. Pegue na URL do painel (/server/XXXXXXXX) e cadastre em lib/servers.ts.`,
    );
  }

  const res = await call(`/servers/${server.panelId}/power`, {
    method: "POST",
    body: JSON.stringify({ signal: sinal }),
  });

  // 204 No Content é o "aceito" do Pterodactyl.
  if (res.status !== 204 && !res.ok) {
    throw new PainelError(
      `O painel respondeu ${res.status} ao pedir "${SINAL_LABEL[sinal]}".`,
      res.status,
    );
  }
}

export interface ServidorDoPainel {
  identifier: string;
  name: string;
}

/**
 * Lista os servidores que a chave enxerga.
 *
 * Serve para conferir a configuração: o `identifier` daqui é o que vai em
 * `panelId`, e o `name` diz qual é qual sem depender de adivinhação.
 */
export async function listarServidores(): Promise<ServidorDoPainel[]> {
  const res = await call("");
  if (!res.ok) {
    throw new PainelError(`O painel respondeu ${res.status}.`, res.status);
  }

  const json = (await res.json()) as {
    data?: { attributes?: { identifier?: string; name?: string } }[];
  };

  return (json.data ?? [])
    .map((d) => ({
      identifier: d.attributes?.identifier ?? "",
      name: d.attributes?.name ?? "",
    }))
    .filter((s) => s.identifier);
}
