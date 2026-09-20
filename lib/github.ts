/**
 * Dispara workflows do GitHub Actions a partir do site (§3.8 do PROMPT.md).
 *
 * Existe porque há trabalho que **não cabe na Vercel**: editar o mundo do
 * Palworld significa descomprimir 339 MB com Oodle e reserializar. Função
 * serverless tem 1 GB de RAM, 60s e nenhum compilador C++. O runner do
 * GitHub tem 7,8 GB, gcc e 2.000 minutos grátis por mês.
 *
 * A divisão é essa, e vale para qualquer trabalho pesado que aparecer:
 *
 *     site = o botão        GitHub Actions = o motor
 *
 * ⚠️ O token daqui liga workflows. Vive só no `vercel env`, roda só em
 * Server Action, e nunca chega perto do navegador.
 */

// O repositório migrou para `-publico` em 18/09/2026 (o privado estourava a
// cota de Actions; público tem minuto de graça). O fallback ficou apontando
// para o nome antigo por quase dois dias, e o resultado é que o site
// disparava resgate no repositório errado — onde o billing continuava
// bloqueado — enquanto o novo rodava os workflows agendados normalmente.
const REPO = process.env.GITHUB_REPO ?? "jonjon15/palleira-portal-publico";
const token = () => process.env.GITHUB_TOKEN ?? "";

export class GitHubError extends Error {}

async function call(caminho: string, init: RequestInit = {}) {
  const t = token();
  if (!t) {
    throw new GitHubError(
      "GITHUB_TOKEN ausente. Sem ele o site não consegue disparar o Actions — " +
        "cadastre no vercel env um token com permissão de Actions neste repositório.",
    );
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new GitHubError(
      "O GitHub recusou o token. Confira se ele não expirou e se tem permissão de Actions (read and write).",
    );
  }
  return res;
}

/**
 * Manda o Actions rodar um workflow.
 *
 * ⚠️ A API responde **204 sem corpo** e não devolve o id da execução — ela
 * só enfileira. Para saber o que aconteceu é preciso listar as execuções
 * depois, que é o que `ultimaExecucao` faz.
 */
export async function dispararWorkflow(
  arquivo: string,
  inputs: Record<string, string>,
  ref = "master",
): Promise<void> {
  const res = await call(`/actions/workflows/${arquivo}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs }),
  });

  if (res.status !== 204 && !res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new GitHubError(
      `O GitHub respondeu ${res.status} ao disparar ${arquivo}. ${corpo.slice(0, 200)}`,
    );
  }
}

export interface Execucao {
  id: number;
  status: string;
  conclusao: string | null;
  url: string;
  criadaEm: string;
}

/** A execução mais recente de um workflow — para mostrar o andamento. */
export async function ultimaExecucao(
  arquivo: string,
): Promise<Execucao | null> {
  const res = await call(`/actions/workflows/${arquivo}/runs?per_page=1`);
  if (!res.ok) return null;

  const json = (await res.json()) as {
    workflow_runs?: {
      id: number;
      status: string;
      conclusion: string | null;
      html_url: string;
      created_at: string;
    }[];
  };

  const r = json.workflow_runs?.[0];
  return r
    ? {
        id: r.id,
        status: r.status,
        conclusao: r.conclusion,
        url: r.html_url,
        criadaEm: r.created_at,
      }
    : null;
}

export const ESTADO_LABEL: Record<string, string> = {
  queued: "Na fila",
  in_progress: "Executando",
  completed: "Terminou",
  success: "Concluído",
  failure: "Falhou",
  cancelled: "Cancelado",
};
