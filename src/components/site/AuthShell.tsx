import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="relative flex min-h-[100svh] items-center justify-center px-4 pb-16 pt-28">
      <div aria-hidden="true" className="breathe pointer-events-none absolute left-1/2 top-1/3 h-[50vmin] w-[50vmin] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(214,180,106,0.12),transparent_65%)] blur-2xl" />
      <div className="relative w-full max-w-[420px] animate-rise">
        <div className="mb-8 text-center">
          <Link href="/" aria-label="AUREA — início" className="inline-block">
            <LogoMark className="mx-auto h-10 w-10" />
          </Link>
          <h1 className="mt-5 font-serif text-4xl text-paper">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-mute">{subtitle}</p>}
        </div>
        <div className="glass-strong glass-sheen rounded-[1.6rem] p-6 sm:p-8">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-mute">{footer}</div>}
      </div>
    </section>
  );
}
