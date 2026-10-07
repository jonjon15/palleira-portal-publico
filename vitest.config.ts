import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Testes das regras puras (sem banco, sem servidor do jogo). Rodam antes de
 * todo build da Vercel (`npm run build`): teste quebrado = deploy não sobe.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/**/*.test.ts"] },
});
