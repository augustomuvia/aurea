import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/Glass";
import { ContentForm } from "@/components/admin/ContentForm";
import { AudioUploader } from "@/components/admin/AudioUploader";
import { FormMessage } from "@/components/ui/FormMessage";

export const metadata = { title: "Editar conteúdo" };

export default async function EditContent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const { criado } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const svc = createServiceClient();
  const [{ data: c }, { data: media }, { data: links }, { data: categories }] = await Promise.all([
    svc.from("content_items").select("*").eq("id", id).maybeSingle(),
    svc.from("content_media").select("youtube_url, audio_path").eq("content_id", id).maybeSingle(),
    svc.from("content_categories").select("category_id").eq("content_id", id),
    svc.from("categories").select("id, name").order("sort_order"),
  ]);
  if (!c) notFound();
  return (
    <>
      <Link href="/admin/conteudos" className="text-sm text-mute hover:text-paper">← Conteúdos</Link>
      <PageHeader eyebrow="Catálogo" title={c.title} />
      {criado && <div className="mb-5"><FormMessage state={{ ok: true, message: "Conteúdo criado." }} /></div>}
      <ContentForm
        categories={categories ?? []}
        values={{
          id: c.id,
          title: c.title,
          slug: c.slug,
          description: c.description,
          youtubeUrl: media?.youtube_url ?? `https://www.youtube.com/watch?v=${c.youtube_video_id}`,
          declaredFrequencyHz: c.declared_frequency_hz,
          durationSeconds: c.duration_seconds,
          coverUrl: c.cover_url ?? "",
          categoryIds: (links ?? []).map((l) => l.category_id),
          recommendedUse: c.recommended_use,
          tags: c.tags,
          isPremium: c.is_premium,
          isBinaural: c.is_binaural,
          isFeatured: c.is_featured,
          featuredOrder: c.featured_order,
          status: c.status,
        }}
      />
      <AudioUploader contentId={c.id} current={media?.audio_path ?? null} />
    </>
  );
}
