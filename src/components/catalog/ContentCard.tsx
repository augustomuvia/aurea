import Link from "next/link";
import { Lock } from "lucide-react";
import type { CatalogItem } from "@/lib/catalog";
import { coverOf, primaryCategory } from "@/lib/catalog";
import { formatDurationLong } from "@/lib/format";
import { PlayTrigger } from "./PlayTrigger";
import type { PlayableTrack } from "@/lib/types";

/** Cartão de conteúdo. Se `queue` for fornecida e o item for reproduzível, mostra o botão de reprodução. */
export function ContentCard({
  item,
  queue,
  queueIndex,
  resumeAt,
  progress,
  href,
  size = "md",
}: {
  item: CatalogItem;
  queue?: PlayableTrack[];
  queueIndex?: number;
  resumeAt?: number;
  progress?: number;
  href?: string;
  size?: "md" | "lg";
}) {
  // Só com áudio AUREA e o plano não o inclui: não toca, mostra para que plano é.
  const planLocked = Boolean(item.own_audio_locked && !item.content_media?.youtube_video_id);
  const playable = Boolean(item.content_media) && !planLocked;
  const link = href ?? `/app/conteudo/${item.slug}`;
  const category = primaryCategory(item);
  return (
    <article className="group relative">
      <div className={`relative overflow-hidden rounded-[1.15rem] border border-white/[0.08] bg-ink-3 ${size === "lg" ? "aspect-[4/5]" : "aspect-square"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverOf(item)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full scale-[1.02] object-cover opacity-80 transition duration-700 [transition-timing-function:var(--ease-fluid)] group-hover:scale-[1.06] group-hover:opacity-95"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {item.declared_frequency_hz && (
            <span className="rounded-full border border-gold/30 bg-ink/60 px-2 py-0.5 text-[0.66rem] text-gold-light backdrop-blur-md">
              {Number(item.declared_frequency_hz)} Hz
            </span>
          )}
          {!playable && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-ink/60 px-2 py-0.5 text-[0.66rem] text-paper/75 backdrop-blur-md">
              <Lock className="h-3 w-3" /> {planLocked ? "Trimestral e Anual" : "Premium"}
            </span>
          )}
        </div>
        {playable && queue && queueIndex !== undefined && (
          <div className="absolute bottom-3 right-3 translate-y-1 opacity-100 transition duration-500 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
            <PlayTrigger queue={queue} index={queueIndex} resumeAt={resumeAt} title={item.title} />
          </div>
        )}
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-3 bottom-2 h-[2px] overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-gold" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <Link href={link} className="mt-3 block focus-visible:outline-offset-4">
        <span className="absolute inset-0 rounded-[1.15rem]" aria-hidden="true" />
        <h3 className="line-clamp-1 text-[0.95rem] font-medium text-paper">{item.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-mute">
          {[category, formatDurationLong(item.duration_seconds)].filter(Boolean).join(" · ")}
        </p>
      </Link>
    </article>
  );
}
