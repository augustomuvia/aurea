import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "gold" | "glass" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "press inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.01em] whitespace-nowrap select-none disabled:opacity-45 disabled:pointer-events-none";
const variants: Record<Variant, string> = {
  gold: "bg-gradient-to-b from-gold-light to-gold text-ink shadow-[0_8px_30px_-12px_rgba(214,180,106,0.55),inset_0_1px_0_rgba(255,255,255,0.45)] hover:shadow-[0_10px_40px_-10px_rgba(214,180,106,0.7),inset_0_1px_0_rgba(255,255,255,0.5)] hover:brightness-[1.04]",
  glass: "glass text-paper hover:border-white/20 hover:bg-white/[0.06]",
  ghost: "text-paper/80 hover:text-paper hover:bg-white/[0.05]",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "gold", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({ variant = "gold", size = "md", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "gold",
  size = "md",
  className = "",
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
