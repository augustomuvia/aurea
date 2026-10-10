import type { Metadata } from "next";
import { OfflineLibrary } from "@/components/offline/OfflineLibrary";

// Página estática: o service worker guarda-a e abre-a quando não há rede.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Downloads offline",
  description: "Os sons AUREA guardados neste telemóvel, para ouvir sem rede.",
  robots: { index: false },
};

export default function OfflinePage() {
  return <OfflineLibrary />;
}
