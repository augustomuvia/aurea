import Link from "next/link";

const TABS = [
  { href: "/admin/notificacoes", label: "Estado e configurações" },
  { href: "/admin/notificacoes/modelos", label: "Modelos" },
  { href: "/admin/notificacoes/historico", label: "Histórico" },
  { href: "/admin/notificacoes/clientes", label: "Clientes atuais" },
];

export function NotificationTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Notificações" className="mb-8 flex gap-1 overflow-x-auto border-b border-white/[0.07] [scrollbar-width:none]">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className="-mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm text-paper/60 hover:text-paper aria-[current=page]:border-gold aria-[current=page]:text-paper"
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
