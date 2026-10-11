import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { resolveSiteUrl } from "@/lib/env";
import { MetaPixel } from "@/components/analytics/MetaPixel";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const editorial = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-editorial", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  title: { default: "AUREA — Encontre o seu estado de equilíbrio", template: "%s · AUREA" },
  description: "Experiências sonoras cuidadosamente selecionadas para concentração, descanso, meditação e relaxamento.",
  openGraph: { title: "AUREA", description: "Um espaço para desacelerar.", locale: "pt_AO", type: "website" },
  applicationName: "AUREA",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // iPhone: ao adicionar ao ecrã principal abre em ecrã inteiro com o nome AUREA.
  appleWebApp: { capable: true, title: "AUREA", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className={`${geist.variable} ${editorial.variable}`}>
      <body>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-ink">
          Saltar para o conteúdo
        </a>
        {children}
        <MetaPixel />
      </body>
    </html>
  );
}
