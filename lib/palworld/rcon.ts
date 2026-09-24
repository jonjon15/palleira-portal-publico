import { Socket } from "node:net";
import type { PalleiraServer } from "@/lib/servers";
import { uidParaComando } from "@/lib/palworld/uid";

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
 *
 * Recebe o UID canônico (sem hífen) e devolve o formato 8-8-8-8 na hora de
 * montar o comando — que é a forma comprovada com o jogo. Esta é a única
 * fronteira do site onde o UID com hífen existe.
 */
export async function sendToPlayer(
  server: PalleiraServer,
  playerUid: string,
  message: string,
): Promise<boolean> {
  // O comando quebra em espaço; o PalDefender aceita a mensagem no fim.
  const res = await rcon(
    server,
    `send msg ${uidParaComando(playerUid)} ${message}`,
  );
  return res.toLowerCase().includes("succeeded");
}

/**
 * Expulsa alguém do servidor e anuncia o motivo no chat de todos.
 *
 * ⚠️ O `Broadcast` do Palworld corta a mensagem no primeiro espaço — por
 * isso as linhas vão com underscore. Sem isso só a primeira palavra chega.
 *
 * O `userId` aqui é o da plataforma (`steam_…`, `gdk_…`, `ps5_…`), que é o
 * que `KickPlayer` espera — não o `palworld_uid` canônico do resto do site.
 */
export async function kickPlayer(
  server: PalleiraServer,
  userId: string,
  linhasDoAviso: string[],
): Promise<boolean> {
  for (const linha of linhasDoAviso) {
    await rcon(server, `Broadcast ${linha.replace(/\s+/g, "_")}`).catch(() => "");
  }
  const res = await rcon(server, `KickPlayer ${userId}`);
  return res.toLowerCase().includes("kicked");
}

/* ------------------------------------------------------- itens (o cofre) */

export interface ResultadoComando {
  ok: boolean;
  /** A resposta crua do jogo. Vai para o log da transferência. */
  resposta: string;
}

/**
 * Sucesso é "não falhou" — e a inversão é proposital.
 *
 * Sondado por RCON em 23/08/2026, o PalDefender recusa dizendo o motivo:
 *
 * ```
 * delitems                          → Failed to execute command 'delitems', it requires at least 2 arguments.
 * delitems 00000000-… Wood:1        → Failed to find player by UserId '00000000-…'.
 * ```
 *
 * Exigir a palavra "succeeded" pareceria mais rigoroso, mas seria pior: se
 * a confirmação do `giveitems` tiver outro texto, o site concluiria que a
 * entrega falhou **depois de o item já ter chegado** — e devolveria a cópia
 * ao cofre. Falso negativo em entrega vira duplicação de item; falso
 * positivo vira um item perdido, que o extrato mostra e o admin conserta.
 * Entre os dois, o segundo é o erro que se pode corrigir.
 *
 * ⚠️ Mas nem toda recusa começa com "Failed". Medido em 20/09/2026, na
 * entrega manual de 2 Núcleos da Civilização Antiga com a mochila cheia:
 *
 * ```
 * Could not give the requested items to 'steam_765…' (IP=…): Not enough
 * inventory space to give 'AncientParts2' x2.
 * ```
 *
 * O site deu isso por entregue, mostrou o verde de sucesso e o item nunca
 * chegou — mesmo desenho de erro do "Deleted 0 pals" em `delPal()`. Este
 * "Could not …" é a recusa do próprio `giveitems`/`delitems` depois de já
 * ter achado o jogador, então reconhecer o prefixo vale para os dois.
 */
function interpretar(resposta: string): ResultadoComando {
  const limpo = resposta.trim();
  const falhou = /^(Failed|Unknown command|Could not)/i.test(limpo);
  return { ok: !falhou, resposta: limpo };
}

/**
 * Tira itens do jogador — é a custódia de verdade (§7.3).
 *
 * ⚠️ Só funciona com o jogador **online**: o comando procura o jogador antes
 * de agir. Por isso importar para o cofre é ação que a própria pessoa
 * dispara enquanto joga.
 */
export async function delItems(
  server: PalleiraServer,
  playerUid: string,
  itemId: string,
  qty: number,
): Promise<ResultadoComando> {
  const res = await rcon(
    server,
    `delitems ${uidParaComando(playerUid)} ${itemId}:${qty}`,
  );
  return interpretar(res);
}

/** Entrega itens ao jogador — o resgate do cofre e a entrega da compra. */
export async function giveItems(
  server: PalleiraServer,
  playerUid: string,
  itemId: string,
  qty: number,
): Promise<ResultadoComando> {
  const res = await rcon(
    server,
    `giveitems ${uidParaComando(playerUid)} ${itemId}:${qty}`,
  );
  return interpretar(res);
}

/* --------------------------------------------------------- pals (o cofre) */

/**
 * Tira um Pal específico do jogador — a custódia do mercado de Pals (§7.3).
 *
 * ⚠️ **Limite do `deletepals`, e não é bug nosso:** o filtro não distingue
 * Pals idênticos em espécie/nível/gênero/shiny/condensação/passivas — só o
 * IV muda entre eles, e IV não é filtrável. Com dois Pals assim, `Limit=1`
 * tira um dos dois, não necessariamente o que foi lido. O comprador recebe
 * o template que **foi lido antes de deletar**, então o valor da venda não
 * é afetado — só fica ambíguo qual cópia física saiu da conta do vendedor.
 * Detalhe completo em `lib/pal-template.ts`.
 */
export async function delPal(
  server: PalleiraServer,
  playerUid: string,
  filtro: string,
): Promise<ResultadoComando> {
  const res = await rcon(server, `deletepals ${uidParaComando(playerUid)} ${filtro}`);
  const limpo = res.trim();

  // "Deleted 0 pals…" não começa com "Failed", então `interpretar()` sozinho
  // conta como sucesso — e o Pal lido nunca saiu do jogador, virando cópia
  // no cofre em vez de mudança de dono. Sem este cheque extra, é isto que
  // acontecia em toda tentativa de guardar Pal (§ incidente de 01/09/2026).
  const zerado = /^Deleted 0 pals/i.test(limpo);
  if (zerado) return { ok: false, resposta: limpo };

  return interpretar(limpo);
}

/**
 * Entrega um Pal a partir de um arquivo já escrito no servidor.
 *
 * `givepal_j` só aceita **nome de arquivo**, não o JSON do Pal — o arquivo
 * tem que existir em `Pal/Binaries/Win64/PalDefender/Pals/Templates/` antes
 * desta chamada. Quem escreve esse arquivo é o workflow do GitHub Actions
 * (`tools/escrever_template_pal.py`), porque escrever lá é SFTP, e a Vercel
 * não fala SFTP. Este comando só roda depois que o arquivo foi confirmado.
 */
export async function givePalTemplate(
  server: PalleiraServer,
  playerUid: string,
  nomeDoArquivo: string,
): Promise<ResultadoComando> {
  const res = await rcon(
    server,
    `givepal_j ${uidParaComando(playerUid)} ${nomeDoArquivo}`,
  );
  // Resposta vazia NÃO é entrega: `givepal_j` que entrega sempre diz
  // "Granted Pal". Em 19/09/2026 o RCON do Dominantes respondia vazio a tudo,
  // a Knocklem Ignis da Handoroki (transferência 247) foi dada por entregue e
  // nunca chegou. Vazio vira "sem resposta" — quem chama deixa em
  // `arquivo_pronto` em vez de concluir (ou de falhar e arriscar duplicar).
  if (!res.trim()) throw new RconError("o jogo respondeu vazio ao givepal_j");
  return interpretar(res);
}
