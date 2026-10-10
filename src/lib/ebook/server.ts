import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { serverEnv, serviceRoleKeyOrNull } from "@/lib/env";
import { checkCheckoutUrl, DEFAULT_EBOOK, resolveEbookConfig, type EbookConfig } from "./config";

export const EBOOK_MEDIA_BUCKET = "ebook-media";

export interface EbookRow {
  exists: boolean;
  enabled: boolean;
  draft: EbookConfig;
  published: EbookConfig | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

/** Estado completo para o admin (rascunho + publicado). */
export async function getEbookRow(): Promise<EbookRow> {
  const empty: EbookRow = { exists: false, enabled: false, draft: structuredClone(DEFAULT_EBOOK), published: null, publishedAt: null, updatedAt: null };
  if (!serviceRoleKeyOrNull()) return empty;
  const { data, error } = await createServiceClient().from("ebook_page").select("*").eq("id", 1).maybeSingle();
  if (error) {
    console.error("[ebook] leitura", error.message);
    return empty;
  }
  if (!data) return empty;
  return {
    exists: true,
    enabled: Boolean(data.enabled),
    draft: resolveEbookConfig(data.draft),
    published: data.published ? resolveEbookConfig(data.published) : null,
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
  };
}

export type PublicEbook = { config: EbookConfig; checkoutUrl: string };

/**
 * O que o público pode ver: só quando a página está ativa, publicada e com um
 * checkout válido. Caso contrário devolve null e a rota responde 404.
 */
export const getPublicEbook = cache(async (): Promise<PublicEbook | null> => {
  const row = await getEbookRow();
  if (!row.enabled || !row.published) return null;
  const check = checkCheckoutUrl(row.published.checkoutUrl, serverEnv.ebookCheckoutHosts);
  if (!check.ok) return null;
  return { config: row.published, checkoutUrl: check.url };
});

export function ebookMediaUrl(path: string | null): string | null {
  if (!path) return null;
  return createServiceClient().storage.from(EBOOK_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
