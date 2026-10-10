import { notFound } from "next/navigation";
import { EbookLanding } from "@/components/ebook/EbookLanding";
import { ebookMediaUrl, getPublicEbook } from "@/lib/ebook/server";

/** Página pública do AUREA Guide. Desativada ou sem checkout válido → 404 (controlo no servidor). */
export default async function EbookPage() {
  const ebook = await getPublicEbook();
  if (!ebook) notFound();
  const { config } = ebook;
  return (
    <EbookLanding
      config={config}
      coverUrl={ebookMediaUrl(config.media.cover)}
      previewUrls={config.media.previews.map((p) => ebookMediaUrl(p)).filter((u): u is string => Boolean(u))}
      buyHref="/ebook/comprar"
    />
  );
}
