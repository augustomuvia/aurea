import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { EbookLanding } from "@/components/ebook/EbookLanding";
import { ebookMediaUrl, getEbookRow } from "@/lib/ebook/server";

export const metadata = { title: { absolute: "Pré-visualização · AUREA Guide" } };

/** Pré-visualização do rascunho (ou da versão publicada) — só para o super admin, mesmo com a página desativada. */
export default async function EbookPreview({ searchParams }: { searchParams: Promise<{ versao?: string }> }) {
  await requireSuperAdmin();
  const { versao } = await searchParams;
  const row = await getEbookRow();
  const showPublished = versao === "publicada" && row.published;
  const config = showPublished && row.published ? row.published : row.draft;
  return (
    <>
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-gold/25 bg-ink/90 px-4 py-2.5 text-center text-xs text-gold-light backdrop-blur">
        <span>
          Pré-visualização · {showPublished ? "versão publicada" : "rascunho"} · página {row.enabled ? "ativa" : "desativada"}. O botão de compra não abre o checkout aqui.
        </span>
        <Link href="/admin/ebook" className="underline underline-offset-4 hover:text-paper">Voltar ao painel</Link>
      </div>
      <EbookLanding
        config={config}
        coverUrl={ebookMediaUrl(config.media.cover)}
        previewUrls={config.media.previews.map((p) => ebookMediaUrl(p)).filter((u): u is string => Boolean(u))}
        buyHref={null}
      />
    </>
  );
}
