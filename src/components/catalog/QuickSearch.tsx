import { Search } from "lucide-react";

/** Campo de pesquisa por GET para a biblioteca (funciona sem JavaScript). */
export function QuickSearch() {
  return (
    <form action="/app/biblioteca" method="get" role="search" className="relative mb-10 animate-rise">
      <Search className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gold" />
      <label htmlFor="home-q" className="sr-only">Pesquisar conteúdos</label>
      <input
        id="home-q"
        name="q"
        type="search"
        maxLength={60}
        enterKeyHint="search"
        placeholder="Pesquisar sons, frequências, categorias…"
        className="glass h-14 w-full rounded-full pl-12 pr-32 text-[0.95rem] text-paper placeholder:text-mute/80 focus:border-gold/50 focus:outline-none"
      />
      <button type="submit" className="press absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-full bg-gold px-5 text-sm font-medium text-ink hover:bg-gold-light">
        Pesquisar
      </button>
    </form>
  );
}
