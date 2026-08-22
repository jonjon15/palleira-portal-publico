import { lerCanal, pareceSemConteudo, type MensagemDiscord } from "@/lib/discord";
import { acharSaldo, acharNome, ehTextoDeSaldo } from "@/lib/palbot-parse";

/**
 * Ler os saldos direto das respostas do Palbot no Discord (§7.1).
 *
 * O Palbot hospedado não tem API nem comando de exportar. Mas ele **responde
 * em público**: `/balance` devolve "Fulano, you have 26 Paletas." num embed.
 *
 * O pulo do gato é o `interaction_metadata` da mensagem: o Discord carimba
 * ali **quem digitou o comando**, com ID e tudo. Então quando a própria
 * pessoa roda `/balance`, o par (ID, saldo) vem certo da fonte — sem
 * ninguém transcrever nome nenhum, sem erro de digitação, sem ambiguidade
 * entre dois apelidos parecidos.
 *
 * `/checkpoints @fulano` é o plano B: o ID carimbado é o do **admin** que
 * digitou, não o da pessoa consultada, então ali o nome tem que sair do
 * texto e ser resolvido depois.
 */

export interface SaldoLido {
  discordId: string;
  nome: string;
  saldo: number;
  /** De onde saiu: a pessoa mesma rodou, ou um admin consultou */
  via: "balance" | "checkpoints";
  em: string;
}

export interface LeituraDoCanal {
  saldos: SaldoLido[];
  /** Consultas de admin que não deu para casar com uma pessoa */
  nomesSoltos: { nome: string; saldo: number; em: string }[];
  mensagensLidas: number;
  semConteudo: boolean;
  quemRespondeu: string[];
}

/** Uma mensagem é uma resposta de saldo do Palbot? */
function ehRespostaDeSaldo(m: MensagemDiscord) {
  if (!m.autorEhBot) return false;
  const comando = (m.comandoNome ?? "").toLowerCase();
  return comando === "balance" || comando === "checkpoints";
}

/**
 * Varre o canal e devolve os saldos encontrados.
 *
 * Quando a mesma pessoa aparece mais de uma vez, vale **a leitura mais
 * recente** — as mensagens chegam da mais nova para a mais velha, então
 * basta ignorar as repetições seguintes.
 */
export async function lerSaldosDoCanal(
  canalId: string,
  quantas = 500,
): Promise<LeituraDoCanal> {
  const mensagens = await lerCanal(canalId, quantas);

  const saldos: SaldoLido[] = [];
  const nomesSoltos: LeituraDoCanal["nomesSoltos"] = [];
  const jaVistos = new Set<string>();
  const nomesVistos = new Set<string>();
  const respondentes = new Set<string>();

  for (const m of mensagens) {
    if (!ehRespostaDeSaldo(m)) continue;

    const texto = `${m.textoDosEmbeds}\n${m.texto}`;
    // O /daily também diz "2 Paletas". Migrar aquilo como saldo zeraria
    // a carteira de quase todo mundo.
    if (!ehTextoDeSaldo(texto)) continue;

    const saldo = acharSaldo(texto);
    if (saldo === null) continue;

    respondentes.add(m.autorNome);
    const comando = (m.comandoNome ?? "").toLowerCase();

    if (comando === "balance" && m.comandoDe) {
      // A pessoa consultou o próprio saldo: o ID vem carimbado pelo Discord.
      if (jaVistos.has(m.comandoDe.id)) continue;
      jaVistos.add(m.comandoDe.id);
      saldos.push({
        discordId: m.comandoDe.id,
        nome: m.comandoDe.displayName,
        saldo,
        via: "balance",
        em: m.em,
      });
      continue;
    }

    // /checkpoints: o carimbo é do admin, então o nome sai do texto.
    const nome = acharNome(texto);
    if (!nome || nomesVistos.has(nome.toLowerCase())) continue;
    nomesVistos.add(nome.toLowerCase());
    nomesSoltos.push({ nome, saldo, em: m.em });
  }

  return {
    saldos,
    nomesSoltos,
    mensagensLidas: mensagens.length,
    semConteudo: pareceSemConteudo(mensagens),
    quemRespondeu: [...respondentes],
  };
}
