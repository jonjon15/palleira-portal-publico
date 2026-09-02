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
  canManageEvents,
} from "@/lib/roles";
import { meuVinculo, meusPersonagens } from "@/lib/linking";
import { saldo, jaPegouODaily, DAILY_PALETAS } from "@/lib/economia";
import { meuCofre } from "@/lib/cofre";
import { meusAnuncios } from "@/lib/mercado";

export const metadata: Metadata = { title: "Meu painel" };

export default async function Painel() {
  const session = await auth();
  if (!session) redirect("/entrar");

  const { user } = session;
  const level = levelOf(user.roles, user.isMember);
  const plano = planoOf(user.roles);
  const [vinculo, personagens, paletas, pegouDaily, cofre, anuncios] =
    await Promise.all([
      meuVinculo(user.discordId),
      // Um vínculo, vários personagens: o UID é o mesmo nos três servidores.
      meusPersonagens(user.discordId),
      saldo(user.discordId),
      jaPegouODaily(user.discordId),
      meuCofre(user.discordId),
      meusAnuncios(user.discordId),
    ]);
  const anunciosAtivos = anuncios.filter((a) => a.status === "ativo").length;

  return (
    <>
      <PageHeader
        kicker="Painel"
        title={`Salve, ${user.nick || user.name || "roqueiro"}`}
        description="Sua central na Palleira: carteira, personagem, cofre e mercado."
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
                ? personagens.length > 1
                  ? `${vinculo.playerName} · em ${personagens.length} servidores`
                  : `${vinculo.playerName} · ${personagens[0]?.serverName ?? vinculo.serverName}`
                : "Prove que o personagem é seu com um código no chat do jogo."
            }
            href="/vincular"
            done={Boolean(vinculo)}
          />
          <Card
            title="Cofre"
            body={
              cofre.usados > 0
                ? `${cofre.usados} de ${cofre.total} slots · pronto para anunciar`
                : "Guarde item fora do jogo e venda quando quiser, mesmo offline."
            }
            href="/painel/cofre"
          />
          <Card
            title="Meus anúncios"
            body={
              anunciosAtivos > 0
                ? `${anunciosAtivos} no ar no mercado`
                : "O que você colocou à venda no mercado."
            }
            href="/painel/anuncios"
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
          {canManageEvents(level, user.roles) && (
            <Card
              title="Eventos"
              body="Escrever no mural — o que aparece em /eventos e na home."
              href="/admin/eventos"
            />
          )}
        </div>

        {personagens.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Seus personagens</h2>
            <p className="mt-1 text-sm text-muted">
              O vínculo é um só e vale em todos os servidores. Estes números
              vêm do save, então valem mesmo com você offline.
            </p>
            <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {personagens.map((p) => (
                <li
                  key={`${p.serverSlug}:${p.name}`}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-sm text-muted">{p.serverName}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-bold">Nível {p.level}</p>
                    <p className="tabular text-xs text-muted">
                      {p.palCount} {p.palCount === 1 ? "Pal" : "Pals"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
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
