/**
 * Gráfico de barras de série única, renderizado no servidor.
 * Cor validada para o fundo escuro (#B08A35), topo arredondado ancorado à base,
 * tooltip ao passar/focar e tabela equivalente para leitores de ecrã.
 */
export function BarChart({
  title,
  data,
  format = (v: number) => String(v),
  emptyLabel = "Sem dados no período.",
}: {
  title: string;
  data: { label: string; value: number }[];
  format?: (v: number) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <figure className="glass p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-paper">{title}</span>
        <span className="text-xs tabular-nums text-mute">Total {format(total)}</span>
      </figcaption>
      {data.length === 0 || max === 0 ? (
        <p className="grid h-40 place-items-center text-sm text-mute">{emptyLabel}</p>
      ) : (
        <>
          <div className="relative mt-5 flex h-40 items-end gap-[2px] border-b border-white/10" aria-hidden="true">
            {data.map((d) => (
              <div key={d.label} tabIndex={-1} className="group relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t-[4px] bg-[#B08A35] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-ink-2 px-2.5 py-1.5 text-xs text-paper shadow-xl group-hover:block">
                  <span className="text-mute">{d.label}</span> · <span className="tabular-nums">{format(d.value)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[0.68rem] text-mute" aria-hidden="true">
            <span>{data[0].label}</span>
            <span>{data[data.length - 1].label}</span>
          </div>
          <details className="mt-3 text-xs text-mute">
            <summary className="cursor-pointer hover:text-paper">Ver tabela</summary>
            <table className="mt-2 w-full">
              <tbody>
                {data.map((d) => (
                  <tr key={d.label} className="border-t border-white/[0.06]">
                    <td className="py-1">{d.label}</td>
                    <td className="py-1 text-right tabular-nums text-paper/80">{format(d.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}
