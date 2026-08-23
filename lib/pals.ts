import MODELOS from "@/lib/pals-modelos.json";
import ICONES from "@/lib/pals-icones.json";

/**
 * Os Pals na tela: qual modelo 3D usar e como chamá-los (§7.4 do PROMPT.md).
 *
 * Módulo puro, sem banco e sem sessão — o visualizador roda no navegador e
 * precisa importar daqui.
 *
 * 📌 **Sobre os modelos.** São 324 malhas em glTF 2.0, ~105 KB cada, sem
 * animação nem esqueleto. Medido contra os dois PVE em 23/08/2026: dos 1.536
 * personagens vivos no mundo, **todos os Pals têm modelo** — as 32 exceções
 * são NPC humano (`NPC_SalesPerson`, `NPC_Male_Trader01`), que não é Pal.
 * As variantes com skin têm malha própria: `Anubis_Skin001` não cai no
 * Anubis comum.
 *
 * ⚠️ A arte é da **Pocketpair**, como todo asset de Palworld. O portal serve
 * do próprio domínio, nunca de CDN de terceiro, e mantém o rodapé de projeto
 * de fã (§14.4).
 */

interface Asset {
  arquivo: string;
  bytes: number;
}

const MODELO_DE = MODELOS as Record<string, Asset>;
const ICONE_DE = ICONES as Record<string, Asset>;

/** Onde cada tipo de arquivo é servido. Hash no nome = cache eterno. */
const BASE_MODELO = "/models/pals";
const BASE_ICONE = "/icons/pals";

/**
 * Marcadores de **contexto de spawn**, não de espécie.
 *
 * O jogo prefixa o mesmo bicho conforme onde ele aparece: `BOSS_Anubis` é o
 * Alpha do Anubis, `RAID_` vem de incursão, `GYM_` de ginásio. A malha é a
 * mesma — só o tamanho e os atributos mudam. Qualquer outra coisa na frente
 * do nome faz parte da espécie e não pode ser tocada.
 */
const CONTEXTOS = ["boss_", "predator_", "summon_", "raid_", "gym_"];

/**
 * Do `PalID` que a API devolve até a chave que existe no catálogo — genérico
 * para servir tanto o modelo 3D quanto o ícone 2D, que usam a mesma
 * nomenclatura de espécie.
 *
 * Os dois vocabulários não batem: a API fala `BOSS_KingWhale_Otomo`, e o
 * catálogo guarda espécies. A busca vai do mais específico para o mais
 * genérico e **para no primeiro acerto** — assim `ghostdragon_fire`, que tem
 * asset próprio, não é rebaixado para `ghostdragon`, mas uma recolorização
 * sem asset próprio (uma skin, por exemplo) ainda encontra o do bicho base.
 * É a mesma troca que o jogo faz: a forma certa, na paleta base.
 */
function resolverChave(palId: string, tem: (chave: string) => boolean): string | null {
  const chave = (palId ?? "").toLowerCase();
  if (!chave) return null;

  // Antes de tudo: uma espécie cujo nome começa com um desses prefixos tem
  // que ser achada como ela mesma, não confundida com variante de outra.
  if (tem(chave)) return chave;

  const contexto = CONTEXTOS.find(
    (c) => chave.startsWith(c) && chave.length > c.length,
  );
  let candidato = contexto ? chave.slice(contexto.length) : chave;

  // Encurta pelo `_`, sufixo a sufixo. Só o resto é encurtado, nunca a forma
  // com prefixo: senão "boss" e "raid" virariam candidatos, e todo Pal sem
  // asset colidiria neles.
  while (candidato) {
    if (tem(candidato)) return candidato;
    const corte = candidato.lastIndexOf("_");
    if (corte < 0) return null;
    candidato = candidato.slice(0, corte);
  }
  return null;
}

export const modeloDoPal = (palId: string) =>
  resolverChave(palId, (c) => c in MODELO_DE);

/** A URL do `.glb`, ou `null` quando não existe malha para aquele Pal. */
export function urlDoModelo(palId: string): string | null {
  const chave = modeloDoPal(palId);
  return chave ? `${BASE_MODELO}/${MODELO_DE[chave].arquivo}` : null;
}

/** Quanto o navegador vai baixar — para avisar antes em conexão ruim. */
export function pesoDoModelo(palId: string): number {
  const chave = modeloDoPal(palId);
  return chave ? MODELO_DE[chave].bytes : 0;
}

/**
 * O ícone 2D — leve (~8 KB), para lista e card, onde renderizar um Pal
 * inteiro em 3D por linha derrubaria a página (WebGL tem limite de
 * contextos simultâneos no navegador; uma lista de 200 Pals estouraria
 * fácil). O 3D fica para a ficha de um Pal só.
 *
 * 296 dos 324 têm ícone com a chave exata; o resto cai no mesmo algoritmo
 * de fallback do modelo — uma skin sem ícone próprio mostra o ícone da
 * espécie base.
 */
export function urlDoIcone(palId: string): string | null {
  const chave = resolverChave(palId, (c) => c in ICONE_DE);
  return chave ? `${BASE_ICONE}/${ICONE_DE[chave].arquivo}` : null;
}

/* ------------------------------------------------------------------- nomes */

/**
 * O nome do Pal na tela.
 *
 * ⚠️ Hoje devolve o `PalID` cru, e isso é proposital: os nomes internos não
 * são os nomes de exibição (`HadesBird`, `GrassMammoth`), e chutar a tradução
 * poria nome errado na ficha de um bicho que vale Paletas. A mesma regra dos
 * itens vale aqui: **chave sem tradução mostra a chave**, nunca um palpite.
 *
 * O catálogo de verdade entra depois, semeado de dataset com licença (§7.4);
 * quando entrar, só esta função muda.
 */
export function nomeDoPal(palId: string): string {
  return (palId ?? "").replace(/^(BOSS|PREDATOR|SUMMON|RAID|GYM)_/i, "");
}

/** O prefixo `BOSS_` é como o jogo marca Alpha — vale destaque na ficha. */
export const ehAlpha = (palId: string) => /^BOSS_/i.test(palId ?? "");

export const ehPredador = (palId: string) => /^PREDATOR_/i.test(palId ?? "");

/* -------------------------------------------------------------- atributos */

/** Os quatro IVs, na ordem em que a comunidade lê a ficha. */
export const IVS = [
  { chave: "Health", rotulo: "Vida" },
  { chave: "AttackMelee", rotulo: "Ataque corpo a corpo" },
  { chave: "AttackShot", rotulo: "Ataque à distância" },
  { chave: "Defense", rotulo: "Defesa" },
] as const;

/**
 * Almas são um eixo **separado** dos IVs.
 *
 * Um Pal com alma investida vale bem mais que um com IV alto e alma zerada,
 * e a §14.3 registra que confundir os dois foi um erro do modelo antigo.
 */
export const ALMAS = [
  { chave: "Health", rotulo: "Vida" },
  { chave: "Attack", rotulo: "Ataque" },
  { chave: "Defense", rotulo: "Defesa" },
  { chave: "CraftSpeed", rotulo: "Trabalho" },
] as const;

/** IV vai de 0 a 100 no jogo — a barra da ficha precisa de um teto honesto. */
export const IV_MAXIMO = 100;

/** Alma investida vai até 20 por eixo. */
export const ALMA_MAXIMA = 20;
