import type { Metadata } from "next";
import { Geist, Geist_Mono, Anton } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
/**
 * A fonte que o próprio Palworld usa nos títulos grandes e no logo (achada
 * via FModel em `Pal/Content/Pal/Font/Anton-Regular_Font`, 23/08/2026) — e
 * por sorte é a "Anton" do Google Fonts de verdade, licença aberta (SIL OFL),
 * sem nenhuma das ressalvas de licença que uma fonte comercial teria. Só
 * existe no peso 400 — a fonte já nasce condensada e "black" por desenho.
 */
const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "Palleira BR — o servidor mais rock and roll de Palworld",
    template: "%s · Palleira BR",
  },
  description:
    "Portal da comunidade Palleira BR: status dos servidores ao vivo, mercado de Pals e itens em Paletas, ranking de guilds e eventos.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
