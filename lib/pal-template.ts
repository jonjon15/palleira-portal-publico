import type { PalCru } from "@/lib/palworld/paldefender";

/**
 * O `PalCru` que a API devolve, convertido para o arquivo que
 * `givepal_j`/`give/paltemplate` sabem ler — e o filtro que tira aquele Pal
 * exato do vendedor por `deletepals`.
 *
 * Módulo puro: nada de banco, nada de rede. É só transformação de dado, para
 * poder ser testado sem servidor nenhum de pé.
 */

/**
 * Os campos do formato `PalTemplate.json`, documentados em
 * ultimeit.github.io/PalDefender/FileTypes/PalTemplate/ (lido em
 * 23/08/2026). **Allowlist explícito, e não o objeto cru repassado**: a API
 * devolve campos que não fazem parte do template (`ImportedCharacter`,
 * `WorkerSick`, `team_slot_index`…) — mandar isso no arquivo é chute sobre o
 * que o parser do PalDefender aceita. Só o que a doc lista entra aqui.
 */
export interface PalTemplate {
  PalID: string;
  Nickname: string;
  Gender: string;
  Level: number;
  SkinId: string;
  Shiny: boolean;
  Exp: number;
  PartnerSkillLevel: number;
  FriendshipPoints: number;
  HP: number;
  SP: number;
  SAN: number;
  Support: number;
  CraftSpeed: number;
  PalSouls: Record<string, number>;
  IVs: Record<string, number>;
  ActiveSkills: string[];
  LearntSkills: string[];
  Passives: string[];
  CondensedPals: number;
  ExtraWorkSuitabilities: Record<string, number>;
  DisableWorkPreferences: string[];
}

const num = (v: unknown, padrao = 0) => (typeof v === "number" ? v : padrao);
const str = (v: unknown, padrao = "") => (typeof v === "string" ? v : padrao);
const bool = (v: unknown) => v === true;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const obj = (v: unknown): Record<string, number> =>
  v && typeof v === "object" ? (v as Record<string, number>) : {};

/**
 * Monta o template a partir do que a API devolveu.
 *
 * Nada de `Math.min`/validação de faixa aqui: os valores já vieram do
 * próprio jogo, e reescrevê-los é justamente para reproduzir o Pal como
 * estava — mexer no meio do caminho seria o site inventando dado.
 */
export function paraTemplate(pal: PalCru): PalTemplate {
  return {
    PalID: str(pal.PalID),
    Nickname: str(pal.Nickname),
    Gender: str(pal.Gender, "Male"),
    Level: num(pal.Level, 1) || 1,
    SkinId: str(pal.SkinId),
    Shiny: bool(pal.Shiny),
    Exp: num(pal.Exp),
    PartnerSkillLevel: Math.max(1, num(pal.PartnerSkillLevel, 1)),
    FriendshipPoints: num(pal.FriendshipPoints),
    HP: num(pal.HP),
    SP: num(pal.SP),
    SAN: num(pal.SAN, 100),
    Support: num(pal.Support),
    CraftSpeed: num(pal.CraftSpeed),
    PalSouls: obj(pal.PalSouls),
    IVs: obj(pal.IVs),
    ActiveSkills: arr(pal.ActiveSkills),
    LearntSkills: arr(pal.LearntSkills),
    Passives: arr(pal.Passives),
    CondensedPals: num(pal.CondensedPals),
    ExtraWorkSuitabilities: obj(pal.ExtraWorkSuitabilities),
    DisableWorkPreferences: arr(pal.DisableWorkPreferences),
  };
}

/**
 * O filtro do `deletepals` que melhor isola este Pal exato entre os outros
 * do jogador.
 *
 * 🔴 **Limite conhecido, e vale registrar em letras grandes:** a sintaxe do
 * `deletepals` filtra por `ID`, `Nick`, `Gender`, `Level`, `Rank` (=
 * `CondensedPals`), `Lucky` (= `Shiny`) e `Passives` — **não existe filtro
 * por IV, nem por identidade única do Pal**. Se o jogador tiver **dois** Pals
 * idênticos em todos esses campos (mesma espécie, nível, gênero, shiny,
 * condensação e passivas, mas IVs diferentes — dois `Anubis` nível 20
 * comuns, por exemplo), o `Limit=1` remove **um dos dois**, e não há como
 * garantir que seja o mesmo cujo template foi lido.
 *
 * Isso não quebra a venda: o comprador recebe exatamente o template que foi
 * mostrado no anúncio, porque a entrega usa o template salvo, não uma nova
 * leitura do vendedor. O que fica ambíguo é só **qual das duas cópias**
 * saiu da conta do vendedor — irrelevante para o valor econômico, mas vale
 * o registro para quando alguém perguntar "por que sumiu o outro, não este".
 */
export function filtroDeExclusao(pal: PalCru): string {
  const partes = [
    `ID ${str(pal.PalID)}`,
    `Level=${num(pal.Level, 1)}`,
    `Gender ${str(pal.Gender, "Male").toLowerCase()}`,
    `Lucky ${bool(pal.Shiny)}`,
    `Rank=${num(pal.CondensedPals)}`,
  ];

  const apelido = str(pal.Nickname).trim();
  if (apelido) partes.push(`Nick ${apelido}`);

  const passivas = arr(pal.Passives);
  if (passivas.length) partes.push(`Passives ${passivas.join(",")}`);

  partes.push("Limit 1");
  return partes.join(" ");
}

/**
 * Um nome de arquivo estável e sem espaço, para o servidor do jogo.
 *
 * O id da transferência entra no nome de propósito: cada entrega escreve o
 * seu, nunca reaproveita um arquivo de uma entrega anterior.
 */
export const nomeDoArquivo = (transferenciaId: number) =>
  `palleira_${transferenciaId}`;
