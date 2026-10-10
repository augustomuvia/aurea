"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import { markNotificationRead, markNotificationsRead, openNotification } from "@/app/app/actions";

export interface BellItem {
  id: string;
  title: string;
  body: string;
  category: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

import { CATEGORY_LABEL } from "@/lib/notifications/labels";

const when = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Luanda" });

export function NotificationBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `Notificações, ${unread} por ler` : "Notificações"}
        className="press relative grid h-10 w-10 place-items-center rounded-full text-paper/80 hover:bg-white/[0.06] hover:text-paper"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.7} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[0.6rem] font-semibold tabular-nums text-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificações"
          className="glass-strong fixed inset-x-3 top-[4.6rem] z-40 max-h-[75dvh] overflow-hidden rounded-2xl animate-rise sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[23rem]"
        >
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <p className="text-sm font-medium text-paper">Notificações</p>
            {unread > 0 && (
              <form action={markNotificationsRead}>
                <button className="press inline-flex items-center gap-1.5 text-xs text-paper/60 hover:text-paper">
                  <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
                </button>
              </form>
            )}
          </div>
          <ul className="max-h-[calc(75dvh-6.5rem)] divide-y divide-white/[0.05] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-mute">Sem notificações por agora.</li>}
            {items.map((n) => (
              <li key={n.id} className={`group relative flex gap-3 px-4 py-3 ${n.read_at ? "" : "bg-gold/[0.035]"}`}>
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-gold"}`} />
                <form action={openNotification} className="min-w-0 flex-1">
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="block w-full text-left">
                    <span className="flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.14em] text-gold/90">
                      {CATEGORY_LABEL[n.category] ?? n.category}
                      <span className="normal-case tracking-normal text-mute">· {when.format(new Date(n.created_at))}</span>
                    </span>
                    <span className="mt-0.5 block text-sm font-medium text-paper">{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-[0.8rem] leading-snug text-mute">{n.body}</span>}
                    <span className="sr-only">{n.read_at ? "Lida" : "Por ler"}</span>
                  </button>
                </form>
                {!n.read_at && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="press grid h-7 w-7 place-items-center rounded-full text-mute hover:bg-white/[0.06] hover:text-paper" aria-label="Marcar como lida" title="Marcar como lida">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-white/[0.07] px-4 py-3 text-center">
            <Link href="/app/notificacoes" onClick={() => setOpen(false)} className="text-xs text-gold-light hover:underline">
              Ver todas as notificações
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
