import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { listCategories, listContent } from "@/lib/catalog";
import { Filters } from "@/components/catalog/Filters";
import { Grid } from "@/components/catalog/Shelf";
import { EmptyState, PageHeader } from "@/components/ui/Glass";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Biblioteca" };

type SP = { q?: string; categoria?: string; uso?: string; duracao?: string };
const DURATIONS = new Set(["curta", "media", "longa"]);

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [categories, items] = await Promise.all([
    listCategories(),
    listContent({
      q: sp.q,
      category: sp.categoria || undefined,
      use: sp.uso || undefined,
      duration: DURATIONS.has(sp.duracao ?? "") ? (sp.duracao as "curta") : undefined,
      limit: 120,
    }),
  ]);
  const filtered = Boolean(sp.q || sp.categoria || sp.uso || sp.duracao);
  return (
    <>
      <PageHeader eyebrow="Biblioteca" title="Escute com intenção.">
        Explore por finalidade, duração ou categoria. Os conteúdos marcados como premium ficam disponíveis com um plano ativo.
      </PageHeader>
      <Filters categories={categories} values={sp} />
      {items.length ? (
        <>
          <p className="mb-5 text-sm text-mute" aria-live="polite">
            {items.length} {items.length === 1 ? "conteúdo" : "conteúdos"}
          </p>
          <Grid items={items} />
        </>
      ) : (
        <EmptyState icon={SearchX} title={filtered ? "Nada encontrado" : "Biblioteca vazia"} action={filtered ? <ButtonLink href="/app/biblioteca" variant="glass">Limpar filtros</ButtonLink> : undefined}>
          {filtered ? "Experimente outros termos ou remova alguns filtros." : "Os primeiros conteúdos serão publicados em breve."}
        </EmptyState>
      )}
    </>
  );
}
