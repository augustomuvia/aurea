import type { Metadata } from "next";
import { getActivePlans } from "@/lib/plans";
import { PlansGrid } from "@/components/plans/PlansGrid";
import { getSessionUser } from "@/lib/auth";
import { getSubscriptionView } from "@/lib/subscription";

export const metadata: Metadata = { title: "Planos e preços", description: "Planos mensal, trimestral e anual em kwanzas, pagos por Multicaixa Express." };

export default async function PlansPage() {
  const [plans, user] = await Promise.all([getActivePlans(), getSessionUser()]);
  const view = user ? await getSubscriptionView(user.id) : null;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 pt-32 sm:px-6">
      <div className="mb-12 text-center animate-rise">
        <p className="text-[0.72rem] uppercase tracking-[0.24em] text-gold/90">Planos</p>
        <h1 className="mt-3 font-serif text-5xl text-paper sm:text-6xl">Escolha o seu ritmo.</h1>
        <p className="mx-auto mt-4 max-w-lg text-[0.95rem] text-mute">Todos os planos incluem a biblioteca completa. Pagamento exclusivo por Multicaixa Express, sem renovação automática.</p>
      </div>
      <PlansGrid plans={plans} currentPlanCode={view?.hasAccess ? view.sub?.plans?.code : null} />
      <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-relaxed text-mute">
        Preços em kwanzas (Kz), com impostos aplicáveis incluídos quando devidos. A poupança é calculada automaticamente a partir dos preços em vigor. A AUREA oferece experiências de bem-estar e não
        substitui aconselhamento médico.
      </p>
    </section>
  );
}
