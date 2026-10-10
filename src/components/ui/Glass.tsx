import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function GlassCard({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`glass glass-sheen ${className}`} {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gold" | "ok" | "danger" | "warn" }) {
  const tones = {
    neutral: "border-white/10 text-paper/70 bg-white/[0.03]",
    gold: "border-gold/35 text-gold-light bg-gold/[0.08]",
    ok: "border-ok/30 text-ok bg-ok/[0.07]",
    danger: "border-danger/30 text-danger bg-danger/[0.07]",
    warn: "border-amber-300/30 text-amber-200 bg-amber-300/[0.06]",
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.72rem] font-medium tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center px-6 py-14 text-center animate-rise">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-full border border-gold/25 bg-gold/[0.06]">
        <Icon className="h-6 w-6 text-gold" strokeWidth={1.4} />
      </div>
      <h3 className="font-serif text-2xl text-paper">{title}</h3>
      {children && <p className="mt-2 max-w-sm text-sm leading-relaxed text-mute">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, action }: { eyebrow?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 animate-rise sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-[0.72rem] font-medium uppercase tracking-[0.22em] text-gold/90">{eyebrow}</p>}
        <h1 className="font-serif text-4xl leading-[1.05] text-paper sm:text-5xl">{title}</h1>
        {children && <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-mute">{children}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="glass p-5">
      <p className="text-[0.72rem] uppercase tracking-[0.18em] text-mute">{label}</p>
      <p className="mt-2 font-serif text-3xl text-paper tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </div>
  );
}
