import type { Metadata } from "next";

// Página não divulgada: fora dos menus, sem indexação. (O cabeçalho X-Robots-Tag é definido em next.config.ts.)
export const metadata: Metadata = {
  title: { absolute: "AUREA Guide · Guia digital" },
  description: "Um guia digital em PDF para descobrires e explorares a plataforma apresentada no anúncio.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  openGraph: { title: "AUREA Guide", description: "Guia digital em PDF.", type: "website", locale: "pt_AO" },
};

export const dynamic = "force-dynamic";

export default function EbookLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-ink">{children}</main>;
}
