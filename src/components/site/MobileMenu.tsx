"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-movel"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        onClick={() => setOpen((o) => !o)}
        className="press grid h-10 w-10 place-items-center rounded-full text-paper/80 hover:bg-white/[0.06]"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div id="menu-movel" className="glass-strong fixed inset-x-3 top-[calc(4.75rem+env(safe-area-inset-top))] rounded-3xl p-2 animate-rise">
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="press block rounded-2xl px-4 py-3.5 text-[0.95rem] text-paper/85 hover:bg-white/[0.05]">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
