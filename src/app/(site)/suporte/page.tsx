import type { Metadata } from "next";
import { Mail, Phone, MessageCircle } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { getSessionUser } from "@/lib/auth";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = { title: "Suporte" };

export default async function SupportPage() {
  const [s, user] = await Promise.all([getSettings(), getSessionUser()]);
  return (
    <section className="mx-auto max-w-4xl px-4 pb-10 pt-32 sm:px-6">
      <div className="mb-10 animate-rise">
        <p className="text-[0.72rem] uppercase tracking-[0.24em] text-gold/90">Suporte</p>
        <h1 className="mt-3 font-serif text-5xl text-paper">Estamos aqui.</h1>
        <p className="mt-3 max-w-lg text-mute">Dúvidas sobre a conta, pagamentos ou conteúdos? Escreva-nos.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-[1.5fr_1fr]">
        <div className="glass p-6 sm:p-8">
          <SupportForm name={user?.fullName} email={user?.email} />
        </div>
        <aside className="glass space-y-4 p-6 text-sm text-paper/80">
          {s.support.email && <p className="flex items-center gap-3"><Mail className="h-4 w-4 text-gold" /> <a href={`mailto:${s.support.email}`} className="hover:text-paper">{s.support.email}</a></p>}
          {s.support.phone && <p className="flex items-center gap-3"><Phone className="h-4 w-4 text-gold" /> {s.support.phone}</p>}
          {s.support.whatsapp && <p className="flex items-center gap-3"><MessageCircle className="h-4 w-4 text-gold" /> WhatsApp {s.support.whatsapp}</p>}
          {s.support.hours && <p className="text-mute">{s.support.hours}</p>}
          {!s.support.email && !s.support.phone && !s.support.whatsapp && <p className="text-mute">Use o formulário para nos contactar.</p>}
        </aside>
      </div>
    </section>
  );
}
