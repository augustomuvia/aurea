import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { contentByIds } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import { Grid } from "@/components/catalog/Shelf";
import { EmptyState, PageHeader } from "@/components/ui/Glass";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Favoritos" };

export default async function FavoritesPage() {
  const user = await requireUser("/app/favoritos");
  const supabase = await createClient();
  const { data } = await supabase.from("favorites").select("content_id").eq("user_id", user.id).order("created_at", { ascending: false });
  const items = await contentByIds((data ?? []).map((f) => f.content_id as string));
  return (
    <>
      <PageHeader eyebrow="A sua coleção" title="Favoritos" />
      {items.length ? (
        <Grid items={items} />
      ) : (
        <EmptyState icon={Heart} title="Ainda sem favoritos" action={<ButtonLink href="/app/biblioteca" variant="glass">Explorar biblioteca</ButtonLink>}>
          Toque no coração de um conteúdo para o guardar aqui.
        </EmptyState>
      )}
    </>
  );
}
