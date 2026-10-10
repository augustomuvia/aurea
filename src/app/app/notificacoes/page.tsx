import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/ui/Glass";
import { CATEGORY_LABEL } from "@/lib/notifications/labels";
import { formatDateTime } from "@/lib/format";
import { markNotificationRead, markNotificationsRead, openNotification } from "../actions";

export const metadata: Metadata = { title: "Notificações" };
const PAGE = 30;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ p?: string; categoria?: string }> }) {
  const user = await requireUser("/app/notificacoes");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  const cat = sp.categoria && sp.categoria in CATEGORY_LABEL ? sp.categoria : null;
  const supabase = await createClient();
  let q = supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (cat) q = q.eq("category", cat);
  const { data } = await q.range((page - 1) * PAGE, page * PAGE);
  const rows = data ?? [];
  const unread = rows.some((n) => !n.read_at);
  const href = (p: number, c: string | null = cat) => `/app/notificacoes?${new URLSearchParams({ ...(c ? { categoria: c } : {}), ...(p > 1 ? { p: String(p) } : {}) })}`;

  return (
    <>
      <PageHeader
        eyebrow="Conta"
        title="Notificações"
        action={
          unread ? (
            <form action={markNotificationsRead}>
              <button className="press glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-paper">
                <Check className="h-4 w-4" /> Marcar todas como lidas
              </button>
            </form>
          ) : undefined
        }
      >
        Avisos sobre a sua conta, pagamentos e assinatura.
      </PageHeader>

      <nav aria-label="Categorias" className="mb-6 flex flex-wrap gap-2">
        {[null, ...Object.keys(CATEGORY_LABEL)].map((c) => (
          <Link
            key={c ?? "todas"}
            href={href(1, c)}
            aria-current={c === cat ? "page" : undefined}
            className="press inline-flex h-9 items-center rounded-full border border-white/10 px-4 text-sm text-paper/70 aria-[current=page]:border-gold/50 aria-[current=page]:bg-gold/[0.1] aria-[current=page]:text-gold-light"
          >
            {c ? CATEGORY_LABEL[c] : "Todas"}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="Sem notificações">Quando houver novidades sobre a sua conta, aparecem aqui.</EmptyState>
      ) : (
        <ul className="glass divide-y divide-white/[0.06]">
          {rows.slice(0, PAGE).map((n) => (
            <li key={n.id} className={`flex gap-4 p-4 sm:p-5 ${n.read_at ? "" : "bg-gold/[0.035]"}`}>
              <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-white/10" : "bg-gold"}`} />
              <form action={openNotification} className="min-w-0 flex-1">
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="block w-full text-left">
                  <span className="text-[0.68rem] uppercase tracking-[0.14em] text-gold/90">
                    {CATEGORY_LABEL[n.category] ?? n.category} <span className="normal-case tracking-normal text-mute">· {formatDateTime(n.created_at)}</span>
                  </span>
                  <span className="mt-1 block font-medium text-paper">{n.title}</span>
                  {n.body && <span className="mt-1 block text-sm text-mute">{n.body}</span>}
                  <span className="mt-1 block text-xs text-paper/50">{n.read_at ? "Lida" : "Por ler"}</span>
                </button>
              </form>
              {!n.read_at && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="press text-xs text-paper/60 hover:text-paper hover:underline">Marcar como lida</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <Link className="text-paper/70 hover:text-paper" href={href(page - 1)}>← Anteriores</Link> : <span />}
        {rows.length > PAGE ? <Link className="text-paper/70 hover:text-paper" href={href(page + 1)}>Mais antigas →</Link> : <span />}
      </div>
    </>
  );
}
