import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import { DAILY_PALETAS_BASE } from "@/lib/economia";
import { PRECO_MINIMO, PRECO_MAXIMO, MAX_ANUNCIOS_ATIVOS, taxaDaVenda } from "@/lib/mercado-regras";
import { precoDoSlot } from "@/lib/cofre-regras";
import { PLANOS, SLOTS_COFRE_PADRAO } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Como funciona",
  description:
    "O que o Palleira oferece: vincular a conta, Paletas, cofre na nuvem, mercado entre jogadores, ranking, eventos e VIP.",
};

/**
 * A página que faltava: o site inteiro explicado em português.
 *
 * Toda página existente é "faça" — servidores, ranking, mercado, cofre. Quem
 * chega sem saber o que é o Palleira não descobre em lugar nenhum. Esta é a
 * única "entenda".
 *
 * ⚠️ Os números **não** são escritos à mão aqui: vêm de `lib/mercado-regras`,
 * `lib/cofre-regras`, `lib/economia` e `lib/roles`, os mesmos módulos que o
 * site usa para cobrar. Página de ajuda que mente é pior que página nenhuma,
 * e mentiria no dia em que alguém mudasse a taxa e esquecesse do texto.
 */

function Secao({
  id,
  titulo,
  resumo,
  children,
}: {
  id: string;
  titulo: string;
  resumo: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-surface p-6"
    >
      <h2 className="text-xl font-bold tracking-tight">{titulo}</h2>
      <p className="mt-1.5 max-w-3xl text-sm text-muted">{resumo}</p>
      <div className="mt-4 max-w-3xl space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-xs font-bold text-gold">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

const ATALHOS = [
  ["conta", "Vincular a conta"],
  ["paletas", "Paletas"],
  ["cofre", "Cofre na nuvem"],
  ["mercado", "Mercado"],
  ["ranking", "Ranking e mapa"],
  ["eventos", "Eventos"],
  ["vip", "VIP e doação"],
  ["problemas", "Deu problema no jogo"],
] as const;

export default function ComoFunciona() {
  // Os três primeiros degraus da taxa, mostrados com exemplo real.
  const exemplosDeTaxa = [10, 50, 200].map((p) => ({
    preco: p,
    taxa: taxaDaVenda(p),
    recebe: p - taxaDaVenda(p),
  }));

  // O preço dos próximos slots para quem não tem VIP.
  const proximosSlots = [1, 2, 3, 4].map((i) => ({
    numero: SLOTS_COFRE_PADRAO + i,
    preco: precoDoSlot(SLOTS_COFRE_PADRAO + i, SLOTS_COFRE_PADRAO),
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader
        kicker="Guia da comunidade"
        title="Como funciona"
        description="Tudo o que o Palleira oferece, em português e sem enrolação."
      />

      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
        O Palleira é uma comunidade brasileira de Palworld com servidores
        próprios. Este site é a parte que existe fora do jogo: ele guarda seus
        itens e Pals quando você está offline, deixa você negociar com outras
        pessoas a qualquer hora, mostra o ranking da comunidade e paga uma
        moeda própria — a <b className="text-text">Paleta</b>.
      </p>

      {/* -------------------------------------------------------- atalhos */}
      <nav aria-label="Nesta página" className="mt-6 flex flex-wrap gap-2">
        {ATALHOS.map(([id, texto]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-line-strong hover:text-text"
          >
            {texto}
          </a>
        ))}
      </nav>

      <div className="mt-8 space-y-6">
        {/* --------------------------------------------------------- conta */}
        <Secao
          id="conta"
          titulo="Primeiro: vincular a conta"
          resumo="Sem isso o site não sabe quem você é dentro do jogo, e nada mais funciona."
        >
          <ol className="space-y-2.5">
            <Passo n={1}>
              Entre no site com o <b>Discord</b> — é o mesmo login da
              comunidade.
            </Passo>
            <Passo n={2}>
              Esteja <b>online no jogo</b>, em um dos servidores da Palleira, e
              abra <Link href="/vincular" className="text-gold hover:underline">Vincular</Link>.
            </Passo>
            <Passo n={3}>
              O site manda um <b>código de 6 dígitos direto para o seu
              personagem</b>, dentro do jogo. Digite esse código no site.
            </Passo>
          </ol>
          <p className="text-muted">
            O código chega no jogo de propósito: para roubar o personagem de
            alguém seria preciso estar com o Discord <i>e</i> com o jogo dessa
            pessoa abertos ao mesmo tempo. Como a carteira de Paletas fica
            amarrada a esse vínculo, essa prova é o mínimo aceitável.
          </p>
          <p className="text-muted">
            O vínculo vale na <b className="text-text">comunidade inteira</b>,
            não em um servidor só — sua conta é a mesma nos três mundos.
          </p>
        </Secao>

        {/* ------------------------------------------------------- paletas */}
        <Secao
          id="paletas"
          titulo="Paletas, a moeda da comunidade"
          resumo="Número pequeno de propósito: ela compra espaço e coisas de outros jogadores, não poder."
        >
          <p>
            <b>Como ganhar:</b> o <b className="text-text">daily</b> do{" "}
            <Link href="/painel" className="text-gold hover:underline">painel</Link>{" "}
            paga {DAILY_PALETAS_BASE} Paletas por dia para quem não tem plano
            (VIP paga mais — veja abaixo). Também entram Paletas por{" "}
            <b>vendas no mercado</b>, <b>eventos</b> e <b>doação</b>.
          </p>
          <p>
            <b>Como gastar:</b> comprando de outros jogadores no mercado e
            abrindo mais espaço no cofre.
          </p>
          <p className="text-muted">
            Seu saldo é a soma do extrato, e cada linha diz de onde veio ou
            para onde foi — nada muda sem deixar rastro. O extrato completo
            fica em{" "}
            <Link href="/painel/carteira" className="text-gold hover:underline">
              Carteira
            </Link>
            .
          </p>
        </Secao>

        {/* --------------------------------------------------------- cofre */}
        <Secao
          id="cofre"
          titulo="Cofre na nuvem"
          resumo="Tira o item ou o Pal do jogo e guarda no site, para negociar mesmo offline."
        >
          <p>
            O servidor do jogo só entrega seu inventário quando você está
            online. Se o mercado lesse o jogo na hora da venda, ninguém
            compraria de madrugada e toda troca exigiria as duas pessoas
            logadas ao mesmo tempo. O cofre resolve isso:
          </p>
          <p className="rounded-[var(--radius-control)] border border-line bg-bg px-4 py-3 text-center font-mono text-xs text-muted">
            jogo → <b className="text-text">cofre</b> → comprador → jogo
          </p>
          <p>
            Você <b>importa</b> estando online, o item fica em custódia do
            site, e o <b>resgate</b> devolve ao jogo quando quiser. Vale para
            itens e para Pals — cada um com seu cofre.
          </p>
          <p>
            <b>Espaço:</b> todo mundo começa com {SLOTS_COFRE_PADRAO} slot
            grátis. Os próximos são comprados com Paletas e ficam para sempre:
          </p>
          <ul className="flex flex-wrap gap-2">
            {proximosSlots.map((s) => (
              <li
                key={s.numero}
                className="rounded-[var(--radius-control)] border border-line bg-bg px-3 py-1.5 text-xs"
              >
                {s.numero}º slot ·{" "}
                <b className="text-gold">{s.preco} Paletas</b>
              </li>
            ))}
          </ul>
          <p className="text-muted">
            Cada plano VIP já vem com mais slots grátis, e o preço só conta a
            partir do primeiro slot pago.
          </p>
        </Secao>

        {/* ------------------------------------------------------- mercado */}
        <Secao
          id="mercado"
          titulo="Mercado entre jogadores"
          resumo="Anuncie o que está no cofre e venda para qualquer pessoa da comunidade, a qualquer hora."
        >
          <p>
            Preço entre <b>{PRECO_MINIMO}</b> e <b>{PRECO_MAXIMO}</b> Paletas,
            no máximo <b>{MAX_ANUNCIOS_ATIVOS} anúncios ativos</b> por pessoa.
            O teto existe para um zero a mais no teclado não virar anúncio de
            999999.
          </p>
          <p>
            <b>A taxa é em degraus, não em porcentagem</b> — 5% de 10 Paletas
            arredondaria para zero justamente onde há mais volume:
          </p>
          <ul className="space-y-1">
            {exemplosDeTaxa.map((e) => (
              <li key={e.preco} className="text-muted">
                anúncio de <b className="text-text">{e.preco}</b> → taxa de{" "}
                <b className="text-text">{e.taxa}</b> → você recebe{" "}
                <b className="text-gold">{e.recebe}</b>
              </li>
            ))}
          </ul>
          <p className="text-muted">
            A taxa é <b className="text-text">queimada</b>: não vai para
            ninguém, some da economia. É o que segura a inflação das Paletas.
          </p>
          <p>
            <Link href="/mercado" className="text-gold hover:underline">
              Ver o mercado
            </Link>{" "}
            ·{" "}
            <Link href="/mercado/vender" className="text-gold hover:underline">
              Anunciar
            </Link>
          </p>
        </Secao>

        {/* ------------------------------------------------------- ranking */}
        <Secao
          id="ranking"
          titulo="Ranking e mapa"
          resumo="A comunidade inteira medida pelos dados do próprio mundo."
        >
          <p>
            O{" "}
            <Link href="/ranking" className="text-gold hover:underline">
              ranking
            </Link>{" "}
            mostra nível, quantidade de Pals e as guilds, lido direto do save
            do servidor por um robô que roda de tempos em tempos — por isso um
            número pode estar algumas horas atrasado.
          </p>
          <p>
            O{" "}
            <Link href="/mapa" className="text-gold hover:underline">
              mapa
            </Link>{" "}
            e a página de{" "}
            <Link href="/servidores" className="text-gold hover:underline">
              servidores
            </Link>{" "}
            mostram o estado de cada mundo: quem está online, as taxas e as
            regras de cada um.
          </p>
        </Secao>

        {/* ------------------------------------------------------- eventos */}
        <Secao
          id="eventos"
          titulo="Eventos"
          resumo="Mural onde a organização publica o que vai rolar, com prêmios em Paletas."
        >
          <p>
            Os{" "}
            <Link href="/eventos" className="text-gold hover:underline">
              eventos
            </Link>{" "}
            aparecem com data, servidor e imagens. O evento em destaque também
            vai para a primeira página do site. Prêmio de evento cai direto na
            sua carteira.
          </p>
        </Secao>

        {/* ----------------------------------------------------------- vip */}
        <Secao
          id="vip"
          titulo="VIP e doação"
          resumo="Sustentar o servidor e, de quebra, ganhar mais espaço e mais daily."
        >
          <p>
            Os planos são cargos no Discord. Assim que o cargo é dado, os
            benefícios de site valem <b>automaticamente</b>:
          </p>
          <ul className="space-y-1">
            {PLANOS.map((p) => (
              <li key={p.key} className="text-muted">
                <b className="text-text">{p.nome}</b> — daily de{" "}
                <b className="text-gold">{p.dailyPaletas}</b> Paletas e{" "}
                <b className="text-gold">{p.slotsCofre}</b> slots de cofre
                grátis
              </li>
            ))}
          </ul>
          <p className="text-muted">
            Os benefícios <i>dentro do jogo</i> (kits, moedas, boosters,
            whitelist) são entregues pela administração, não pelo site. A lista
            completa está em{" "}
            <Link href="/vip" className="text-gold hover:underline">
              VIP
            </Link>
            .
          </p>
        </Secao>

        {/* ----------------------------------------------------- problemas */}
        <Secao
          id="problemas"
          titulo="Deu problema no jogo"
          resumo="O que a administração consegue resolver, e o que não tem volta."
        >
          <p>
            <b>Perdeu a base sem saber por quê?</b> O servidor apaga
            automaticamente a base de qualquer guild que fique{" "}
            <b className="text-text">72 horas sem ninguém entrar</b>. Não é bug
            nem outro jogador: é uma regra do próprio Palworld, ligada para o
            mundo não encher de base abandonada.
          </p>
          <p>
            A administração <b>consegue restaurar</b> base e Pals a partir de
            um backup, se ainda houver um recente o bastante que os tenha.
            Quanto antes avisar, maior a chance — os backups vão sendo
            substituídos com o tempo. Fale no Discord.
          </p>
          <p className="text-muted">
            Para não perder de novo: entre pelo menos uma vez a cada três dias,
            ou deixe alguém da guild entrar. Um único login zera o contador
            para a guild toda.
          </p>
        </Secao>
      </div>

      {/* --------------------------------------------------------- fechamento */}
      <div className="mt-10 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-gold/30 bg-gold/[0.06] p-6">
        <Pick className="size-5 shrink-0" withLetter={false} />
        <p className="text-sm">
          Ficou faltando alguma coisa? Pergunte no Discord da comunidade — a
          resposta costuma virar um parágrafo novo aqui.
        </p>
      </div>
    </div>
  );
}
