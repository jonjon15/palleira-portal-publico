import { lerCanal } from "@/lib/discord";
import { lerRegistro, type RegistroDeRaca } from "@/lib/racas";

/**
 * Quem declarou qual raça, lido do fórum de registro do Discord.
 *
 * A thread `NOME`, dentro do fórum `📌®registro-de-player`, é onde cada
 * jogador do Dominantes posta raça e elementos antes de jogar — é exigência
 * das regras do servidor.
 *
 * 📌 O registro é feito pela conta do **Discord**, e o placar mostra
 * **personagem do jogo**. A ponte entre os dois é `account_links`: sem
 * vínculo no site, não há como saber de quem é aquele personagem. Medido em
 * 12/09/2026: dos 29 do placar, 14 tinham raça identificável, 5 nem tinham
 * vínculo. Quem não dá para ligar aparece sem selo, e está tudo bem — é o
 * mesmo tratamento que a coluna Poder já dá a quem nunca entrou.
 */

/** A thread `NOME` do fórum de registro. */
const THREAD_DE_REGISTRO = "1545896731097563207";

/**
 * Quantos posts ler.
 *
 * A thread tem 28 e cresce devagar — um post por jogador novo. 100 cobre o
 * servidor inteiro com folga e ainda é uma requisição só.
 */
const QUANTOS = 100;

/**
 * `discord_id` → o que a pessoa registrou.
 *
 * Quem postou duas vezes fica com o **primeiro** registro, que é o que vale:
 * as regras proíbem trocar de elemento depois de registrado, então um post
 * mais novo é correção de digitação ou engano, nunca uma troca legítima.
 *
 * Nunca lança: o placar existe sem isto, e Discord fora do ar não pode
 * derrubar a página inteira por causa de um selo.
 */
export async function racasRegistradas(): Promise<Map<string, RegistroDeRaca>> {
  const porPessoa = new Map<string, RegistroDeRaca>();

  let mensagens;
  try {
    mensagens = await lerCanal(THREAD_DE_REGISTRO, QUANTOS);
  } catch {
    return porPessoa;
  }

  // `lerCanal` devolve da mais nova para a mais velha; invertendo, o
  // primeiro registro de cada um é o que fica.
  for (const m of [...mensagens].reverse()) {
    if (!m.autorId) continue;
    const reg = lerRegistro(m.texto || m.textoDosEmbeds);
    if (reg && !porPessoa.has(m.autorId)) porPessoa.set(m.autorId, reg);
  }

  return porPessoa;
}
