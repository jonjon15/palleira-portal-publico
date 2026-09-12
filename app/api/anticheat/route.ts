import { NextResponse } from "next/server";
import { serverBySlug, SERVERS } from "@/lib/servers";
import { kickPlayer, rcon } from "@/lib/palworld/rcon";

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

const LIMIAR = 30;
const JANELA_MS = 5 * 60_000;
/** Não repetir o kick pelos mesmos avisos enquanto a pessoa não volta. */
const SILENCIO_MS = 60 * 60_000;

/**
 * Quanto tempo a pessoa tem para desligar o cheat depois do aviso.
 *
 * O dono pediu esta etapa depois de conversar com um jogador e ele desligar
 * o que estava usando (12/09/2026): quem para na hora não é expulso. Passado
 * o prazo, uma nova rajada cai direto no kick — o aviso vale uma vez.
 */
const PRAZO_AVISO_MS = 3 * 60_000;

/**
 * Memória do processo, de propósito.
 *
 * A janela é de 5 minutos e a função fica quente entre chamadas seguidas;
 * um banco aqui acrescentaria latência ao caminho que precisa ser rápido.
 * Se a instância reciclar, a contagem recomeça — o efeito é dar mais uma
 * chance ao suspeito, nunca kickar alguém à toa.
 */
const avisos = new Map<string, number[]>();
const kickados = new Map<string, number>();
/** Quem já levou o aviso, e quando. */
const avisados = new Map<string, number>();

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
 */
const LIMIARES: Record<Tipo, number> = { dano: 30, stamina: 25 };

/**
 * Se o aviso conta para o gatilho.
 *
 * Dano: só **acima** do que a arma permite. Metade dos avisos do log é de
 * dano abaixo do esperado (`NativeDamageValue=360 but expected 1200`,
 * desarmado) — dessincronia de rede, e bater mais fraco não beneficia
 * ninguém. Contar esses kickaria jogador honesto.
 *
 * Stamina: conta sempre; o volume é que separa, ver `LIMIARES`.
 */
function contaParaOGatilho(linha: string, tipo: Tipo): boolean {
  if (tipo === "stamina") return true;

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

  const agora = Date.now();
  const limiar = LIMIARES[det.tipo];
  // Contagem por tipo: dano e stamina têm ruídos diferentes, e somar os dois
  // faria alguém com lag nos dois detectores passar sem ser cheater em
  // nenhum deles.
  const chaveJogador = `${slug}:${det.userId}:${det.tipo}`;

  const recentes = (avisos.get(chaveJogador) ?? []).filter(
    (t) => agora - t < JANELA_MS,
  );
  recentes.push(agora);
  avisos.set(chaveJogador, recentes);

  if (recentes.length < limiar) {
    return NextResponse.json({ tipo: det.tipo, contando: recentes.length, limiar });
  }
  if (agora - (kickados.get(chaveJogador) ?? 0) < SILENCIO_MS) {
    return NextResponse.json({ ja_kickado: true });
  }

  // Primeira rajada: avisa e dá um prazo para desligar o cheat. Quem para
  // não é expulso — foi o que aconteceu na conversa do dono com um jogador
  // em 12/09/2026. Só quem continua depois do prazo cai no kick.
  const avisadoEm = avisados.get(chaveJogador) ?? 0;
  if (agora - avisadoEm > PRAZO_AVISO_MS) {
    avisados.set(chaveJogador, agora);
    avisos.delete(chaveJogador);

    // `rcon` direto, e não `sendToPlayer`: aquele converte o UID para o
    // formato 8-8-8-8 do Palworld, e aqui o id vem da plataforma
    // (`steam_…`, `gdk_…`, `ps5_…`). O `send msg` aceita os dois — testado
    // por RCON em 12/09/2026 — mas só se o valor chegar intacto.
    // Stamina costuma vir de tabela do Cheat Engine ligada por padrão, sem
    // a pessoa "usar" nada — por isso o aviso manda FECHAR o programa, não
    // só parar de usar. Relato do dono em 12/09/2026: o jogador fechou tudo,
    // reiniciou, e as detecções pararam na hora.
    const recado =
      det.tipo === "stamina"
        ? "ANTICHEAT:_feche_o_Cheat_Engine_e_reinicie_o_jogo_ou_sera_expulso"
        : "ANTICHEAT:_desligue_o_cheat_de_dano_ou_sera_expulso";
    await rcon(server, `send msg ${det.userId} ${recado}`).catch(() => "");

    return NextResponse.json({
      avisado: det.nome,
      tipo: det.tipo,
      avisos: recentes.length,
    });
  }

  kickados.set(chaveJogador, agora);
  avisados.delete(chaveJogador);
  avisos.delete(chaveJogador);

  const ok = await kickPlayer(server, det.userId, [
    `${det.nome} FOI KICKADO`,
    det.tipo === "stamina"
      ? "MOTIVO: ANTICHEAT DE STAMINA"
      : "MOTIVO: ANTICHEAT DE DANO",
    "AVISADO E CONTINUOU",
  ]).catch(() => false);

  return NextResponse.json({
    kickado: ok,
    jogador: det.nome,
    tipo: det.tipo,
    avisos: recentes.length,
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
