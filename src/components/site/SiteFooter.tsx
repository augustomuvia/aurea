import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { getSettings } from "@/lib/settings";

export async function SiteFooter() {
  const s = await getSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-24 border-t border-white/[0.07] px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-14 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-mute">{s.brand.slogan}</p>
        </div>
        <div>
          <p className="mb-3 text-[0.72rem] uppercase tracking-[0.2em] text-paper/50">Produto</p>
          <ul className="space-y-2 text-sm text-paper/70">
            <li><Link className="hover:text-paper" href="/app/biblioteca">Biblioteca</Link></li>
            <li><Link className="hover:text-paper" href="/planos">Planos</Link></li>
            <li><Link className="hover:text-paper" href="/#faq">Perguntas frequentes</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-[0.72rem] uppercase tracking-[0.2em] text-paper/50">Legal</p>
          <ul className="space-y-2 text-sm text-paper/70">
            <li><Link className="hover:text-paper" href="/termos">Termos e condições</Link></li>
            <li><Link className="hover:text-paper" href="/privacidade">Política de privacidade</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-[0.72rem] uppercase tracking-[0.2em] text-paper/50">Contacto</p>
          <ul className="space-y-2 text-sm text-paper/70">
            <li><Link className="hover:text-paper" href="/suporte">Suporte</Link></li>
            {s.support.email && <li><a className="hover:text-paper" href={`mailto:${s.support.email}`}>{s.support.email}</a></li>}
            {s.support.phone && <li>{s.support.phone}</li>}
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-3 border-t border-white/[0.06] pt-6 text-xs leading-relaxed text-mute sm:flex-row sm:justify-between">
        <p>
          © {year} {s.legal.company_name ?? "AUREA"}
          {s.legal.nif ? ` · NIF ${s.legal.nif}` : ""}
          {s.legal.address ? ` · ${s.legal.address}` : ""}
        </p>
        <p className="max-w-xl sm:text-right">
          A AUREA oferece experiências de relaxamento e bem-estar. Não substitui diagnóstico, tratamento ou aconselhamento médico.
        </p>
      </div>
    </footer>
  );
}
