"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Download, Heart, History, Home, Library, LogOut, Settings, Shield, UserRound } from "lucide-react";
import { clearOffline } from "@/lib/offline";
import { Logo } from "@/components/brand/Logo";
import { logoutAction } from "@/app/(site)/(auth)/actions";
import { HeaderSearch } from "./HeaderSearch";
import { NotificationBell, type BellItem } from "./NotificationBell";

const MAIN = [
  { href: "/app", label: "Início", icon: Home, exact: true },
  { href: "/app/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/app/favoritos", label: "Favoritos", icon: Heart },
  { href: "/app/historico", label: "Histórico", icon: History },
];

export function AppNav({ name, isAdmin, notifications }: { name: string; isAdmin: boolean; notifications: { items: BellItem[]; unread: number } }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <nav aria-label="Aplicação" className="glass mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pl-5 pr-2">
          <Link href="/app" aria-label="AUREA — início da conta" className="press">
            <Logo size="sm" />
          </Link>
          <ul className="hidden items-center gap-1 md:flex">
            {MAIN.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active(l.href, l.exact) ? "page" : undefined}
                  className="press rounded-full px-4 py-2 text-sm text-paper/65 hover:text-paper aria-[current=page]:bg-white/[0.07] aria-[current=page]:text-paper"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1">
            <HeaderSearch />
            <NotificationBell items={notifications.items} unread={notifications.unread} />
            {isAdmin && (
              <Link href="/admin" className="press grid h-10 w-10 place-items-center rounded-full text-gold hover:bg-white/[0.06]" aria-label="Painel administrativo" title="Painel administrativo">
                <Shield className="h-4.5 w-4.5" />
              </Link>
            )}
            <details className="relative [&_summary::-webkit-details-marker]:hidden">
              <summary className="press flex h-10 cursor-pointer list-none items-center gap-2 rounded-full pl-2 pr-3 text-sm text-paper/80 hover:bg-white/[0.06]">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-gold/30 bg-gold/10 text-xs font-medium uppercase text-gold-light">{name.slice(0, 1)}</span>
                <span className="hidden max-w-[10rem] truncate sm:inline">{name}</span>
              </summary>
              <div className="glass-strong absolute right-0 top-12 w-60 rounded-2xl p-1.5 animate-rise">
                {[
                  { href: "/app/assinatura", label: "Assinatura", icon: UserRound },
                  { href: "/app/pagamentos", label: "Pagamentos", icon: Library },
                  { href: "/app/notificacoes", label: "Notificações", icon: Bell },
                  { href: "/offline", label: "Downloads offline", icon: Download },
                  { href: "/app/conta", label: "Conta e privacidade", icon: Settings },
                ].map((l) => (
                  <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-paper/80 hover:bg-white/[0.06] hover:text-paper">
                    <l.icon className="h-4 w-4 text-mute" /> {l.label}
                  </Link>
                ))}
                <form action={logoutAction} onSubmit={() => void clearOffline()}>
                  <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-paper/80 hover:bg-white/[0.06] hover:text-paper">
                    <LogOut className="h-4 w-4 text-mute" /> Terminar sessão
                  </button>
                </form>
              </div>
            </details>
          </div>
        </nav>
      </header>

      {/* Barra inferior em telemóveis */}
      <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] md:hidden">
        <ul className="glass-strong grid h-[60px] grid-cols-4 rounded-[1.4rem]">
          {MAIN.map((l) => {
            const on = active(l.href, l.exact);
            return (
              <li key={l.href}>
                <Link href={l.href} aria-current={on ? "page" : undefined} className={`press flex h-full flex-col items-center justify-center gap-1 text-[0.66rem] ${on ? "text-gold" : "text-paper/55"}`}>
                  <l.icon className="h-[18px] w-[18px]" strokeWidth={on ? 2 : 1.6} />
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
