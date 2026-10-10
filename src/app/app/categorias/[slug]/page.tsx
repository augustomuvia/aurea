import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Waves } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listCategories, listContent } from "@/lib/catalog";
import { Filters } from "@/components/catalog/Filters";
import { Grid } from "@/components/catalog/Shelf";
import { EmptyState, PageHeader } from "@/components/ui/Glass";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; uso?: string; duracao?: string }> };

async function getCategory(slug: string) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  return { title: c?.name ?? "Categoria" };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = await getCategory(slug);
  if (!category) notFound();
  const [categories, items] = await Promise.all([
    listCategories(),
    listContent({ category: slug, q: sp.q, use: sp.uso || undefined, duration: ["curta", "media", "longa"].includes(sp.duracao ?? "") ? (sp.duracao as "curta") : undefined }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Categoria" title={category.name}>
        {category.description}
      </PageHeader>
      <Filters categories={categories} values={sp} action={`/app/categorias/${slug}`} hideCategory />
      {items.length ? <Grid items={items} /> : <EmptyState icon={Waves} title="Sem conteúdos nesta categoria">Novas experiências serão adicionadas em breve.</EmptyState>}
    </>
  );
}
