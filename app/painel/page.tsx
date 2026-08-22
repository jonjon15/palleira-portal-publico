import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { SignOut } from "@/components/sign-in-button";
import { Pick } from "@/components/pick";
import {
  levelOf,
  planoOf,
  LEVEL_LABEL,
  isStaff,
  canManageEconomy,
} from "@/lib/roles";
import { meuVinculo } from "@/lib/linking";
import { saldo, jaPegouODaily, DAILY_PALETAS } from "@/lib/economia";

export const metadata: Metadata = { title: "Meu painel" };

export default async function Painel() {
  const session = await auth();
  if (!session) redirect("/entrar");

  const { user } = session;
  const level = levelOf(user.roles, user.isMember);
  const plano = planoOf(user.roles);
  const [vinculo, paletas, pegouDaily] = await Promise.all([
    meuVinculo(user.discordId),
    saldo(user.discordId),
    jaPegouODaily(user.discordId),
  ]);

  return (
    <>
      <PageHeader
        kicker="Painel"
        title={`Salve, ${user.nick || user.name || "roqueiro"}`}
        description="Sua central na Palleira. Carteira e personagem já funcionam — o mercado vem a seguir."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* Não é membro do servidor: mostra o convite em vez de fingir que está tudo bem */}
        {!user.isMember && (
          <div className="mb-6 rounded-[var(--radius-card)] border border-warning/30 bg-warning/[0.07] p-5">
            <h2 className="font-semibold">Você ainda não está no Palleira BR</h2>
            <p className="mt-1.5 text-sm text-muted">
              O login funcionou, mas você não aparece como membro do nosso
              Discord. Entre na comunidade para liberar carteira, mercado e
              ranking.
            </p>
          </div>
        )}

        <div className="flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          {user.image && (
            <Image
              src={user.image}
              alt=""
              width={56}
              height={56}
              className="rounded-full"
              unoptimized
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {user.nick || user.name}
              {user.isMember && (
                <span
                  className={`ml-2 rounded-full border px-2 py-0.5 align-middle text-[0.65rem] font-bold tracking-wider uppercase ${
                    isStaff(level)
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-success/30 bg-success/10 text-success"
                  }`}
                >
                  {LEVEL_LABEL[level]}
                </span>
              )}
              {plano && (
                <span className="ml-1.5 rounded-full border border-line px-2 py-0.5 align-middle text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                  Plano {plano.nome}
                </span>
              )}
            </p>
            <p className="tabular truncate text-sm text-muted">
              Discord {user.discordId}
            </p>
          </div>
          <SignOut />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Carteira de Paletas"
            body={
              vinculo && !pegouDaily
                ? `${paletas} no saldo · o daily de ${DAILY_PALETAS} está esperando`
                : `${paletas} ${paletas === 1 ? "Paleta" : "Paletas"} · extrato de tudo que entrou e saiu`
            }
            href="/painel/carteira"
          />
          <Card
            title={vinculo ? "Personagem vinculado" : "Vincular personagem"}
            body={
              vinculo
                ? `${vinculo.playerName} · ${vinculo.serverName}`
                : "Prove que o personagem é seu com um código no chat do jogo."
            }
            href="/vincular"
            done={Boolean(vinculo)}
          />
          <Card
            title="Meus anúncios"
            body="O que você colocou à venda no mercado."
            soon
          />
          <Card
            title="Placar"
            body="Veja onde você está no ranking da comunidade."
            href="/ranking"
          />
          {canManageEconomy(level) && (
            <Card
              title="Economia"
              body="Trazer saldos do Palbot, ajustar carteira e ver a circulação."
              href="/admin/economia"
            />
          )}
          {isStaff(level) && (
            <Card
              title="Moderação"
              body="Jogadores online, anúncio no jogo e log de auditoria."
              href="/admin/moderacao"
            />
          )}
        </div>
      </div>
    </>
  );
}

function Card({
  title,
  body,
  href,
  soon,
  done,
}: {
  title: string;
  body: string;
  href?: string;
  soon?: boolean;
  done?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Pick className="size-4" withLetter={false} />
        <h3 className="font-semibold">{title}</h3>
        {soon && (
          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[0.65rem] tracking-wide text-muted uppercase">
            Em breve
          </span>
        )}
        {done && (
          <span className="ml-auto rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-success uppercase">
            Feito
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted">{body}</p>
    </>
  );

  const base =
    "rounded-[var(--radius-card)] border border-line bg-surface p-5 block";

  return href ? (
    <Link href={href} className={`${base} transition-colors hover:border-line-strong`}>
      {inner}
    </Link>
  ) : (
    <div className={`${base} opacity-70`}>{inner}</div>
  );
}
