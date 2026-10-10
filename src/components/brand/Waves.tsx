/**
 * Composição abstrata de ondas sonoras. Puramente decorativa: não representa
 * medições reais do áudio (o YouTube não expõe o sinal de áudio).
 */
function wavePath(width: number, mid: number, amp: number, period: number, phase = 0) {
  const pts: string[] = [];
  for (let x = 0; x <= width; x += 8) {
    const y = mid + Math.sin((x / period) * Math.PI * 2 + phase) * amp;
    pts.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

export function HeroWaves({ className = "" }: { className?: string }) {
  const W = 2400;
  const lines = [
    { amp: 46, period: 600, phase: 0, o: 0.55, w: 1.4, cls: "wave-drift-slow" },
    { amp: 70, period: 400, phase: 1.2, o: 0.32, w: 1, cls: "wave-drift" },
    { amp: 28, period: 300, phase: 2.4, o: 0.25, w: 0.8, cls: "wave-drift-slow" },
    { amp: 96, period: 1200, phase: 0.6, o: 0.14, w: 0.8, cls: "wave-drift" },
  ];
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="breathe absolute left-1/2 top-[46%] h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(214,180,106,0.16),rgba(214,180,106,0.04)_45%,transparent_70%)] blur-2xl" />
      <div className="absolute inset-x-0 top-[46%] h-[300px] -translate-y-1/2 [mask-image:linear-gradient(90deg,transparent,#000_20%,#000_80%,transparent)]">
        {lines.map((l, i) => (
          <svg key={i} viewBox={`0 0 ${W} 300`} preserveAspectRatio="none" className={`absolute left-0 top-0 h-[300px] w-[200%] ${l.cls}`}>
            <path d={wavePath(W, 150, l.amp, l.period, l.phase)} stroke={i % 2 ? "#F0DCA5" : "#D6B46A"} strokeOpacity={l.o} strokeWidth={l.w} fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
        ))}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#050505_78%)]" />
    </div>
  );
}

/** Barras animadas de reprodução (decorativas). */
export function PlayingBars({ playing, className = "h-3.5 w-4" }: { playing: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-end gap-[2px] ${playing ? "" : "paused"} ${className}`}>
      {[0, 0.25, 0.5, 0.15].map((d, i) => (
        <span key={i} className="eq-bar block w-[2.5px] rounded-full bg-gold" style={{ height: "100%", animationDelay: `${d}s` }} />
      ))}
    </span>
  );
}

/** Onda decorativa do player expandido. */
export function PlayerWave({ playing }: { playing: boolean }) {
  const W = 1600;
  return (
    <div aria-hidden="true" className={`relative h-16 w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)] ${playing ? "" : "paused"}`}>
      {[0, 1].map((i) => (
        <svg key={i} viewBox={`0 0 ${W} 64`} preserveAspectRatio="none" className={`absolute inset-0 h-full w-[200%] ${i ? "wave-drift-slow" : "wave-drift"}`}>
          <path d={wavePath(W, 32, i ? 10 : 18, i ? 200 : 400, i)} stroke="#D6B46A" strokeOpacity={i ? 0.25 : 0.6} strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
      ))}
    </div>
  );
}
