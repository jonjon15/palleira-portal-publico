import { lerCanal } from "@/lib/discord";
import { chaveDeNome, lerRegistro, type RegistroDeRaca } from "@/lib/racas";

/**
 * Quem declarou qual raça, lido do fórum de registro do Discord.
 *
 * A thread `REGISTRE A SUA RAÇA E NOME DE PERSONAGEM`, dentro do fórum
 * `📌┇®registro-de-player`, é onde cada jogador do Dominantes posta nome do
 * personagem e raça antes de jogar — é exigência das regras do servidor.
 *
 * 📌 Até o wipe de 10/2026 o post só trazia raça e elementos, e a ponte
 * entre a conta do Discord e o personagem do placar era `account_links`:
 * sem vínculo no site, nada de selo. Medido em 12/09/2026: dos 29 do placar,
 * 14 tinham raça identificável, 5 nem tinham vínculo. Agora o post traz o
 * nome do personagem, e o selo sai pelo nome mesmo para quem não vinculou.
 */

/**
 * A thread do fórum de registro.
 *
 * Trocou no wipe de 10/2026: o dono apagou a antiga (`1545896731097563207`,
 * "NOME") e abriu esta, com o formato novo.
 */
const THREAD_DE_REGISTRO = "1561797559129735268";

/**
 * Quantos posts ler.
 *
 * Um post por jogador novo, e cresce devagar. 100 cobre o servidor inteiro
 * com folga e ainda é uma requisição só.
 */
const QUANTOS = 100;

export interface Registros {
  /** `discord_id` → o que a pessoa registrou. */
  porDiscord: Map<string, RegistroDeRaca>;
  /** `chaveDeNome(personagem)` → o que a pessoa registrou. */
  porPersonagem: Map<string, RegistroDeRaca>;
}

/**
 * Todos os registros do fórum.
 *
 * Quem postou duas vezes fica com o **primeiro** registro, que é o que vale:
 * as regras proíbem trocar de raça depois de registrado, então um post mais
 * novo é correção de digitação ou engano, nunca uma troca legítima.
 *
 * Nunca lança: o placar existe sem isto, e Discord fora do ar não pode
 * derrubar a página inteira por causa de um selo.
 */
export async function racasRegistradas(): Promise<Registros> {
  const porDiscord = new Map<string, RegistroDeRaca>();
  const porPersonagem = new Map<string, RegistroDeRaca>();

  let mensagens;
  try {
    mensagens = await lerCanal(THREAD_DE_REGISTRO, QUANTOS);
  } catch {
    return { porDiscord, porPersonagem };
  }

  // `lerCanal` devolve da mais nova para a mais velha; invertendo, o
  // primeiro registro de cada um é o que fica.
  for (const m of [...mensagens].reverse()) {
    if (!m.autorId) continue;
    const reg = lerRegistro(m.texto || m.textoDosEmbeds);
    if (!reg) continue;
    if (!porDiscord.has(m.autorId)) porDiscord.set(m.autorId, reg);
    const nome = reg.personagem ? chaveDeNome(reg.personagem) : "";
    if (nome && !porPersonagem.has(nome)) porPersonagem.set(nome, reg);
  }

  return { porDiscord, porPersonagem };
}

/**
 * O registro de um jogador do placar: pelo nome do personagem primeiro (é o
 * que a pessoa escreveu no post), pela conta vinculada no site depois.
 */
export function registroDe(
  regs: Registros,
  p: { name: string; discord_id?: string | null },
): RegistroDeRaca | undefined {
  return (
    regs.porPersonagem.get(chaveDeNome(p.name)) ??
    (p.discord_id ? regs.porDiscord.get(p.discord_id) : undefined)
  );
}
