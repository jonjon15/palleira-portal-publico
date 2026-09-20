/**
 * Quais servidores o site deve mostrar — decidido sozinho, sem deploy.
 *
 * O problema que isto resolve: quando um servidor é desligado no painel da
 * ENX, o site continuava tentando falar com ele e mostrava bolinha vermelha
 * com "sem resposta" no topo de TODAS as páginas. A correção era editar
 * `enabled` em `lib/servers.ts` e subir deploy — manual dos dois lados, e o
 * dono ainda tinha que lembrar de desfazer quando religasse.
 *
 * Agora o próprio site percebe. Cada vez que a REST responde, o servidor
 * carimba `visto_em` em `heartbeats` (a mesma tabela da migração 023). Some da
 * vitrine quem passou de `JANELA_PARA_SUMIR` sem responder, e volta sozinho no
 * primeiro 200 — o dono liga no painel e não precisa tocar em mais nada.
 *
 * ⚠️ A janela é longa de propósito. Queda que ninguém pediu PRECISA aparecer
 * em vermelho: é o único aviso de que caiu. Some só o que está offline tempo
 * demais para ser acidente — e 30 minutos é mais do que qualquer um dos
 * restarts de 4 em 4 horas leva para voltar (ver a memória
 * `painel-enx-restart-e-sem-backup`).
 */

import { sql } from "@/lib/db";
import { activeServers, type PalleiraServer } from "@/lib/servers";
import { getMetrics, type ServerMetrics } from "@/lib/palworld/rest";

/** Offline por mais que isto = desligado de propósito, some da vitrine. */
const JANELA_PARA_SUMIR_MIN = 30;

export interface Presenca {
  server: PalleiraServer;
  metrics: ServerMetrics | null;
  /** Falso quando está offline há tempo demais — não deve aparecer na vitrine. */
  visivel: boolean;
}

/**
 * Carimba o estado atual de cada servidor.
 *
 * Quem respondeu tem `visto_em` renovado; quem não respondeu **ganha a linha
 * na primeira vez, mas nunca tem a data mexida depois**. É isso que faz
 * `visto_em` significar "a última vez que esteve vivo" — e é o `do nothing`
 * que garante que a idade de um servidor morto continue crescendo em vez de
 * reiniciar a cada visita.
 *
 * A linha do servidor morto precisa nascer em algum momento: sem ela não há
 * idade nenhuma para comparar, e ele ficaria visível para sempre — que foi
 * exatamente o furo pego no teste antes de isto ir ao ar, com o PVE VIP.
 *
 * Falha de banco não pode derrubar a home, então o erro morre aqui: no pior
 * caso o servidor demora um ciclo a mais para sumir, que é o lado seguro.
 */
async function carimbar(vivos: string[], mortos: string[]): Promise<void> {
  try {
    if (vivos.length > 0) {
      await sql`
        insert into heartbeats (nome, server_slug, visto_em)
        select 'servidor-vivo:' || s, s, now()
        from unnest(${vivos}::text[]) as s
        on conflict (nome) do update set visto_em = excluded.visto_em
      `;
    }
    if (mortos.length > 0) {
      await sql`
        insert into heartbeats (nome, server_slug, visto_em)
        select 'servidor-vivo:' || s, s, now()
        from unnest(${mortos}::text[]) as s
        on conflict (nome) do nothing
      `;
    }
  } catch {
    /* ver comentário acima: nunca derruba a página */
  }
}

/** Há quantos minutos cada servidor não responde. Ausente = nunca respondeu. */
async function ultimaVezVivo(): Promise<Map<string, number>> {
  try {
    const rows = (await sql`
      select server_slug,
             extract(epoch from (now() - visto_em)) / 60 as minutos
      from heartbeats
      where nome like 'servidor-vivo:%'
    `) as { server_slug: string; minutos: string }[];
    return new Map(rows.map((r) => [r.server_slug, Number(r.minutos)]));
  } catch {
    return new Map();
  }
}

/**
 * O estado de cada servidor + se deve aparecer.
 *
 * `getMetrics` cacheia por 60s por URL, então chamar isto em vários lugares da
 * mesma página não soma requisição nenhuma.
 */
export async function presencaDosServidores(): Promise<Presenca[]> {
  const [status, idades] = await Promise.all([
    Promise.all(
      activeServers().map(async (server) => ({
        server,
        metrics: await getMetrics(server).catch(() => null),
      })),
    ),
    ultimaVezVivo(),
  ]);

  await carimbar(
    status.filter((s) => s.metrics !== null).map((s) => s.server.slug),
    status.filter((s) => s.metrics === null).map((s) => s.server.slug),
  );

  return status.map(({ server, metrics }) => {
    if (metrics) return { server, metrics, visivel: true };

    // Sem idade nenhuma = a linha acabou de nascer neste render: ainda
    // aparece, em vermelho, e some no ciclo que cruzar a janela.
    const min = idades.get(server.slug) ?? 0;
    return { server, metrics, visivel: min <= JANELA_PARA_SUMIR_MIN };
  });
}

/** Só os que devem aparecer na vitrine — o que a maioria das telas quer. */
export async function servidoresVisiveis(): Promise<Presenca[]> {
  return (await presencaDosServidores()).filter((p) => p.visivel);
}
