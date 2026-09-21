import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ServerCard } from "@/components/server-card";
import { BlocoDeRegras, DOMINANTES } from "@/lib/regras-dominantes";
import { serverBySlug } from "@/lib/servers";
import { getMetrics, getRates } from "@/lib/palworld/rest";

const SLUG = "pvp-free";

export const metadata: Metadata = {
  title: "Dominantes",
  description:
    "Tudo do servidor Dominantes num lugar só: status ao vivo, regras e como entrar.",
};

export const revalidate = 60;

/**
 * O hub do Dominantes (pedido do dono, 21/09/2026): status, regras e como
 * conectar juntos numa página só, em vez de espalhados por /servidores,
 * /regras e /conectar.
 *
 * 🔴 De propósito, isto NÃO substitui as outras páginas — o mesmo conteúdo
 * segue existindo em /regras (seção Dominantes) e /servidores (card do
 * Dominantes no meio dos três mundos). Só as regras são código
 * compartilhado (`lib/regras-dominantes.tsx`); status e link de conectar
 * são buscados de novo aqui, do jeito mais simples possível — replicar a
 * consulta é mais barato que fazer esta página depender da estrutura das
 * outras duas.
 *
 * O ranking (jogadores, guilds) não é reconstruído aqui: `/ranking/dominantes`
 * já existe, já é só do Dominantes, e duplicar a tabela inteira (com a
 * leitura ao vivo do PalDefender) só para caber nesta página não valeria o
 * custo — um link resolve.
 */
export default async function Dominantes() {
  const server = serverBySlug(SLUG);
  if (!server) {
    return (
      <>
        <PageHeader kicker="Servidor" title="Dominantes" />
        <div className="mx-auto max-w-3xl px-4 py-12 text-muted">
          Servidor fora do ar no momento.
        </div>
      </>
    );
  }

  const [metrics, rates] = await Promise.all([
    getMetrics(server).catch(() => null),
    getRates(server).catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        kicker="Servidor"
        title="Dominantes"
        description="O mundo PvP da Palleira — elementos, território e disputa livre no mapa."
      />

      <div className="mx-auto max-w-3xl px-4 py-12">
        {/* --------------------------------------------------------- status */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight">Status ao vivo</h2>
          <div className="mt-5">
            <ServerCard server={server} metrics={metrics} rates={rates} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link
              href="/ranking/dominantes"
              className="font-semibold text-gold hover:text-gold-hi"
            >
              Ver o ranking completo →
            </Link>
            <Link
              href="/conectar"
              className="font-semibold text-gold hover:text-gold-hi"
            >
              Como entrar no servidor →
            </Link>
          </div>
        </section>

        {/* --------------------------------------------------------- regras */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Regras</h2>
          <p className="mt-1 text-sm text-muted">
            Além das regras gerais da comunidade, em{" "}
            <Link href="/regras" className="text-gold hover:text-gold-hi">
              /regras
            </Link>
            .
          </p>
          <BlocoDeRegras secoes={DOMINANTES} />
        </section>
      </div>
    </>
  );
}
