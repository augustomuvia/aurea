import { Search } from "lucide-react";
import type { Category } from "@/lib/types";
import { USE_LABEL } from "@/lib/format";
import { AutoSubmitClient as AutoSubmit } from "./AutoSubmit";

const chip =
  "press inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors has-[:checked]:border-gold/50 has-[:checked]:bg-gold/[0.1] has-[:checked]:text-gold-light border-white/10 text-paper/70 hover:border-white/20 hover:text-paper cursor-pointer";

/** Filtros por GET: funcionam sem JavaScript e são partilháveis por URL. */
export function Filters({ categories, values, action = "/app/biblioteca", hideCategory = false }: {
  categories: Category[];
  values: { q?: string; categoria?: string; uso?: string; duracao?: string };
  action?: string;
  hideCategory?: boolean;
}) {
  return (
    <form action={action} method="get" role="search" className="mb-10 space-y-4 animate-rise">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
        <label htmlFor="q" className="sr-only">Pesquisar</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={values.q}
          maxLength={60}
          placeholder="Pesquisar por título, categoria ou etiqueta"
          className="glass h-13 w-full rounded-full pl-11 pr-28 text-[0.95rem] text-paper placeholder:text-mute/80 focus:border-gold/50 focus:outline-none"
        />
        <button type="submit" className="press absolute right-1.5 top-1/2 h-10 -translate-y-1/2 rounded-full bg-white/[0.08] px-5 text-sm text-paper hover:bg-white/[0.12]">
          Pesquisar
        </button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Finalidade">
        <FilterChip name="uso" value="" current={values.uso} label="Todas as finalidades" />
        {Object.entries(USE_LABEL).map(([v, l]) => (
          <FilterChip key={v} name="uso" value={v} current={values.uso} label={l} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Duração">
        {[
          ["", "Qualquer duração"],
          ["curta", "Até 15 min"],
          ["media", "15 a 60 min"],
          ["longa", "Mais de 1 h"],
        ].map(([v, l]) => (
          <FilterChip key={v} name="duracao" value={v} current={values.duracao} label={l} />
        ))}
      </div>
      {!hideCategory && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categoria">
          <FilterChip name="categoria" value="" current={values.categoria} label="Todas as categorias" />
          {categories.map((c) => (
            <FilterChip key={c.slug} name="categoria" value={c.slug} current={values.categoria} label={c.name} />
          ))}
        </div>
      )}
      <noscript>
        <button type="submit" className="text-sm text-gold-light underline">Aplicar filtros</button>
      </noscript>
      <AutoSubmit />
    </form>
  );
}

function FilterChip({ name, value, current, label }: { name: string; value: string; current?: string; label: string }) {
  return (
    <label className={chip}>
      <input type="radio" name={name} value={value} defaultChecked={(current ?? "") === value} className="sr-only" />
      {label}
    </label>
  );
}
