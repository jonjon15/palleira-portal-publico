import { sql } from "@/lib/db";
import {
  lerCanal,
  renovarImagens,
  urlDeAnexoValida,
  type MensagemDiscord,
} from "@/lib/discord";

/**
 * O mural do site se abastecendo sozinho do canal de eventos do Discord
 * (pedido do dono em 12/09/2026).
 *
 * O dono já escrevia o evento uma vez no Discord e teria que escrever de
 * novo no admin. Isto lê o canal e publica no mural — a fonte da verdade
 * continua sendo o Discord.
 *
 * ```
 * 📣┇eventos-pve ──@everyone──▶ events (publicado) ──▶ mural do site
 * ```
 */

/** `📣┇eventos-pve`. Um canal só, por decisão do dono. */
export const CANAL_DE_EVENTOS = "1465099185882661062";

/**
 * Quantas mensagens olhar para trás a cada passada.
 *
 * O canal recebe poucos posts por semana, então 25 cobre com folga o que
 * apareceu entre duas execuções. Não é o histórico inteiro de propósito: a
 * primeira execução não deve despejar três meses de evento velho no mural.
 */
const QUANTAS_OLHAR = 25;

/**
 * O que separa evento de conversa.
 *
 * 🔴 O canal tem as duas coisas misturadas — medido no próprio canal em
 * 12/09/2026: de 10 mensagens, 7 eram evento e 3 eram conversa ou imagem
 * solta (inclusive um "o povo ta animado eim slc k" do próprio dono).
 * Publicar tudo encheria o mural de ruído.
 *
 * O `@everyone` é o corte, escolhido pelo dono: ele já marca todo mundo
 * quando anuncia evento de verdade, e nunca numa conversa. Nos exemplos
 * reais acertou os 3 eventos e descartou os 3 ruídos, sem exceção.
 */
const ehEvento = (m: MensagemDiscord) =>
  m.chamouTodos && Boolean(tituloDe(m) || m.imagemUrl);

/**
 * O título, tirado da primeira linha que valha a pena.
 *
 * O dono escreve em Markdown do Discord, quase sempre começando com `#` ou
 * `##` e com negrito no meio. Aqui isso vira texto limpo: o cartaz do mural
 * tem estilo próprio e não renderiza Markdown.
 */
function tituloDe(m: MensagemDiscord): string {
  const linhas = (m.texto || m.textoDosEmbeds)
    .split("\n")
    .map((l) => limpar(l))
    .filter(Boolean);

  const primeira = linhas[0] ?? "";
  // Título longo demais estoura o cartaz; corta na palavra, não na letra.
  if (primeira.length <= 70) return primeira;
  return primeira.slice(0, 67).replace(/\s+\S*$/, "") + "…";
}

/** Tira marcação do Discord: cabeçalho, negrito, itálico, menção, emoji custom. */
function limpar(linha: string): string {
  return linha
    .replace(/^#{1,3}\s*/, "") // # ## ###
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **negrito**
    .replace(/\*([^*]+)\*/g, "$1") // *itálico*
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/@(everyone|here)\b/g, "")
    .replace(/<@!?\d+>/g, "") // menção a pessoa
    .replace(/<#\d+>/g, "") // menção a canal
    .replace(/<a?:(\w+):\d+>/g, "") // emoji custom
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O corpo: tudo menos a linha que virou título.
 *
 * Mantém as quebras de linha, que é o que dá ritmo ao anúncio, mas some com
 * a marcação — o mural formata do jeito dele.
 */
function corpoDe(m: MensagemDiscord, titulo: string): string {
  const linhas = (m.texto || m.textoDosEmbeds).split("\n").map(limpar);

  const primeiraUtil = linhas.findIndex((l) => l);
  const resto = linhas.slice(primeiraUtil + 1);

  // Título cortado com "…" não bate com a linha original; nesse caso o texto
  // inteiro vale como corpo, senão o começo do anúncio se perde.
  const cortado = titulo.endsWith("…");
  const corpo = (cortado ? linhas.slice(primeiraUtil) : resto)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return corpo;
}

/** Emoji do começo do título, para o cartaz não ficar sem cara nenhuma. */
function emojiDe(texto: string): string {
  const m = /^(\p{Extended_Pictographic})/u.exec(texto.trim());
  return m ? m[1] : "";
}

/** "16 de agosto" — para o cartaz que só tem imagem ter um nome próprio. */
function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * Renova o link das imagens que estão para vencer.
 *
 * 🔴 A URL do CDN do Discord expira em ~24h. Sem isto, o cartaz do evento
 * aparece no mural no dia do anúncio e vira imagem quebrada no dia seguinte
 * — e ninguém repara até alguém abrir a página e reclamar.
 *
 * Roda junto da sincronização, que já é a hora em que se fala com o Discord.
 * Só mexe no que está perto de vencer: link bom não é renovado à toa.
 */
async function renovarCartazesVencendo(): Promise<number> {
  const linhas = (await sql`
    select id, cover_image_url
    from events
    where cover_image_url is not null
      and status <> 'arquivado'
  `) as { id: string; cover_image_url: string }[];

  const vencendo = linhas.filter((l) => !urlDeAnexoValida(l.cover_image_url));
  if (vencendo.length === 0) return 0;

  const novas = await renovarImagens(vencendo.map((l) => l.cover_image_url));
  let trocadas = 0;

  for (const l of vencendo) {
    const nova = novas.get(l.cover_image_url);
    if (!nova || nova === l.cover_image_url) continue;
    await sql`
      update events set cover_image_url = ${nova}, updated_at = now()
      where id = ${l.id}
    `;
    trocadas++;
  }

  return trocadas;
}

/**
 * Quanto tempo depois do anúncio o cartaz ainda conta como sendo dele.
 *
 * 🔴 O dono posta o texto e a imagem em mensagens SEPARADAS. Medido no
 * canal em 12/09/2026: a Corrida saiu 19:42 e o cartaz 19:55; a Troca dos
 * Pals, 20:12 e 20:27. Sem juntar as duas, o evento entra no mural sem
 * imagem — foi o que aconteceu com a Corrida.
 *
 * Vinte minutos cobre os dois casos com folga e não é tempo suficiente para
 * capturar a imagem de um assunto diferente.
 */
const JANELA_DO_CARTAZ_MS = 20 * 60_000;

/**
 * A imagem do anúncio: a da própria mensagem, ou a do cartaz que veio
 * logo depois.
 *
 * Só aceita a seguinte quando ela é do mesmo autor, não tem texto (é
 * cartaz, não outro assunto) e não é ela mesma um anúncio com `@everyone`.
 */
function imagemDoAnuncio(
  m: MensagemDiscord,
  todas: MensagemDiscord[],
): string | null {
  if (m.imagemUrl) return m.imagemUrl;

  const quando = new Date(m.em).getTime();

  for (const outra of todas) {
    if (outra.id === m.id || !outra.imagemUrl) continue;
    if (outra.autorId !== m.autorId) continue;
    if (outra.chamouTodos) continue; // é outro anúncio, não o cartaz deste
    if (outra.texto.trim() || outra.textoDosEmbeds.trim()) continue;

    const diferenca = new Date(outra.em).getTime() - quando;
    if (diferenca > 0 && diferenca <= JANELA_DO_CARTAZ_MS) return outra.imagemUrl;
  }

  return null;
}

export interface ResultadoDaSincronia {
  criados: number;
  jaExistiam: number;
  ignorados: number;
  titulos: string[];
  /** Cartazes cujo link do Discord foi renovado antes de vencer. */
  imagensRenovadas: number;
  erro?: string;
}

/**
 * Lê o canal e publica no mural o que ainda não está lá.
 *
 * Idempotente pelo `discord_message_id`: a mesma mensagem nunca vira dois
 * eventos, nem que rode dez vezes seguidas (a migração 016 tem um índice
 * único que garante isso até se duas execuções se cruzarem).
 *
 * ⚠️ Não atualiza evento que já existe. Mensagem editada no Discord depois
 * de virar evento continua com o texto antigo no site — mudar isso exigiria
 * decidir o que fazer quando alguém edita o evento no admin, e é decisão do
 * dono, não minha.
 */
export async function sincronizarEventosDoDiscord(): Promise<ResultadoDaSincronia> {
  const imagensRenovadas = await renovarCartazesVencendo().catch(() => 0);

  let mensagens: MensagemDiscord[];
  try {
    mensagens = await lerCanal(CANAL_DE_EVENTOS, QUANTAS_OLHAR);
  } catch (e) {
    return {
      criados: 0,
      jaExistiam: 0,
      ignorados: 0,
      titulos: [],
      imagensRenovadas,
      erro: e instanceof Error ? e.message : String(e),
    };
  }

  const candidatas = mensagens.filter(ehEvento);
  const ignorados = mensagens.length - candidatas.length;

  if (candidatas.length === 0) {
    return { criados: 0, jaExistiam: 0, ignorados, titulos: [], imagensRenovadas };
  }

  const jaNoBanco = new Set(
    (
      (await sql`
        select discord_message_id
        from events
        where discord_message_id = any(${candidatas.map((m) => m.id)})
      `) as { discord_message_id: string }[]
    ).map((r) => r.discord_message_id),
  );

  const criados: string[] = [];

  // Da mais velha para a mais nova: no mural, a ordem de chegada é a mesma
  // do Discord.
  for (const m of [...candidatas].reverse()) {
    if (jaNoBanco.has(m.id)) continue;

    // Sete dos treze posts do canal são só `@everyone` + cartaz, sem uma
    // letra de texto (medido em 12/09/2026). Sem isto, todos entrariam no
    // mural com o mesmo título genérico e ninguém distinguiria um do outro.
    const titulo = tituloDe(m) || `Evento de ${dataCurta(m.em)}`;
    const imagem = imagemDoAnuncio(m, mensagens);
    const corpo = corpoDe(m, titulo);
    const emoji = emojiDe(titulo) || "📣";
    const slug = await slugUnico(slugify(titulo));

    // O anúncio novo assume o destaque da home (decisão do dono em
    // 12/09/2026). Sem isto, um evento fixado meses atrás continua na frente
    // do que acabou de ser anunciado: foi o que aconteceu com a Corrida, que
    // chegou ao mural mas ficou atrás do cartaz do Dominates.
    //
    // Só existe um destaque de cada vez, mesma regra do `criarEvento`.
    await sql`update events set pinned = false where pinned = true`;

    // `on conflict do nothing` no id da mensagem: se outra execução criou
    // este mesmo evento no meio do caminho, esta some sem reclamar.
    const gravado = (await sql`
      insert into events (
        title, slug, body, cover_emoji, cover_image_url,
        status, pinned, created_by, created_by_name, discord_message_id, created_at
      ) values (
        ${titulo}, ${slug}, ${corpo}, ${emoji}, ${imagem},
        'publicado', true, ${m.autorId}, ${m.autorNome}, ${m.id}, ${m.em}
      )
      on conflict (discord_message_id) where discord_message_id is not null
      do nothing
      returning id
    `) as { id: string }[];

    if (gravado.length) criados.push(titulo);
  }

  return {
    criados: criados.length,
    jaExistiam: candidatas.length - criados.length,
    ignorados,
    titulos: criados,
    imagensRenovadas,
  };
}

/* ------------------------------------------------------------------ slug */

/** Mesma regra do `lib/eventos.ts` — repetida aqui para não exportar de lá. */
function slugify(titulo: string): string {
  return (
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "evento"
  );
}

async function slugUnico(base: string): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const tentativa = n === 0 ? base : `${base}-${n + 1}`;
    const existe = (await sql`
      select 1 from events where slug = ${tentativa}
    `) as unknown[];
    if (!existe.length) return tentativa;
  }
  return `${base}-${Date.now()}`;
}
