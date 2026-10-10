import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CatalogItem } from "@/lib/catalog";
import { toTrack } from "@/lib/catalog";
import type { PlayableTrack } from "@/lib/types";
import { ContentCard } from "./ContentCard";

/** Constrói a fila de reprodução a partir dos itens que o servidor libertou. */
export function buildQueue(items: CatalogItem[]) {
  const queue: PlayableTrack[] = [];
  const indexOf = new Map<string, number>();
  for (const it of items) {
    const t = toTrack(it);
    if (t) {
      indexOf.set(it.id, queue.length);
      queue.push(t);
    }
  }
  return { queue, indexOf };
}

export function Shelf({
  title,
  items,
  href,
  resume,
}: {
  title: string;
  items: CatalogItem[];
  href?: string;
  resume?: Map<string, { position: number; duration: number | null }>;
}) {
  if (!items.length) return null;
  const { queue, indexOf } = buildQueue(items);
  return (
    <section className="mb-12 animate-rise">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="font-serif text-2xl text-paper sm:text-3xl">{title}</h2>
        {href && (
          <Link href={href} className="press inline-flex items-center gap-1 text-sm text-paper/60 hover:text-paper">
            Ver tudo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const r = resume?.get(item.id);
          return (
            <div key={item.id} className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[22%] lg:w-[18%]">
              <ContentCard
                item={item}
                queue={queue}
                queueIndex={indexOf.get(item.id)}
                resumeAt={r?.position}
                progress={r && r.duration ? r.position / r.duration : undefined}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Grid({ items }: { items: CatalogItem[] }) {
  const { queue, indexOf } = buildQueue(items);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item, i) => (
        <div key={item.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
          <ContentCard item={item} queue={queue} queueIndex={indexOf.get(item.id)} />
        </div>
      ))}
    </div>
  );
}
