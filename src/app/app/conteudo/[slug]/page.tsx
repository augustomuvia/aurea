import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Headphones, Lock, Info } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { coverOf, getContentBySlug, listContent, toTrack } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import { formatDurationLong, USE_LABEL } from "@/lib/format";
import { PlayTrigger } from "@/components/catalog/PlayTrigger";
import { FavoriteButton } from "@/components/catalog/FavoriteButton";
import { ButtonLink } from "@/components/ui/Button";
import { Shelf } from "@/components/catalog/Shelf";
import type { PlayableTrack } from "@/lib/types";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getContentBySlug((await params).slug);
  return { title: item?.title ?? "Conteúdo", description: item?.description?.slice(0, 160) };
}

export default async function ContentPage({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser(`/app/conteudo/${slug}`);
  const item = await getContentBySlug(slug);
  if (!item) notFound();

  const supabase = await createClient();
  const firstCategory = item.content_categories?.[0]?.categories;
  const [{ data: hist }, related] = await Promise.all([
    supabase.from("listening_history").select("position_seconds, duration_seconds").eq("user_id", user.id).eq("content_id", item.id).maybeSingle(),
    firstCategory ? listContent({ category: firstCategory.slug, limit: 13 }) : Promise.resolve([]),
  ]);
  const others = related.filter((r) => r.id !== item.id).slice(0, 12);

  const track = toTrack(item);
  // Fila: este conteúdo seguido dos relacionados que o utilizador pode reproduzir.
  const queue: PlayableTrack[] = track ? [track, ...others.map(toTrack).filter((t): t is PlayableTrack => Boolean(t))] : [];
  const resumeAt = hist && hist.duration_seconds && hist.position_seconds < hist.duration_seconds - 15 ? hist.position_seconds : 0;

  return (
    <>
      <article className="grid gap-8 md:grid-cols-[minmax(0,420px)_1fr] md:gap-12">
        <div className="relative aspect-square overflow-hidden rounded-[1.6rem] border border-white/[0.08] animate-rise">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverOf(item)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />
        </div>
        <div className="flex flex-col justify-end animate-rise" style={{ animationDelay: "80ms" }}>
          <p className="text-[0.72rem] uppercase tracking-[0.22em] text-gold/90">
            {item.content_categories?.map((c) => c.categories?.name).filter(Boolean).join(" · ") || "Experiência sonora"}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] text-paper sm:text-6xl">{item.title}</h1>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {item.declared_frequency_hz && <span className="rounded-full border border-gold/30 px-3 py-1 text-gold-light">{Number(item.declared_frequency_hz)} Hz · declarada</span>}
            {item.duration_seconds && <span className="rounded-full border border-white/10 px-3 py-1 text-paper/70">{formatDurationLong(item.duration_seconds)}</span>}
            {item.recommended_use.map((u) => (
              <span key={u} className="rounded-full border border-white/10 px-3 py-1 text-paper/70">{USE_LABEL[u] ?? u}</span>
            ))}
            {item.is_binaural && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-paper/70">
                <Headphones className="h-3.5 w-3.5" /> Binaural
              </span>
            )}
          </div>
          {item.description && <p className="mt-6 max-w-xl whitespace-pre-line text-[0.95rem] leading-relaxed text-paper/70">{item.description}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {track ? (
              <>
                <PlayTrigger queue={queue} index={0} resumeAt={resumeAt} title={item.title} variant="wide" />
                <FavoriteButton contentId={item.id} />
              </>
            ) : (
              <div className="glass flex w-full flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-3 text-sm text-paper/80">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  Este conteúdo faz parte da biblioteca premium.
                </p>
                <ButtonLink href="/planos" size="sm">Ver planos</ButtonLink>
              </div>
            )}
          </div>

          {item.is_binaural && (
            <p className="mt-6 flex max-w-xl items-start gap-2 text-xs leading-relaxed text-mute">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Conteúdo binaural: use auscultadores e um volume moderado. Não utilize enquanto conduz ou opera máquinas.
            </p>
          )}
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-mute">
            Frequências e efeitos são descritos pelos autores dos conteúdos. A AUREA não substitui diagnóstico, tratamento ou aconselhamento médico.
            {item.tags.length > 0 && (
              <>
                {" "}Etiquetas:{" "}
                {item.tags.map((t, i) => (
                  <span key={t}>
                    <Link href={`/app/biblioteca?q=${encodeURIComponent(t)}`} className="underline underline-offset-2 hover:text-paper">#{t}</Link>
                    {i < item.tags.length - 1 ? " " : ""}
                  </span>
                ))}
              </>
            )}
          </p>
        </div>
      </article>
      <div className="mt-16">
        <Shelf title="Na mesma categoria" items={others} />
      </div>
    </>
  );
}
