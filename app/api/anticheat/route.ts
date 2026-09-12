import { NextResponse } from "next/server";
import { serverBySlug, SERVERS } from "@/lib/servers";
import { kickPlayer } from "@/lib/palworld/rcon";

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
 * Memória do processo, de propósito.
 *
 * A janela é de 5 minutos e a função fica quente entre chamadas seguidas;
 * um banco aqui acrescentaria latência ao caminho que precisa ser rápido.
 * Se a instância reciclar, a contagem recomeça — o efeito é dar mais uma
 * chance ao suspeito, nunca kickar alguém à toa.
 */
const avisos = new Map<string, number[]>();
const kickados = new Map<string, number>();

interface Deteccao {
  userId: string;
  nome: string;
  linha: string;
}

/**
 * Só conta aviso de dano **acima** do que a arma permite.
 *
 * Metade dos avisos do log é de dano abaixo do esperado
 * (`NativeDamageValue=360 but expected 1200`, desarmado) — dessincronia de
 * rede, e bater mais fraco não beneficia ninguém. Contar esses kickaria
 * jogador honesto: foi o caso de xNEGANx, DankiBase e HordaS Mari.
 */
function bateuMaisForte(linha: string): boolean {
  const acima = /BasePower=(\d+) above [\d.]+x equipped weapon AttackValue=(\d+)/.exec(linha);
  if (acima) return Number(acima[1]) > Number(acima[2]);

  const nativo = /reported NativeDamageValue=(\d+) but expected \S+=(\d+)/.exec(linha);
  if (nativo) return Number(nativo[1]) > Number(nativo[2]);

  // Stamina e afins não trazem número para comparar. Ficam de fora do gatilho
  // automático: medido em 12/09/2026, stamina gera ruído demais — o xNEGANx
  // teve 6 avisos e o Handoroki BR, que não é suspeito de nada, teve 5.
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
  return { nome: m[1], userId: m[2].trim(), linha: texto };
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
  if (!bateuMaisForte(det.linha)) return NextResponse.json({ ignorado: "abaixo" });

  const agora = Date.now();
  const chaveJogador = `${slug}:${det.userId}`;

  const recentes = (avisos.get(chaveJogador) ?? []).filter(
    (t) => agora - t < JANELA_MS,
  );
  recentes.push(agora);
  avisos.set(chaveJogador, recentes);

  if (recentes.length < LIMIAR) {
    return NextResponse.json({ contando: recentes.length, limiar: LIMIAR });
  }
  if (agora - (kickados.get(chaveJogador) ?? 0) < SILENCIO_MS) {
    return NextResponse.json({ ja_kickado: true });
  }

  kickados.set(chaveJogador, agora);
  avisos.delete(chaveJogador);

  const ok = await kickPlayer(server, det.userId, [
    `${det.nome} FOI KICKADO`,
    "MOTIVO: ANTICHEAT DE DANO",
    `${recentes.length} DETECCOES EM 5 MINUTOS`,
  ]).catch(() => false);

  return NextResponse.json({ kickado: ok, jogador: det.nome, avisos: recentes.length });
}

/** Só para conferir que o endpoint está no ar. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    limiar: LIMIAR,
    servidores: SERVERS.filter((s) => s.enabled).map((s) => s.slug),
  });
}
