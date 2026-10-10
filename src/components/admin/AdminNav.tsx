"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, Film, Layers, LogOut, Settings, ShieldCheck, Users, BadgeCheck, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { logoutAction } from "@/app/(site)/(auth)/actions";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: BarChart3, exact: true },
  { href: "/admin/utilizadores", label: "Utilizadores", icon: Users },
  { href: "/admin/conteudos", label: "Conteúdos", icon: Film },
  { href: "/admin/assinaturas", label: "Assinaturas", icon: BadgeCheck },
  { href: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard },
  { href: "/admin/planos", label: "Planos", icon: Layers },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
  { href: "/admin/auditoria", label: "Auditoria", icon: ShieldCheck },
];

export function AdminNav({ email, pending }: { email: string; pending: number }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  return (
    <aside className="border-b border-white/[0.07] lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-5 py-4 lg:py-6">
        <Link href="/admin" aria-label="Painel AUREA">
          <Logo size="sm" />
        </Link>
        <span className="rounded-full border border-gold/30 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.18em] text-gold-light">Admin</span>
      </div>
      <nav aria-label="Administração" className="overflow-x-auto px-3 pb-3 [scrollbar-width:none] lg:pb-0">
        <ul className="flex gap-1 lg:flex-col">
          {LINKS.map((l) => {
            const on = isActive(l.href, l.exact);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={on ? "page" : undefined}
                  className={`press flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm ${on ? "bg-white/[0.07] text-paper" : "text-paper/60 hover:bg-white/[0.04] hover:text-paper"}`}
                >
                  <l.icon className={`h-4 w-4 ${on ? "text-gold" : ""}`} />
                  {l.label}
                  {l.href === "/admin/pagamentos" && pending > 0 && (
                    <span className="ml-auto rounded-full bg-gold px-1.5 text-[0.66rem] font-semibold tabular-nums text-ink">{pending}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="hidden px-5 py-6 text-xs text-mute lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
        <p className="truncate">{email}</p>
        <div className="mt-3 flex items-center gap-4">
          <Link href="/app" className="inline-flex items-center gap-1 hover:text-paper"><ArrowLeft className="h-3 w-3" /> App</Link>
          <form action={logoutAction}>
            <button className="inline-flex items-center gap-1 hover:text-paper"><LogOut className="h-3 w-3" /> Sair</button>
          </form>
        </div>
      </div>
    </aside>
  );
}
