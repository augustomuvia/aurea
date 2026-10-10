import type { MetadataRoute } from "next";

/** Permite "Adicionar ao ecrã principal" como uma app, com o logótipo AUREA. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AUREA",
    short_name: "AUREA",
    description: "Experiências sonoras para concentração, descanso, meditação e relaxamento.",
    lang: "pt",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
