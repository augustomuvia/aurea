"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/** Botão de pesquisa sempre visível no topo; abre um campo que pesquisa na biblioteca. */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !input.current) return;
    // Na biblioteca, começa com o termo já pesquisado.
    if (window.location.pathname === "/app/biblioteca") input.current.value = new URLSearchParams(window.location.search).get("q") ?? "";
    input.current.focus();
    input.current.select();
  }, [open]);

  // Fecha ao mudar de página.
  useEffect(() => setOpen(false), [pathname]);

  // Atalho "/" para abrir a pesquisa (fora de campos de texto); Esc fecha.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="header-search"
        aria-label="Pesquisar conteúdos"
        title="Pesquisar (/)"
        className="press flex h-10 items-center gap-2 rounded-full px-3 text-sm text-paper/80 hover:bg-white/[0.06] hover:text-paper aria-expanded:bg-white/[0.07] aria-expanded:text-gold-light"
      >
        <Search className="h-[18px] w-[18px]" />
        <span className="hidden lg:inline">Pesquisar</span>
      </button>
      {open && (
        <form
          id="header-search"
          role="search"
          action="/app/biblioteca"
          method="get"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.current?.value.trim() ?? "";
            router.push(q ? `/app/biblioteca?q=${encodeURIComponent(q)}` : "/app/biblioteca");
            setOpen(false);
          }}
          className="glass-strong absolute inset-x-3 top-[calc(100%+0.5rem)] mx-auto flex max-w-2xl items-center gap-2 rounded-full p-1.5 pl-4 animate-rise sm:inset-x-6"
        >
          <Search className="h-4 w-4 shrink-0 text-gold" />
          <label htmlFor="header-q" className="sr-only">Pesquisar conteúdos</label>
          <input
            ref={input}
            id="header-q"
            name="q"
            type="search"
            maxLength={60}
            placeholder="Sono, foco, 432 Hz, chuva…"
            enterKeyHint="search"
            className="h-10 min-w-0 flex-1 bg-transparent text-[0.95rem] text-paper placeholder:text-mute/80 focus:outline-none"
          />
          <button type="submit" className="press h-10 shrink-0 rounded-full bg-gold px-5 text-sm font-medium text-ink hover:bg-gold-light">
            Pesquisar
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar pesquisa" className="press grid h-10 w-10 shrink-0 place-items-center rounded-full text-mute hover:text-paper">
            <X className="h-4 w-4" />
          </button>
        </form>
      )}
    </>
  );
}
