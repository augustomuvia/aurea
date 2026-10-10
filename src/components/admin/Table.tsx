import type { ReactNode } from "react";

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="glass overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-[0.7rem] uppercase tracking-[0.14em] text-mute">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-12 text-center text-mute">
                Sem resultados.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export const td = "px-4 py-3 align-middle";

export function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form action={action} method="get" className="mb-6 flex flex-wrap items-end gap-3">
      {children}
      <button type="submit" className="press h-11 rounded-full bg-white/[0.08] px-5 text-sm text-paper hover:bg-white/[0.12]">
        Filtrar
      </button>
    </form>
  );
}

export function Pager({ page, hasMore, base }: { page: number; hasMore: boolean; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="mt-4 flex justify-between text-sm">
      {page > 1 ? <a className="text-paper/70 hover:text-paper" href={`${base}${sep}p=${page - 1}`}>← Anterior</a> : <span />}
      {hasMore ? <a className="text-paper/70 hover:text-paper" href={`${base}${sep}p=${page + 1}`}>Seguinte →</a> : <span />}
    </div>
  );
}
