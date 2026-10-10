import { useId } from "react";

/** Símbolo AUREA: anel de ressonância atravessado por uma única onda em equilíbrio. */
export function LogoMark({ className = "h-7 w-7", mono = false }: { className?: string; mono?: boolean }) {
  const id = useId();
  const stroke = mono ? "currentColor" : `url(#${id})`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      {!mono && (
        <defs>
          <linearGradient id={id} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F0DCA5" />
            <stop offset="0.55" stopColor="#D6B46A" />
            <stop offset="1" stopColor="#A8873F" />
          </linearGradient>
        </defs>
      )}
      <circle cx="16" cy="16" r="12.75" stroke={stroke} strokeWidth="1.1" opacity="0.9" />
      <path d="M2.5 16c3.4-5.6 6.9-5.6 10.1 0s6.7 5.6 10.1 0 4.6-3.2 6.8-1.6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.35" fill={stroke} />
    </svg>
  );
}

export function Logo({ className = "", showMark = true, size = "md" }: { className?: string; showMark?: boolean; size?: "sm" | "md" | "lg" }) {
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  const mark = size === "lg" ? "h-9 w-9" : size === "sm" ? "h-5 w-5" : "h-7 w-7";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {showMark && <LogoMark className={mark} />}
      <span className={`font-serif ${text} tracking-[0.34em] text-paper`} style={{ marginRight: "-0.34em" }}>
        AUREA
      </span>
    </span>
  );
}
