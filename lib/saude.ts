import { sql } from "@/lib/db";
import { activeServers, type PalleiraServer } from "@/lib/servers";
import { ping } from "@/lib/palworld/paldefender";

/**
 * O estado dos robôs e serviços que o site depende, mas não controla.
 *
 * Existe por causa de três apagões silenciosos na mesma semana (16–18/09/2026):
 * a REST do PalDefender do PVE Free caiu numa reinstalação, o GitHub Actions
 * travou por cota estourada e o import do save parou junto. Nenhum deles gera
 * erro na tela — o site continua servindo o último dado bom, que envelhece sem
 * avisar. O primeiro sintoma foi um jogador dizendo que não conseguia vincular
 * o personagem, dois dias depois.
 *
 * A pergunta que esta página responde é sempre a mesma: **faz quanto tempo que
 * isto deu sinal de vida?**
 */

export type Nivel = "ok" | "atencao" | "ruim";

export interface Sinal {
  nome: string;
  nivel: Nivel;
  detalhe: string;
  /** Quando foi visto pela última vez; ausente quando a checagem é ao vivo. */
  visto?: string;
}

/** Quanto tempo sem notícias antes de acender o alerta, por tipo de robô. */
const LIMITES = {
  // O cron é de 2 em 2h; 3h já significa uma execução perdida.
  import: { atencao: 3 * 3600, ruim: 6 * 3600 },
  // O vigia bate ponto a cada rodada (padrão 60s).
  vigia: { atencao: 10 * 60, ruim: 30 * 60 },
} as const;

function idadeEmSegundos(quando: string | Date): number {
  return (Date.now() - new Date(quando).getTime()) / 1000;
}

export function humanizar(segundos: number): string {
  if (segundos < 60) return "agora";
  const min = Math.floor(segundos / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function nivelPorIdade(
  segundos: number,
  limite: { atencao: number; ruim: number },
): Nivel {
  if (segundos >= limite.ruim) return "ruim";
  if (segundos >= limite.atencao) return "atencao";
  return "ok";
}

/** O import do save — é ele que alimenta o ranking e o perfil. */
async function sinalDoImport(): Promise<Sinal> {
  const rows = (await sql`
    select created_at, ok from imports order by created_at desc limit 1
  `) as { created_at: string; ok: boolean }[];

  const ultimo = rows[0];
  if (!ultimo) {
    return { nome: "Import do save", nivel: "ruim", detalhe: "nunca rodou" };
  }

  const idade = idadeEmSegundos(ultimo.created_at);
  const nivel = ultimo.ok ? nivelPorIdade(idade, LIMITES.import) : "ruim";
  return {
    nome: "Import do save",
    nivel,
    detalhe: ultimo.ok ? humanizar(idade) : "última execução falhou",
    visto: ultimo.created_at,
  };
}

/** Os vigias de relog, um por servidor onde algum já bateu ponto. */
async function sinaisDosVigias(): Promise<Sinal[]> {
  const rows = (await sql`
    select nome, server_slug, visto_em
    from heartbeats
    where nome like 'vigia-relog:%'
    order by nome
  `) as { nome: string; server_slug: string | null; visto_em: string }[];

  return rows.map((r) => {
    const idade = idadeEmSegundos(r.visto_em);
    return {
      nome: `Vigia de relog — ${r.server_slug ?? r.nome}`,
      nivel: nivelPorIdade(idade, LIMITES.vigia),
      detalhe: humanizar(idade),
      visto: r.visto_em,
    };
  });
}

/**
 * A REST do PalDefender de cada servidor.
 *
 * Checagem ao vivo, não heartbeat: ela ou responde agora, ou não serve. Foi a
 * que caiu em 16/09 e ninguém viu — a página /vincular ficou sem lista de
 * personagens por dois dias.
 */
async function sinaisDoPalDefender(): Promise<Sinal[]> {
  return Promise.all(
    activeServers().map(async (s: PalleiraServer) => {
      const versao = await ping(s);
      return {
        nome: `PalDefender — ${s.shortName}`,
        nivel: versao ? ("ok" as Nivel) : ("ruim" as Nivel),
        detalhe: versao ? `versão ${versao}` : "sem resposta",
      };
    }),
  );
}

export async function estadoGeral(): Promise<Sinal[]> {
  // Um serviço fora do ar não pode derrubar a página que existe justamente
  // para mostrar serviços fora do ar.
  const [imp, vigias, pd] = await Promise.all([
    sinalDoImport().catch(
      (): Sinal => ({
        nome: "Import do save",
        nivel: "ruim",
        detalhe: "não deu para consultar",
      }),
    ),
    sinaisDosVigias().catch((): Sinal[] => []),
    sinaisDoPalDefender().catch((): Sinal[] => []),
  ]);

  return [imp, ...pd, ...vigias];
}
