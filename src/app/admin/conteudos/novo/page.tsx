import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/Glass";
import { ContentForm } from "@/components/admin/ContentForm";

export const metadata = { title: "Novo conteúdo" };

export default async function NewContent() {
  await requireSuperAdmin();
  const { data: categories } = await createServiceClient().from("categories").select("id, name").order("sort_order");
  return (
    <>
      <Link href="/admin/conteudos" className="text-sm text-mute hover:text-paper">← Conteúdos</Link>
      <PageHeader eyebrow="Catálogo" title="Novo conteúdo">
        Use apenas vídeos cuja incorporação é permitida pelo proprietário. O vídeo é verificado no YouTube ao guardar.
      </PageHeader>
      <ContentForm
        categories={categories ?? []}
        values={{ title: "", slug: "", description: "", youtubeUrl: "", declaredFrequencyHz: null, durationSeconds: null, coverUrl: "", categoryIds: [], recommendedUse: [], tags: [], isPremium: true, isBinaural: false, isFeatured: false, featuredOrder: 0, status: "draft" }}
      />
    </>
  );
}
