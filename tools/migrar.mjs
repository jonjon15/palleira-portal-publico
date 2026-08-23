/**
 * Aplica um arquivo de migração no Neon.
 *
 *   node tools/migrar.mjs db/migrations/002-cofre-e-mercado.sql
 *
 * Existe porque a ordem "migração primeiro, deploy depois" é regra do
 * projeto (§11.2 do PROMPT.md): código novo com banco velho falha em
 * silêncio, e silêncio é o pior jeito de descobrir que algo quebrou.
 *
 * O driver HTTP do Neon aceita **uma instrução por requisição**, então o
 * arquivo é fatiado aqui e mandado dentro de uma transação só — ou entra
 * tudo, ou não entra nada.
 *
 * A URL sai de `DATABASE_URL`; sem ela no ambiente, lê o `.env.local`.
 */

import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("uso: node tools/migrar.mjs <arquivo.sql>");
  process.exit(1);
}

function urlDoBanco() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(".env.local", "utf8");
  const achado = env.match(/^DATABASE_URL=(.*)$/m);
  if (!achado) throw new Error("DATABASE_URL não encontrada");
  return achado[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Fatia o arquivo em instruções.
 *
 * O `;` dentro de um bloco `$$ … $$` não termina instrução nenhuma — é isso
 * que um split ingênuo erra, e é como uma migração com `do $$` chega
 * cortada ao meio no banco. `begin`/`commit` saem fora: quem cuida da
 * transação é o `transaction()` do driver.
 */
function fatiar(sql) {
  const instrucoes = [];
  let atual = "";
  let emBloco = false;

  for (const linha of sql.split(/\r?\n/)) {
    const semComentario = linha.replace(/--.*$/, "");
    if (semComentario.includes("$$")) {
      // Um `$$` na linha abre ou fecha; dois abrem e fecham na mesma linha.
      const marcas = (semComentario.match(/\$\$/g) ?? []).length;
      if (marcas % 2 === 1) emBloco = !emBloco;
    }
    atual += linha + "\n";
    if (!emBloco && /;\s*$/.test(semComentario)) {
      instrucoes.push(atual.trim());
      atual = "";
    }
  }
  if (atual.trim()) instrucoes.push(atual.trim());

  return instrucoes.filter((i) => {
    const nu = i.replace(/--.*$/gm, "").trim().replace(/;$/, "").toLowerCase();
    return nu && nu !== "begin" && nu !== "commit";
  });
}

const conteudo = fs.readFileSync(arquivo, "utf8");
const instrucoes = fatiar(conteudo);
const sql = neon(urlDoBanco());

console.log(`${arquivo}: ${instrucoes.length} instruções`);
try {
  await sql.transaction(instrucoes.map((i) => sql.query(i)));
  console.log("✅ aplicada");
} catch (e) {
  console.error("🔴 falhou, nada foi aplicado:", e.message);
  process.exit(1);
}
