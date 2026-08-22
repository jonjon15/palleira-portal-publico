import { Socket } from "node:net";
import type { PalleiraServer } from "@/lib/servers";

/**
 * Cliente RCON do Palworld (§3.2 e §3.5 do PROMPT.md).
 *
 * É o único caminho para **agir** no jogo: mandar mensagem para um jogador,
 * entregar item, tirar Pal do vendedor. A REST do PalDefender só lê.
 *
 * ⚠️ RCON manda a senha em texto puro. Roda só em Route Handler / Server
 * Action, nunca perto do navegador, e a senha vive só no `vercel env`.
 *
 * ⚠️ Runtime Node.js — precisa de socket TCP, não funciona no Edge.
 */

const AUTH = 3;
const EXEC = 2;

function encode(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(payload.length + 14);
  buf.writeInt32LE(payload.length + 10, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  buf.writeInt16LE(0, payload.length + 12);
  return buf;
}

export class RconError extends Error {}

/**
 * Abre a conexão, autentica, roda o comando e fecha.
 *
 * Sem pool de conexão de propósito: função serverless é efêmera e cada
 * invocação vive pouco — manter socket aberto entre chamadas não funciona.
 */
export function rcon(
  server: PalleiraServer,
  command: string,
  timeoutMs = 10_000,
): Promise<string> {
  if (!server.rconPort) {
    return Promise.reject(
      new RconError(`RCON desligado no ${server.shortName}`),
    );
  }
  if (!server.adminPassword) {
    return Promise.reject(
      new RconError(`Senha de admin ausente para ${server.slug}`),
    );
  }

  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let buffer = Buffer.alloc(0);
    let authenticated = false;

    const fail = (msg: string) => {
      socket.destroy();
      reject(new RconError(msg));
    };

    const timer = setTimeout(() => fail("RCON não respondeu a tempo"), timeoutMs);

    socket.setTimeout(timeoutMs);
    socket.on("error", (e) => {
      clearTimeout(timer);
      fail(`RCON falhou: ${e.message}`);
    });
    socket.on("timeout", () => {
      clearTimeout(timer);
      fail("RCON expirou");
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < size + 4) break;

        const id = buffer.readInt32LE(4);
        const body = buffer.subarray(12, size + 2).toString("utf8");
        buffer = buffer.subarray(size + 4);

        if (!authenticated) {
          // id -1 é a resposta padrão do protocolo para senha errada
          if (id === -1) {
            clearTimeout(timer);
            return fail("Senha de RCON recusada");
          }
          authenticated = true;
          socket.write(encode(2, EXEC, command));
          continue;
        }

        clearTimeout(timer);
        socket.end();
        return resolve(body.replace(/\0/g, "").trim());
      }
    });

    socket.connect(server.rconPort, server.host, () => {
      socket.write(encode(1, AUTH, server.adminPassword));
    });
  });
}

/**
 * Manda uma mensagem privada para um jogador dentro do jogo.
 *
 * Testado: com UID inexistente o comando responde "Failed to find player by
 * UserId", ou seja, ele procura o jogador antes de entregar — é direcionado,
 * não anúncio geral.
 */
export async function sendToPlayer(
  server: PalleiraServer,
  playerUid: string,
  message: string,
): Promise<boolean> {
  // O comando quebra em espaço; o PalDefender aceita a mensagem no fim.
  const res = await rcon(server, `send msg ${playerUid} ${message}`);
  return res.toLowerCase().includes("succeeded");
}
