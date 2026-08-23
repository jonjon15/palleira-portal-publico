/**
 * Gera `lib/pals-modelos.json` a partir dos arquivos em `public/models/pals`.
 *
 *   node tools/gerar-manifesto-pals.mjs
 *
 * O nome do arquivo já carrega tudo o que precisamos: `anubis_e1dc5e.glb` é a
 * chave `anubis` mais um hash de conteúdo. O hash é o que dá **cache eterno**
 * de graça — modelo que muda vira arquivo novo, e o navegador nunca serve o
 * antigo por engano.
 *
 * Gerar em vez de copiar um índice pronto mantém o manifesto amarrado ao que
 * está de fato na pasta: arquivo que não veio não vira link quebrado na tela.
 */

import fs from "node:fs";
import path from "node:path";

const PASTA = "public/models/pals";
const SAIDA = "lib/pals-modelos.json";

const modelos = {};
for (const arquivo of fs.readdirSync(PASTA).sort()) {
  if (!arquivo.endsWith(".glb")) continue;

  // `nome_do_pal_<hash>.glb` — o hash é sempre o último trecho, 6 hex.
  const semExtensao = arquivo.slice(0, -4);
  const corte = semExtensao.lastIndexOf("_");
  const chave = corte > 0 ? semExtensao.slice(0, corte) : semExtensao;

  modelos[chave] = {
    arquivo,
    bytes: fs.statSync(path.join(PASTA, arquivo)).size,
  };
}

fs.writeFileSync(SAIDA, JSON.stringify(modelos, null, 1) + "\n");

const total = Object.values(modelos).reduce((s, m) => s + m.bytes, 0);
console.log(
  `${Object.keys(modelos).length} modelos · ${(total / 1024 / 1024).toFixed(1)} MB · ${SAIDA}`,
);
