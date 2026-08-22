import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { activeServers } from "@/lib/servers";
import { getRates, type ServerRates } from "@/lib/palworld/rest";

export const metadata: Metadata = {
  title: "Como jogar",
  description:
    "Como entrar nos servidores da Palleira BR: passo a passo, taxas de cada mundo e regras.",
};

export const revalidate = 600;

const STEPS = [
  {
    title: "Abra o multijogador no Palworld",
    body: "No menu inicial, escolha Participar no modo multijogador. Não precisa de IP nem de código de convite.",
  },
  {
    title: 'Busque por "Palleira"',
    body: "Na lista de servidores dedicados, pesquise Palleira. Nossos mundos aparecem direto ali — funciona em Steam, Xbox e PlayStation.",
  },
  {
    title: "Escolha o seu mundo",
    body: "O PVE Free é aberto e recebe todo mundo. O PVE VIP tem whitelist: entra quem é VIP da comunidade.",
  },
  {
    title: "Vincule sua conta",
    body: "Depois de entrar, vincule o personagem ao seu Discord para usar a carteira de Paletas, o mercado e aparecer no ranking.",
  },
];

function RateRow({
  label,
  values,
}: {
  label: string;
  values: (string | null)[];
}) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-2.5 pr-4 text-left font-normal text-muted">
        {label}
      </th>
      {values.map((v, i) => (
        <td key={i} className="tabular py-2.5 pr-4 font-semibold">
          {v ?? "—"}
        </td>
      ))}
    </tr>
  );
}

export default async function Conectar() {
  const servers = activeServers();
  const rates = await Promise.all(
    servers.map((s) => getRates(s).catch(() => null)),
  );

  const col = (pick: (r: ServerRates) => string) =>
    rates.map((r) => (r ? pick(r) : null));

  return (
    <>
      <PageHeader
        kicker="Como jogar"
        title="Entrar na Palleira"
        description="Quatro passos e você está no mundo. Cross-platform: Steam, Xbox e PlayStation jogam juntos."
      />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
            >
              <span className="tabular flex size-7 items-center justify-center rounded-full bg-gold/12 text-sm font-bold text-gold">
                {i + 1}
              </span>
              <h2 className="mt-3 font-semibold">{step.title}</h2>
              <p className="mt-1.5 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>

        {/* Endereço não vai para página pública — a busca no jogo resolve, e
            host:porta exposto só facilita scan e ataque. */}
        <div className="mt-6 rounded-[var(--radius-card)] border border-gold/25 bg-gold/[0.06] p-5">
          <h2 className="font-semibold">Não achou na busca?</h2>
          <p className="mt-1.5 text-sm text-muted">
            A lista do jogo às vezes demora a atualizar. Chama no Discord que a
            staff resolve — e é lá também que você vira VIP para entrar no
            mundo com whitelist.
          </p>
          <Link
            href="/entrar"
            className="mt-4 inline-block rounded-[var(--radius-control)] bg-gold px-4 py-2 text-sm font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
          >
            Falar com a comunidade
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight">
            Taxas de cada mundo
          </h2>
          <p className="mt-1 text-sm text-muted">
            Lido direto do servidor agora. Se o admin mudar, essa tabela muda
            junto.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-md text-sm">
              <thead>
                <tr>
                  <th className="w-40 pb-2 text-left font-normal text-muted">
                    &nbsp;
                  </th>
                  {servers.map((s) => (
                    <th key={s.slug} className="pb-2 pr-4 text-left font-bold">
                      {s.shortName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <RateRow label="XP" values={col((r) => `${r.exp}x`)} />
                <RateRow label="Captura" values={col((r) => `${r.capture}x`)} />
                <RateRow
                  label="Drop de inimigo"
                  values={col((r) => `${r.enemyDrop}x`)}
                />
                <RateRow
                  label="Coleta"
                  values={col((r) => `${r.collectionDrop}x`)}
                />
                <RateRow
                  label="Peso de item"
                  values={col((r) =>
                    r.itemWeight === 0 ? "sem peso" : `${r.itemWeight}x`,
                  )}
                />
                <RateRow
                  label="Fôlego"
                  values={col((r) =>
                    r.staminaDrain === 0 ? "infinito" : "normal",
                  )}
                />
                <RateRow
                  label="Construções"
                  values={col((r) => String(r.maxBuildings))}
                />
                <RateRow
                  label="Pals na base"
                  values={col((r) => String(r.baseWorkers))}
                />
                <RateRow
                  label="Bases por guild"
                  values={col((r) => String(r.basesPerGuild))}
                />
                <RateRow
                  label="Jogadores por guild"
                  values={col((r) => String(r.guildSize))}
                />
                <RateRow
                  label="Vagas"
                  values={col((r) => String(r.maxPlayers))}
                />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
