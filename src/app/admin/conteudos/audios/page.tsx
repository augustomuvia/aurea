import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/Glass";
import { BulkAudioUpload } from "@/components/admin/BulkAudioUpload";

export const metadata = { title: "Enviar áudios" };

export default async function BulkAudioPage() {
  await requireSuperAdmin();
  const { data: categories } = await createServiceClient().from("categories").select("id, name").order("sort_order");
  return (
    <>
      <Link href="/admin/conteudos" className="text-sm text-mute hover:text-paper">← Conteúdos</Link>
      <PageHeader eyebrow="Catálogo" title="Enviar áudios" />
      <BulkAudioUpload categories={categories ?? []} />
    </>
  );
}
