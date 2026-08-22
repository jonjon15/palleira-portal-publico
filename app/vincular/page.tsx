import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Pick } from "@/components/pick";
import {
  meuVinculo,
  meuPedido,
  personagensOnline,
  servidoresSemRcon,
} from "@/lib/linking";
import {
  acaoCancelar,
  acaoDesvincular,
  acaoAtualizarLista,
} from "./actions";
import { EscolherPersonagem, DigitarCodigo } from "./formularios";

export const metadata: Metadata = {
  title: "Vincular personagem",
  description:
    "Ligue sua conta do Discord ao seu personagem no jogo para usar a carteira e o mercado da Palleira.",
};

// A lista de quem está online muda a cada minuto — nada aqui pode ser servido
// de cache estático.
export const dynamic = "force-dynamic";

export default async function Vincular() {
  const session = await auth();
  if (!session) redirect("/entrar");

  const discordId = session.user.discordId;
  const [vinculo, pendente] = await Promise.all([
    meuVinculo(discordId),
    meuPedido(discordId),
  ]);

  // Só vale procurar quem está online se ainda houver o que vincular.
  const personagens = vinculo || pendente ? [] : await personagensOnline();
  const semRcon = servidoresSemRcon();

  return (
    <>
      <PageHeader
        kicker="Vincular"
        title="Conecte seu personagem"
        description="A gente manda um código dentro do jogo. Você digita aqui e pronto — a conta é sua, provada."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {!session.user.isMember && (
          <div className="mb-6 rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-5">
            <h2 className="font-semibold">Você ainda não está no Palleira BR</h2>
            <p className="mt-1.5 text-sm text-muted">
              O vínculo é só para quem está na comunidade. Entre no Discord e
              volte aqui.
            </p>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            {vinculo ? (
              <Vinculado
                nome={vinculo.playerName}
                servidor={vinculo.serverName}
                desde={vinculo.linkedAt}
              />
            ) : pendente ? (
              <Passo
                numero={2}
                titulo="Digite o código"
                texto={`Mandamos 6 dígitos no chat do ${pendente.serverName}. Abra o jogo, olhe o chat e traga o número para cá.`}
              >
                <DigitarCodigo pendente={pendente} />
                <form action={acaoCancelar} className="mt-4">
                  <button
                    type="submit"
                    className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
                  >
                    Não recebi — escolher outro personagem
                  </button>
                </form>
              </Passo>
            ) : personagens.length > 0 ? (
              <Passo
                numero={1}
                titulo="Qual desses é você?"
                texto="Estes são os personagens conectados agora. Escolha o seu e a gente manda o código direto no chat do jogo."
              >
                <EscolherPersonagem personagens={personagens} />
              </Passo>
            ) : (
              <NinguemOnline />
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <div className="flex items-center gap-2">
                <Pick className="size-4" withLetter={false} />
                <h2 className="font-semibold">Como funciona</h2>
              </div>
              <ol className="mt-3 space-y-2.5 text-sm text-muted">
                <li>1. Entre no jogo com o personagem que quer vincular.</li>
                <li>2. Escolha ele na lista aqui do lado.</li>
                <li>3. O código chega no chat do jogo, valendo 10 minutos.</li>
                <li>4. Digite o código aqui. Pronto.</li>
              </ol>
            </div>

            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <h2 className="font-semibold">Por que tudo isso?</h2>
              <p className="mt-2 text-sm text-muted">
                Quem recebe o código no chat é quem está com o personagem na
                mão. É a única prova que não dá para forjar — e é ela que segura
                a carteira de Paletas e o mercado.
              </p>
            </div>

            {semRcon.length > 0 && (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <h2 className="font-semibold">
                  {semRcon.map((s) => s.shortName).join(" e ")} ainda não
                </h2>
                <p className="mt-2 text-sm text-muted">
                  O canal que leva o código até o jogo está desligado nesse
                  servidor. Assim que ligar, ele aparece aqui.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- pedaços */

function Passo({
  numero,
  titulo,
  texto,
  children,
}: {
  numero: number;
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-sm font-bold text-gold">
          {numero}
        </span>
        <h2 className="text-lg font-semibold">{titulo}</h2>
      </div>
      <p className="mt-2 max-w-xl text-sm text-muted">{texto}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Vinculado({
  nome,
  servidor,
  desde,
}: {
  nome: string;
  servidor: string;
  desde: string;
}) {
  const data = new Date(desde).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="rounded-[var(--radius-card)] border border-success/30 bg-success/[0.06] p-6">
      <p className="text-xs font-bold tracking-[0.18em] text-success uppercase">
        Vinculado
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight">{nome}</h2>
      <p className="mt-1 text-sm text-muted">
        {servidor} · desde {data}
      </p>
      <p className="mt-4 max-w-xl text-sm text-muted">
        Tudo que você fizer no jogo com esse personagem conta para a sua conta
        aqui: placar, carteira e, em breve, o mercado.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link
          href="/painel"
          className="inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
        >
          Ir para o painel
        </Link>
        <form action={acaoDesvincular}>
          <button
            type="submit"
            className="text-sm text-muted underline-offset-4 hover:text-danger hover:underline"
          >
            Desvincular personagem
          </button>
        </form>
      </div>
    </section>
  );
}

function NinguemOnline() {
  return (
    <section className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6">
      <h2 className="text-lg font-semibold">Entre no jogo primeiro</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Não achamos nenhum personagem disponível conectado agora. O código
        chega pelo chat do jogo, então o seu personagem precisa estar online
        para aparecer nesta lista.
      </p>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Se você já está jogando, espere um minutinho e recarregue — a lista
        acompanha o servidor com um pequeno atraso.
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link
          href="/conectar"
          className="inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
        >
          Como entrar no servidor
        </Link>
        <form action={acaoAtualizarLista}>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-line px-5 py-2.5 font-semibold transition-colors hover:border-line-strong"
          >
            Recarregar lista
          </button>
        </form>
      </div>
    </section>
  );
}
