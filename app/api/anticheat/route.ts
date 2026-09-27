import { NextResponse } from "next/server";
import { serverBySlug, SERVERS } from "@/lib/servers";
import { banirPorRcon, kickPlayer, rcon } from "@/lib/palworld/rcon";
import { logarNoDiscord } from "@/lib/discord";
import { sql } from "@/lib/db";

/**
 * Recebe as detecções do anticheat e expulsa em rajada — na hora.
 *
 * O PalDefender **detecta mas não pune** a heurística de dano: escreve
 * `*may be* a cheater! … Not taking any actions, since this requires human
 * judgement.` e segue o jogo. Confirmado na própria DLL (v1.9.2): existem
 * `doActionUponIllegalPalStats` e `doActionUponDoctorSurgiExploit`, mas nada
 * equivalente para dano. A punição precisa vir de fora.
 *
 * Por que aqui e não num cron: o `webhookURL_AntiCheats` do PalDefender faz
 * POST JSON **no instante da detecção**, então o kick sai em segundos. Um
 * cron no GitHub Actions custaria o minuto cheio de runner por checagem e
 * não caberia na cota grátis — 20 minutos de PvP com alguém batendo 57x já
 * é estrago feito.
 *
 * ⚠️ Aviso isolado NÃO é cheat. Lag e dessincronia geram falso positivo, e
 * o próprio log mostra isso: em 11/09/2026 o `Santos`, que não usa nada,
 * acumulou 12 avisos em 5 minutos num pico de lag. O que separa lag de
 * trapaça é o **volume em rajada** — daí o limiar. Medido nos logs de três
 * dias do Dominantes: o cheater chegou a 46 avisos em 5 min, o pior caso
 * honesto ficou em 12.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JANELA_MS = 5 * 60_000;
/**
 * Depois de um kick, ignora o resto da rajada que ainda está chegando.
 *
 * Era 1 hora, quando o kick era a punição final. Com a escada de avisos
 * (ver `AVISOS_POR_KICK`), quem volta e continua precisa começar a levar
 * aviso logo — o Fabao voltou em minutos e seguiu (27/09/2026). Um minuto
 * cobre os POSTs atrasados da mesma rajada sem deixar brecha.
 */
const SILENCIO_MS = 60_000;

/**
 * A escada de punição, pedida pelo dono em 27/09/2026:
 *
 *   5 avisos → kick 1 → 5 avisos → kick 2 → 5 avisos → kick 3 → 5 avisos → ban
 *
 * Os 5 avisos antes de cada kick são para a pessoa ficar ciente — cada
 * recado diz o número do aviso e o que vem depois. Os kicks somam dano e
 * stamina, e só contam os de 27/09/2026 em diante (migração 033).
 */
const AVISOS_POR_KICK = 5;
const KICKS_ANTES_DO_BAN = 3;

/**
 * Intervalo mínimo entre dois avisos.
 *
 * Um cheat de dano manda dezenas de detecções por segundo — o Fabao chegou
 * a 131. Sem este intervalo, os 5 avisos sairiam todos no mesmo segundo e
 * ninguém leria nenhum. Com 10 segundos, os 5 levam quase um minuto: tempo
 * de ler e de fechar o cheat. O que chega dentro do intervalo é descartado.
 */
const INTERVALO_AVISO_MS = 10_000;

/**
 * Avisos esquecidos: quem ficou uma hora sem nova rajada recomeça do 1º.
 * Evita que picos de lag espalhados por dias somem até um kick.
 */
const AVISO_EXPIRA_MS = 60 * 60_000;

/**
 * A contagem mora no banco, não na memória do processo.
 *
 * 🔴 Já morou em `Map`, com a justificativa de que a janela é curta e a
 * função fica quente entre chamadas. Estava errado para como a Vercel
 * atende de verdade: várias instâncias em paralelo, e cada POST do
 * PalDefender pode cair numa diferente. Com a rajada dividida, cada
 * instância vê um pedaço e **nenhuma chega ao limiar**.
 *
 * Medido em 12/09/2026: o 'VOID' fez 10 avisos de stamina em 24 segundos no
 * Dominantes — ritmo de ~25/min, muito acima do limiar de 25 em 5 min — e
 * não levou aviso nem kick. Ver a migração 015.
 *
 * O custo é uma ida ao Postgres no caminho quente. Vale: sem isto o kick
 * não é ao vivo, é loteria.
 *
 * 🔴 **A janela conta chegada, nunca o carimbo da linha.** `created_at` é o
 * `now()` do Postgres no instante em que o POST entra — o `[20:22:46]` que
 * vem escrito na mensagem do PalDefender é ignorado de propósito. É o que
 * separa este endpoint do script `vigia`, que lia o arquivo de log inteiro,
 * somava tudo que estava lá e por isso expulsou quem **já tinha parado**: o
 * xNEGANx levou kick por 30 detecções de uma hora antes, e o Kaninos, que
 * nem estava no servidor, por 43 (commit 3e6661d, 12/09/2026).
 *
 * Aqui isso não acontece: cada POST é um evento do instante, e a soma só
 * enxerga os últimos `JANELA_MS`. Detecção de ontem, ou de vinte minutos
 * atrás, não entra na conta — verificado com 70 linhas antigas plantadas no
 * banco, que a janela contou como zero. Uma linha de log reenviada com
 * carimbo velho também vale como agora, e não como o horário que traz.
 *
 * ⚠️ E é bom que seja assim: o servidor roda na Europa e carimba o log em
 * **UTC+1**, quatro horas à frente de São Paulo. Se a janela confiasse no
 * horário escrito na linha, toda detecção chegaria "do futuro" e a
 * comparação com `now()` do banco daria errado de um jeito silencioso —
 * ou contando tudo, ou não contando nada. O carimbo do PalDefender só
 * presta para medir **intervalos** dentro do próprio arquivo, nunca para
 * dizer que horas são.
 */

/** Grava a detecção e devolve quantas há na janela, já contando esta. */
async function registrarEContar(
  slug: string,
  det: Deteccao,
): Promise<number> {
  const linhas = (await sql`
    with nova as (
      insert into anticheat_detections (server_slug, user_id, tipo, nome)
      values (${slug}, ${det.userId}, ${det.tipo}, ${det.nome})
      returning 1
    ),
    limpeza as (
      delete from anticheat_detections
       where created_at < now() - interval '1 hour'
    )
    select count(*)::int as total
      from anticheat_detections
     where server_slug = ${slug}
       and user_id = ${det.userId}
       and tipo = ${det.tipo}
       and created_at > now() - ${`${JANELA_MS} milliseconds`}::interval
  `) as { total: number }[];

  // O `select` roda no mesmo comando do `insert`, então a linha nova ainda
  // não está visível para ele: soma 1 à mão.
  return (linhas[0]?.total ?? 0) + 1;
}

/** Zera a janela deste jogador — depois de avisar ou de kickar. */
const limparJanela = (slug: string, det: Deteccao) => sql`
  delete from anticheat_detections
   where server_slug = ${slug} and user_id = ${det.userId} and tipo = ${det.tipo}
`;

type Tipo = "dano" | "stamina";

interface Deteccao {
  userId: string;
  nome: string;
  linha: string;
  tipo: Tipo;
}

/**
 * Limiar por tipo, porque o ruído de cada um é diferente.
 *
 * Medido nos logs do Dominantes em 12/09/2026, pico em 5 minutos:
 *
 *   dano     xNEGANx*  46   ← cheat        Santos 12  ← lag
 *   stamina  xNEGANx   30   ← Cheat Engine Santos 12  ← lag
 *
 * (*o de dano foi o Kaninos; o de stamina, o xNEGANx.)
 *
 * Stamina quase entrou como ruído puro — 9 jogadores diferentes aparecem
 * nela, em Steam/Xbox/PS5. O que mostrou que não é só ping foi o relato do
 * dono: o xNEGANx **não estava usando** stamina hack, mas o Cheat Engine
 * aberto com a tabela carregada já aplica o valor sozinho; quando ele
 * fechou tudo e reiniciou, parou de acusar na hora. Bate com o log: os
 * dele são contínuos (30 min seguidos, picos de 14/min), os dos outros
 * são pontuais (1 a 5 avisos isolados).
 *
 * 🔴 Baixado de 30/25 para 16 em 17/09/2026: `GOMES` e `King` (mesma guild,
 * Dominantes) ficavam meia hora inteira cheatando — um boot chegou a 288
 * detecções de dano num minuto só — mas em rajadas de 3 a 6 tiros com ~1
 * minuto de pausa entre elas, que nunca fechavam 30 em 5 minutos. O pedido
 * do dono foi punir na hora, não esperar um padrão sustentado por mais
 * tempo. 16 é o menor valor que ainda fica acima do pior caso honesto
 * medido (Santos, 12 nos dois tipos) com folga de ~33%, e o King/GOMES
 * fecham em 2–4 rajadas do próprio padrão deles — minutos, não meia hora.
 */
const LIMIARES: Record<Tipo, number> = { dano: 16, stamina: 16 };

/**
 * Se o aviso conta para o gatilho.
 *
 * Dano: só **acima** do que a arma permite. Metade dos avisos do log é de
 * dano abaixo do esperado (`NativeDamageValue=360 but expected 1200`,
 * desarmado) — dessincronia de rede, e bater mais fraco não beneficia
 * ninguém. Contar esses kickaria jogador honesto.
 *
 * Stamina: conta sempre; o volume é que separa, ver `LIMIARES`.
 *
 * ⚠️ `FishingRod` ignorada por completo: o Santos ficou preso lutando contra
 * o Ginásio (17/09/2026) com `BasePower=220 above 1.50x AttackValue=25` —
 * sempre o mesmo valor fixo, mesmo trocando de arma na tela para um fuzil de
 * verdade. O servidor lia a vara de pesca do inventário como se fosse a arma
 * equipada; assim que ele a removeu, as detecções pararam por completo. Vara
 * de pesca não é arma de combate — não há cenário de PvP em que valha contar.
 *
 * 🔴 Dano só conta contra Boss/Ginásio ou outro jogador, nunca contra Pal
 * selvagem comum — achado em 18/09/2026: o `Kaninos` disparou ~164 avisos de
 * dano em 90 segundos (quase 2/s) só de **pegar ovos na incubadora**, contra
 * alvos como `BP_BlackPuppy_C_…` e `BP_BlueberryFairy_C_…` — nome de espécie
 * crua, sem `_Gym_`/`BOSS_`. Confirmado ao vivo pelo dono: não tinha cheat
 * nenhum rodando. Todo cheat de dano confirmado até aqui (King, GOMES) bateu
 * em `_Gym_` (Ginásio). Restringir a Boss/jogador elimina esse falso
 * positivo — que também é candidato a ter contribuído para o servidor cair
 * pouco depois de cada boot, por volume de webhook.
 */
const ARMA_IGNORADA = /FishingRod/i;
const ALVO_VALIDO = /_Gym_|BOSS_|\(ToPlayer\)/i;

function contaParaOGatilho(linha: string, tipo: Tipo): boolean {
  if (tipo === "stamina") return true;
  if (ARMA_IGNORADA.test(linha)) return false;
  if (!ALVO_VALIDO.test(linha)) return false;

  const acima = /BasePower=(\d+) above [\d.]+x equipped weapon AttackValue=(\d+)/.exec(linha);
  if (acima) return Number(acima[1]) > Number(acima[2]);

  const nativo = /reported NativeDamageValue=(\d+) but expected \S+=(\d+)/.exec(linha);
  if (nativo) return Number(nativo[1]) > Number(nativo[2]);

  return false;
}

function extrair(corpo: unknown): Deteccao | null {
  // O PalDefender manda JSON; o formato exato varia por destino, então lê-se
  // o texto inteiro e tira-se o que importa dele, em vez de depender de um
  // campo com nome fixo que pode mudar de versão.
  const texto =
    typeof corpo === "string" ? corpo : JSON.stringify(corpo ?? "");
  if (!texto.includes("may be") || !texto.includes("cheater")) return null;

  // ⚠️ "Ammo cheat suspicion" (ex: PalSphere com MagazineSize=0) cai aqui
  // classificada como "dano" por exclusão, mas nunca bate nos regex de
  // `contaParaOGatilho` (nem BasePower, nem NativeDamageValue) — então nunca
  // conta para o gatilho e nunca kicka. Isso é intencional, não um regex
  // esquecido: medido em 17/09/2026, 13 ocorrências de 4 jogadores diferentes
  // (Bolota, Leo_Raposa, BIEL, hsYoungD), sempre com esfera de captura comum
  // e remaining=0 — é o evento normal de tentar arremessar sem ter esfera no
  // bolso, não munição infinita de verdade.

  const m = /'([^']+)' \(UserId=([^,)]+)/.exec(texto);
  if (!m) return null;
  return {
    nome: m[1],
    userId: m[2].trim(),
    linha: texto,
    tipo: /Stamina cheat suspicion/i.test(texto) ? "stamina" : "dano",
  };
}

export async function POST(req: Request) {
  // O segredo vai na própria URL do webhook, porque o PalDefender não
  // permite cabeçalho customizado: ?k=…
  const chave = process.env.ANTICHEAT_WEBHOOK_KEY ?? "";
  const url = new URL(req.url);
  if (!chave || url.searchParams.get("k") !== chave) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const slug = url.searchParams.get("servidor") ?? "";
  const server = serverBySlug(slug);
  if (!server) {
    return NextResponse.json({ erro: "servidor desconhecido" }, { status: 400 });
  }

  const corpo = await req.json().catch(() => null);
  const det = extrair(corpo);
  if (!det) return NextResponse.json({ ignorado: true });
  if (!contaParaOGatilho(det.linha, det.tipo)) {
    return NextResponse.json({ ignorado: "abaixo do esperado" });
  }

  const limiar = LIMIARES[det.tipo];
  // Contagem por tipo: dano e stamina têm ruídos diferentes, e somar os dois
  // faria alguém com lag nos dois detectores passar sem ser cheater em
  // nenhum deles.
  const naJanela = await registrarEContar(slug, det);

  if (naJanela < limiar) {
    return NextResponse.json({ tipo: det.tipo, contando: naJanela, limiar });
  }

  // Estado do jogador: quando levou o último kick neste tipo e quantos kicks
  // do anticheat já levou no total (dano + stamina). Uma consulta só, para
  // não somar duas idas ao banco no caminho quente.
  const estado = (await sql`
    select
      (select extract(epoch from now() - kickado_em) * 1000
         from anticheat_kicks
        where server_slug = ${slug} and user_id = ${det.userId} and tipo = ${det.tipo}
      )::float8 as desde_kick,
      (select coalesce(sum(kicks), 0)
         from anticheat_kicks
        where server_slug = ${slug} and user_id = ${det.userId}
      )::int as kicks
  `) as { desde_kick: number | null; kicks: number }[];

  const desdeKick = estado[0]?.desde_kick ?? null;
  const kicks = estado[0]?.kicks ?? 0;
  const vaiSerBan = kicks >= KICKS_ANTES_DO_BAN;

  if (desdeKick !== null && desdeKick < SILENCIO_MS) {
    return NextResponse.json({ ja_kickado: true });
  }

  // Conta o aviso numa escrita só, e só se o anterior já passou do
  // intervalo. O `where` do `on conflict` trava a linha: duas instâncias com
  // a mesma rajada não contam o mesmo aviso duas vezes — a segunda não
  // recebe linha de volta e cai no descarte logo abaixo.
  const contado = (await sql`
    insert into anticheat_warnings (server_slug, user_id, tipo, avisos, avisado_em)
    values (${slug}, ${det.userId}, ${det.tipo}, 1, now())
    on conflict (server_slug, user_id, tipo) do update
      set avisos = case
            when anticheat_warnings.avisado_em
                 < now() - ${`${AVISO_EXPIRA_MS} milliseconds`}::interval
            then 1
            else anticheat_warnings.avisos + 1
          end,
          avisado_em = now()
      where anticheat_warnings.avisado_em
            < now() - ${`${INTERVALO_AVISO_MS} milliseconds`}::interval
    returning avisos
  `) as { avisos: number }[];

  await limparJanela(slug, det);

  if (contado.length === 0) {
    return NextResponse.json({ aguardando_intervalo: true });
  }
  const aviso = contado[0].avisos;

  if (aviso <= AVISOS_POR_KICK) {
    // `rcon` direto, e não `sendToPlayer`: aquele converte o UID para o
    // formato 8-8-8-8 do Palworld, e aqui o id vem da plataforma
    // (`steam_…`, `gdk_…`, `ps5_…`). O `send msg` aceita os dois — testado
    // por RCON em 12/09/2026 — mas só se o valor chegar intacto.
    // Stamina costuma vir de tabela do Cheat Engine ligada por padrão, sem
    // a pessoa "usar" nada — por isso o aviso manda FECHAR o programa, não
    // só parar de usar. Relato do dono em 12/09/2026: o jogador fechou tudo,
    // reiniciou, e as detecções pararam na hora.
    const oQueFazer =
      det.tipo === "stamina"
        ? "feche_o_Cheat_Engine_e_reinicie_o_jogo"
        : "desligue_o_cheat_de_dano";
    const depois = vaiSerBan
      ? "BAN"
      : `KICK_${kicks + 1}_de_${KICKS_ANTES_DO_BAN}_(depois_do_${KICKS_ANTES_DO_BAN}o_kick_vem_BAN)`;
    const recado = `ANTICHEAT_aviso_${aviso}_de_${AVISOS_POR_KICK}:_${oQueFazer}._Depois_do_${AVISOS_POR_KICK}o_aviso:_${depois}`;
    await rcon(server, `send msg ${det.userId} ${recado}`).catch(() => "");

    return NextResponse.json({
      avisado: det.nome,
      tipo: det.tipo,
      aviso,
      kicks,
    });
  }

  // Passou dos avisos: registra a punição ANTES de executar, para que uma
  // segunda detecção chegando em paralelo (outra instância, mesma rajada)
  // já encontre o silêncio e não puna duas vezes. Os avisos zeram — depois
  // de voltar, a escada recomeça do 1º.
  await sql`
    insert into anticheat_kicks (server_slug, user_id, tipo, nome, kickado_em, kicks, banido_em)
    values (${slug}, ${det.userId}, ${det.tipo}, ${det.nome}, now(),
            ${vaiSerBan ? 0 : 1}, ${vaiSerBan ? new Date() : null})
    on conflict (server_slug, user_id, tipo)
    do update set kickado_em = now(),
                  nome = excluded.nome,
                  kicks = anticheat_kicks.kicks + ${vaiSerBan ? 0 : 1},
                  banido_em = coalesce(excluded.banido_em, anticheat_kicks.banido_em)
  `;
  await sql`
    delete from anticheat_warnings
     where server_slug = ${slug} and user_id = ${det.userId} and tipo = ${det.tipo}
  `;

  const motivo =
    det.tipo === "stamina" ? "MOTIVO: ANTICHEAT DE STAMINA" : "MOTIVO: ANTICHEAT DE DANO";

  if (vaiSerBan) {
    const ok = await banirPorRcon(server, det.userId, [
      `${det.nome} FOI BANIDO`,
      motivo,
      `${KICKS_ANTES_DO_BAN} KICKS E CONTINUOU`,
    ]).catch(() => false);
    await logarNoDiscord(
      `🔨 Anticheat baniu **${det.nome}** (\`${det.userId}\`) em ${server.shortName} — ${det.tipo}, depois de ${KICKS_ANTES_DO_BAN} kicks. Desfazer: \`UnBanPlayer ${det.userId}\` no console do painel.`,
    ).catch(() => false);
    return NextResponse.json({ banido: ok, jogador: det.nome, tipo: det.tipo });
  }

  const ok = await kickPlayer(server, det.userId, [
    `${det.nome} FOI KICKADO (${kicks + 1}/${KICKS_ANTES_DO_BAN})`,
    motivo,
    `DEPOIS DO ${KICKS_ANTES_DO_BAN}o KICK VEM BAN`,
  ]).catch(() => false);

  return NextResponse.json({
    kickado: ok,
    jogador: det.nome,
    tipo: det.tipo,
    kick: kicks + 1,
  });
}

/** Só para conferir que o endpoint está no ar. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    limiares: LIMIARES,
    servidores: SERVERS.filter((s) => s.enabled).map((s) => s.slug),
  });
}
