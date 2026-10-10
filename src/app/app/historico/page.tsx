import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { contentByIds, coverOf, getHistory, primaryCategory } from "@/lib/catalog";
import { buildQueue } from "@/components/catalog/Shelf";
import { PlayTrigger } from "@/components/catalog/PlayTrigger";
import { EmptyState, PageHeader } from "@/components/ui/Glass";
import { ButtonLink } from "@/components/ui/Button";
import { formatDateTime, formatDuration } from "@/lib/format";
import { clearHistory } from "../actions";

export const metadata: Metadata = { title: "Histórico" };

export default async function HistoryPage() {
  const user = await requireUser("/app/historico");
  const history = await getHistory(user.id, 100);
  const items = await contentByIds(history.map((h) => h.content_id));
  const byId = new Map(items.map((i) => [i.id, i]));
  const { queue, indexOf } = buildQueue(items);

  return (
    <>
      <PageHeader
        eyebrow="A sua escuta"
        title="Histórico"
        action={
          history.length ? (
            <form action={clearHistory}>
              <button className="press text-sm text-paper/60 underline-offset-4 hover:text-paper hover:underline">Limpar histórico</button>
            </form>
          ) : null
        }
      />
      {history.length ? (
        <ol className="glass divide-y divide-white/[0.06]">
          {history.map((h) => {
            const item = byId.get(h.content_id);
            if (!item) return null;
            const idx = indexOf.get(item.id);
            const pct = h.duration_seconds ? Math.min(100, (h.position_seconds / h.duration_seconds) * 100) : 0;
            return (
              <li key={h.content_id} className="flex items-center gap-4 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverOf(item)} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <Link href={`/app/conteudo/${item.slug}`} className="block truncate font-medium text-paper hover:text-gold-light">
                    {item.title}
                  </Link>
                  <p className="truncate text-xs text-mute">
                    {[primaryCategory(item), formatDateTime(h.last_played_at), h.duration_seconds ? `${formatDuration(h.position_seconds)} de ${formatDuration(h.duration_seconds)}` : null].filter(Boolean).join(" · ")}
                  </p>
                  {pct > 0 && (
                    <div className="mt-2 h-[2px] w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                {idx !== undefined && <PlayTrigger queue={queue} index={idx} resumeAt={pct < 97 ? h.position_seconds : 0} title={item.title} />}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState icon={History} title="Ainda não ouviu nada" action={<ButtonLink href="/app/biblioteca" variant="glass">Começar a ouvir</ButtonLink>}>
          Os conteúdos que reproduzir aparecem aqui para retomar facilmente.
        </EmptyState>
      )}
    </>
  );
}
