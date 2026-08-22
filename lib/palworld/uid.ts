/**
 * O identificador do personagem — e as duas caras que ele tem.
 *
 * A mesma pessoa chega em dois formatos, dependendo de quem responde:
 *
 * ```
 *   PalDefender      AA7C26DC-00000000-00000000-00000000   com hífen
 *   save / import    AA7C26DC000000000000000000000000       sem hífen
 * ```
 *
 * Enquanto as duas formas circulam soltas, **nada que cruze as duas fontes
 * encontra ninguém**: o vínculo vem da API e o placar vem do save, então o
 * perfil de quem vinculou aparece vazio sem erro nenhum na tela.
 *
 * 🔴 **Regra do projeto: dentro do site o UID vive SEMPRE no formato
 * canônico** — hex maiúsculo, sem hífen, que é o que a tabela `players`
 * guarda. A volta para o formato com hífen acontece só na borda do RCON,
 * em `uidParaComando`.
 *
 * 📌 **O UID é da conta, não do mundo.** Medido em 22/08/2026 comparando os
 * dois PVE: DEMON é `058C8A05…` nos três servidores, e o dono é `AA7C26DC…`
 * tanto como `jonjon7D` no VIP quanto como `ADM_JONJON` no Free. Por isso o
 * vínculo do §4.2 vale na comunidade inteira, e não por servidor.
 */

/** Hex maiúsculo sem hífen — a forma que vale dentro do site. */
export function normalizarUid(valor: string | null | undefined): string {
  return (valor ?? "").replace(/-/g, "").toUpperCase();
}

/**
 * O formato 8-8-8-8 que os comandos do PalDefender esperam.
 *
 * Comprovado com o `send msg` do vínculo. Formato inesperado passa reto em
 * vez de virar um UID inventado: melhor o comando falhar dizendo que não
 * achou o jogador do que acertar outra pessoa.
 */
export function uidParaComando(uid: string): string {
  const limpo = normalizarUid(uid);
  if (limpo.length !== 32) return limpo;
  return [
    limpo.slice(0, 8),
    limpo.slice(8, 16),
    limpo.slice(16, 24),
    limpo.slice(24),
  ].join("-");
}
