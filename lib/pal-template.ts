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
 *
 * ⚠️ **`IsAwakening` (o Despertar) fica de fora igual a `Rank`, e por
 * motivo parecido — mas pior: aqui é confirmado, não hipótese.** Testado ao
 * vivo em 21/09/2026: um Anubis foi entregue com `IsAwakening: true` no
 * JSON, e chegou com `IsAwakening: false` — o campo aparece na LEITURA
 * (`PalCru`, o que a API devolve), mas `givepal_j` ignora silenciosamente
 * na ESCRITA (nem a doc lista `IsAwakening` como campo aceito). Foi assim
 * que o Felbat despertado do dono do SantØs voltou sem despertar depois de
 * cancelar uma purificação — mesma classe de perda que `CondensedPals`
 * (que também nunca é 0 → chega 0 sempre), só que sem alternativa: dá para
 * condensar de novo pelo jogo, e dá para despertar de novo pelo jogo — mas
 * nenhum dos dois volta sozinho pela Câmara ou pelo cofre. Ver a memória do
 * projeto e o aviso na tela de `/purificacao`.
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
 * 🔴 **`Rank` ficou de fora, e não por acaso — foi o que quebrava tudo.**
 * A doc do PalDefender lista `Rank` (comparado a `CondensedPals`) como
 * filtro válido, mas não diz se a contagem do jogo começa em 0 ou em 1.
 * Com `Rank=CondensedPals` (0 para todo Pal não condensado — a
 * imensa maioria), **100% das tentativas de guardar Pal retornavam
 * "Deleted 0 pals"**, inclusive casos triviais (Pal comum, nível baixo,
 * recém-capturado). Ou seja: se o jogo conta `Rank` a partir de 1, esse
 * termo nunca batia com nada, e o Pal lido virava cópia no cofre sem o
 * original nunca sair do jogador. Tirar `Rank` custa só a ambiguidade
 * de condensação abaixo — e resolve a falha sistemática. Reintroduzir
 * exige confirmar ao vivo, contra o RCON de verdade, se é `CondensedPals`
 * ou `CondensedPals + 1`.
 *
 * **Limite que continua existindo, sem `Rank`:** a sintaxe do `deletepals`
 * filtra por `ID`, `Nick`, `Gender`, `Level`, `Lucky` (= `Shiny`) e
 * `Passives` — não existe filtro por IV nem por identidade única do Pal.
 * Se o jogador tiver **dois** Pals idênticos nesses campos (mesma espécie,
 * nível, gênero, shiny, apelido e passivas, mas IVs — ou condensação —
 * diferentes), o `Limit=1` remove **um dos dois**, e não há como garantir
 * que seja o mesmo cujo template foi lido.
 *
 * Isso não quebra a venda: o comprador recebe exatamente o template que foi
 * mostrado no anúncio, porque a entrega usa o template salvo, não uma nova
 * leitura do vendedor. O que fica ambíguo é só **qual das duas cópias**
 * saiu da conta do vendedor — irrelevante para o valor econômico, mas vale
 * o registro para quando alguém perguntar "por que sumiu o outro, não este".
 */
export function filtroDeExclusao(pal: PalCru): string {
  return candidatosDeFiltro(pal)[0];
}

/**
 * 🔧 Bissecção temporária (§incidente 01/09/2026): mesmo sem `Rank`, guardar
 * Pal continuava voltando "Deleted 0 pals" — algum outro campo do filtro não
 * bate com o que o `deletepals` espera de verdade, e a doc do PalDefender não
 * documenta o suficiente para adivinhar qual. Sem um exemplo real de comando
 * que funcionou, e sem RCON direto para testar manualmente, a saída é testar
 * ao vivo: do mais específico pro mais genérico, indo embora um campo por
 * vez, até um bater.
 *
 * `importarPalParaCofre` tenta cada candidato em ordem e para no primeiro
 * que apagar de verdade — o `detail` da transferência registra qual venceu,
 * para eu ler no banco depois e transformar de volta num filtro fixo único.
 * Isto é andaime de investigação, não é para viver no código depois de achar
 * a resposta.
 */
export function candidatosDeFiltro(pal: PalCru): string[] {
  const id = `ID ${str(pal.PalID)}`;

  const opcionais: string[] = [
    `Lucky ${bool(pal.Shiny)}`,
    `Gender ${str(pal.Gender, "Male").toLowerCase()}`,
  ];

  const apelido = str(pal.Nickname).trim();
  if (apelido) opcionais.push(`Nick ${apelido}`);

  const passivas = arr(pal.Passives);
  if (passivas.length) opcionais.push(`Passives ${passivas.join(",")}`);

  opcionais.push(`Level=${num(pal.Level, 1)}`);

  const candidatos: string[] = [];
  for (let i = 0; i <= opcionais.length; i++) {
    candidatos.push([id, ...opcionais.slice(i), "Limit 1"].join(" "));
  }
  return candidatos;
}

/**
 * Um nome de arquivo estável e sem espaço, para o servidor do jogo.
 *
 * O id da transferência entra no nome de propósito: cada entrega escreve o
 * seu, nunca reaproveita um arquivo de uma entrega anterior.
 */
export const nomeDoArquivo = (transferenciaId: number) =>
  `palleira_${transferenciaId}`;
