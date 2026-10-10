import type { ComponentProps, ReactNode } from "react";

export const inputClass =
  "w-full h-12 rounded-xl bg-white/[0.035] border border-white/10 px-4 text-[0.95rem] text-paper placeholder:text-mute/70 transition-colors duration-300 hover:border-white/20 focus:border-gold/60 focus:bg-white/[0.05] focus:outline-none aria-[invalid=true]:border-danger/60";

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string[] | string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-[0.8rem] font-medium tracking-wide text-paper/70">
        {label}
      </label>
      {children}
      {msg ? (
        <p id={`${name}-error`} role="alert" className="text-[0.8rem] text-danger">
          {msg}
        </p>
      ) : hint ? (
        <p className="text-[0.8rem] text-mute">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ name, error, ...props }: ComponentProps<"input"> & { name: string; error?: string[] | string }) {
  return (
    <input id={name} name={name} aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined} className={inputClass} {...props} />
  );
}

export function Textarea({ name, error, className = "", ...props }: ComponentProps<"textarea"> & { name: string; error?: string[] | string }) {
  return (
    <textarea
      id={name}
      name={name}
      aria-invalid={error ? true : undefined}
      className={`${inputClass} h-auto min-h-28 py-3 leading-relaxed ${className}`}
      {...props}
    />
  );
}

export function Select({ name, children, ...props }: ComponentProps<"select"> & { name: string }) {
  return (
    <select id={name} name={name} className={`${inputClass} appearance-none bg-[length:12px] pr-10`} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ name, label, ...props }: ComponentProps<"input"> & { name: string; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-paper/75">
      <input type="checkbox" name={name} className="mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer accent-[#D6B46A]" {...props} />
      <span>{label}</span>
    </label>
  );
}
