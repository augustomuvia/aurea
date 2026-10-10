import "server-only";
import { createClient } from "@/lib/supabase/server";
import { youtubeThumbnail } from "@/lib/youtube";
import { audioSrc } from "@/lib/audio";
import type { Category, ContentItem, PlayableTrack } from "@/lib/types";

export type CatalogItem = ContentItem & {
  content_media: { youtube_video_id: string; audio_path?: string | null } | null;
};

export const CONTENT_SELECT = "*, content_categories(categories(slug, name)), content_media(youtube_video_id, audio_path)";

export function coverOf(item: Pick<ContentItem, "cover_url" | "youtube_video_id">) {
  return item.cover_url || youtubeThumbnail(item.youtube_video_id);
}

export function primaryCategory(item: CatalogItem): string | null {
  return item.content_categories?.[0]?.categories?.name ?? null;
}

/** Só devolve uma faixa reproduzível se a BD (RLS) tiver libertado o media. */
export function toTrack(item: CatalogItem): PlayableTrack | null {
  if (!item.content_media) return null;
  return {
    contentId: item.id,
    slug: item.slug,
    title: item.title,
    category: primaryCategory(item),
    frequencyHz: item.declared_frequency_hz,
    isBinaural: item.is_binaural,
    coverUrl: coverOf(item),
    videoId: item.content_media.youtube_video_id,
    audioUrl: item.content_media.audio_path ? audioSrc(item.id) : null,
    durationSeconds: item.duration_seconds,
  };
}

function sanitizeQuery(q: string) {
  return q
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export interface CatalogFilters {
  category?: string;
  q?: string;
  use?: string;
  duration?: "curta" | "media" | "longa";
  featured?: boolean;
  limit?: number;
  ids?: string[];
  order?: "recent" | "featured";
}

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

export async function listContent(filters: CatalogFilters = {}): Promise<CatalogItem[]> {
  if (!configured()) return [];
  const supabase = await createClient();
  let ids: string[] | undefined = filters.ids;

  if (filters.category) {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", filters.category).maybeSingle();
    if (!cat) return [];
    const { data: links } = await supabase.from("content_categories").select("content_id").eq("category_id", cat.id);
    const catIds = (links ?? []).map((l) => l.content_id as string);
    ids = ids ? ids.filter((i) => catIds.includes(i)) : catIds;
    if (!ids.length) return [];
  }

  let query = supabase.from("content_items").select(CONTENT_SELECT).eq("status", "published");
  if (ids) query = query.in("id", ids);
  if (filters.featured) query = query.eq("is_featured", true);
  if (filters.use) query = query.contains("recommended_use", [filters.use]);
  if (filters.duration === "curta") query = query.lt("duration_seconds", 900);
  if (filters.duration === "media") query = query.gte("duration_seconds", 900).lte("duration_seconds", 3600);
  if (filters.duration === "longa") query = query.gt("duration_seconds", 3600);
  if (filters.q) {
    const q = sanitizeQuery(filters.q);
    if (q) {
      const tag = q.toLowerCase().replace(/\s+/g, "-");
      // Também encontra conteúdos pelo nome da categoria (ex.: "sono", "foco").
      const { data: cats } = await supabase.from("categories").select("id").ilike("name", `%${q}%`).limit(20);
      const { data: catLinks } = cats?.length
        ? await supabase.from("content_categories").select("content_id").in("category_id", cats.map((c) => c.id)).limit(500)
        : { data: [] };
      const byCategory = [...new Set((catLinks ?? []).map((l) => l.content_id as string))];
      const clauses = [`title.ilike.%${q}%`, `description.ilike.%${q}%`, `tags.cs.{${tag}}`];
      if (byCategory.length) clauses.push(`id.in.(${byCategory.join(",")})`);
      query = query.or(clauses.join(","));
    }
  }
  query =
    filters.order === "featured" || filters.featured
      ? query.order("featured_order", { ascending: true }).order("published_at", { ascending: false })
      : query.order("published_at", { ascending: false, nullsFirst: false });
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) {
    console.error("[catalog] listContent", error.message);
    return [];
  }
  return (data ?? []) as unknown as CatalogItem[];
}

export async function getContentBySlug(slug: string): Promise<CatalogItem | null> {
  if (!/^[a-z0-9-]{2,90}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("content_items").select(CONTENT_SELECT).eq("slug", slug).eq("status", "published").maybeSingle();
  return (data as unknown as CatalogItem) ?? null;
}

export async function listCategories(): Promise<Category[]> {
  if (!configured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").order("sort_order");
  return (data ?? []) as Category[];
}

export async function getFavoriteIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("favorites").select("content_id").eq("user_id", userId);
  return (data ?? []).map((f) => f.content_id as string);
}

export interface HistoryEntry {
  content_id: string;
  position_seconds: number;
  duration_seconds: number | null;
  play_count: number;
  last_played_at: string;
}

export async function getHistory(userId: string, limit = 30): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listening_history")
    .select("content_id, position_seconds, duration_seconds, play_count, last_played_at")
    .eq("user_id", userId)
    .order("last_played_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as HistoryEntry[];
}

/** Mantém a ordem dos ids pedidos. */
export async function contentByIds(ids: string[]): Promise<CatalogItem[]> {
  if (!ids.length) return [];
  const items = await listContent({ ids });
  const map = new Map(items.map((i) => [i.id, i]));
  return ids.map((id) => map.get(id)).filter((x): x is CatalogItem => Boolean(x));
}

/** Recomendações simples: categorias preferidas + categorias mais ouvidas, sem promessas terapêuticas. */
export async function recommendations(userId: string, limit = 8): Promise<CatalogItem[]> {
  const supabase = await createClient();
  const [{ data: prefs }, history] = await Promise.all([
    supabase.from("user_preferences").select("preferred_categories").eq("user_id", userId).maybeSingle(),
    getHistory(userId, 20),
  ]);
  const heard = new Set(history.map((h) => h.content_id));
  const slugs = new Set<string>((prefs?.preferred_categories as string[] | undefined) ?? []);

  if (history.length) {
    const { data: links } = await supabase
      .from("content_categories")
      .select("categories(slug)")
      .in("content_id", history.map((h) => h.content_id));
    for (const l of (links ?? []) as unknown as { categories: { slug: string } | null }[]) if (l.categories) slugs.add(l.categories.slug);
  }

  const pools = await Promise.all([...slugs].slice(0, 4).map((s) => listContent({ category: s, limit: 12 })));
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const item of pools.flat()) {
    if (seen.has(item.id) || heard.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
