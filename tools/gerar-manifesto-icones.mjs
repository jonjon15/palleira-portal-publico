/**
 * Gera `lib/pals-icones.json` a partir de `public/icons/pals`.
 *
 *   node tools/gerar-manifesto-icones.mjs
 *
 * Mesma lógica do `gerar-manifesto-pals.mjs`: o manifesto nasce do que
 * está de fato na pasta, para nunca virar link quebrado. Os ícones foram
 * filtrados na cópia para só entrar quem bate com uma chave real de Pal do
 * manifesto 3D — não tem ícone de interface (`attack`, `capture`…) aqui.
 */

import fs from "node:fs";
import path from "node:path";

const PASTA = "public/icons/pals";
const SAIDA = "lib/pals-icones.json";

const icones = {};
for (const arquivo of fs.readdirSync(PASTA).sort()) {
  if (!arquivo.endsWith(".webp")) continue;
  const chave = arquivo.slice(0, -".webp".length);
  icones[chave] = {
    arquivo,
    bytes: fs.statSync(path.join(PASTA, arquivo)).size,
  };
}

fs.writeFileSync(SAIDA, JSON.stringify(icones, null, 1) + "\n");

const total = Object.values(icones).reduce((s, m) => s + m.bytes, 0);
console.log(
  `${Object.keys(icones).length} ícones · ${(total / 1024).toFixed(0)} KB · ${SAIDA}`,
);
