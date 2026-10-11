import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { parseUtmCookie, UTM_COOKIE, withUtm } from "@/lib/utm";
import { ExternalLink, ShieldCheck, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getActivePlans, getPlanByCode } from "@/lib/plans";
import { basePlan, computeSavings, durationLabel, formatKz } from "@/lib/pricing";
import { getSubscriptionView } from "@/lib/subscription";
import { formatDate } from "@/lib/format";
import { CreateOrderForm } from "./CreateOrderForm";
import { buttonClass } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Pagamento" };

export default async function CheckoutPage({ params }: { params: Promise<{ plano: string }> }) {
  const { plano } = await params;
  const user = await requireUser(`/checkout/${plano}`);
  const [plan, plans, view] = await Promise.all([getPlanByCode(plano), getActivePlans(), getSubscriptionView(user.id)]);
  if (!plan) notFound();
  const savings = computeSavings(plan, basePlan(plans) ?? plan);
  // Leva a origem do anúncio até à Kursinha (rastreio de vendas por campanha).
  const checkoutHref = plan.checkout_url ? withUtm(plan.checkout_url, parseUtmCookie((await cookies()).get(UTM_COOKIE)?.value)) : null;

  return (
    <section className="mx-auto max-w-4xl px-4 pb-16 pt-32 sm:px-6">
      <Link href="/planos" className="text-sm text-mute hover:text-paper">← Planos</Link>
      <h1 className="mt-4 font-serif text-4xl text-paper sm:text-5xl animate-rise">Confirmar plano</h1>
      <div className="mt-8 grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <div className="glass glass-sheen p-6 sm:p-8 animate-rise">
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-gold/90">Plano {plan.name}</p>
          <p className="mt-3 font-serif text-5xl text-paper tabular-nums">{formatKz(plan.amount_minor)}</p>
          <p className="mt-1 text-sm text-mute">Acesso premium durante {durationLabel(plan.duration_months)}</p>
          {savings && <p className="mt-3 text-sm text-gold-light">Poupa {formatKz(savings.savingsMinor)} face ao plano mensal.</p>}
          {view.hasAccess && view.sub?.expires_at && (
            <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-paper/75">
              A sua assinatura está ativa até <strong className="text-paper">{formatDate(view.sub.expires_at)}</strong>. O novo período soma-se a essa data.
            </p>
          )}
          <ul className="mt-6 space-y-2 border-t border-white/[0.07] pt-6 text-sm text-paper/70">
            {plan.features.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
        </div>
        {plan.checkout_url ? (
          <div className="glass p-6 sm:p-8 animate-rise" style={{ animationDelay: "80ms" }}>
            <p className="text-[0.72rem] uppercase tracking-[0.2em] text-mute">Pagamento</p>
            <p className="mt-4 text-sm leading-relaxed text-paper/80">
              O pagamento é feito na <strong className="text-paper">Kursinha</strong>, por Multicaixa Express, referência ou cartão.
            </p>
            <div className="mt-5 rounded-2xl border border-gold/35 bg-gold/[0.06] p-4 text-sm">
              <p className="text-mute">Na Kursinha, use exatamente este e-mail:</p>
              <p className="mt-1 break-all font-medium text-paper">{user.email}</p>
            </div>
            <a
              href={checkoutHref ?? plan.checkout_url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("gold", "lg", "mt-6 w-full")}
            >
              Pagar {formatKz(plan.amount_minor)} na Kursinha <ExternalLink className="h-4 w-4" />
            </a>
            <p className="mt-4 flex items-start gap-2 text-xs text-mute">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Assim que a Kursinha confirmar o pagamento, o plano fica ativo nesta conta automaticamente. Não há renovação nem cobranças automáticas.
            </p>
            <Link href="/app" className="mt-5 inline-block text-sm text-gold-light hover:underline">Já paguei, ir para a biblioteca →</Link>
          </div>
        ) : (
        <div className="glass p-6 sm:p-8 animate-rise" style={{ animationDelay: "80ms" }}>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-mute">Método de pagamento</p>
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-gold/35 bg-gold/[0.06] p-4">
            <Smartphone className="h-5 w-5 text-gold" />
            <div>
              <p className="font-medium text-paper">Multicaixa Express</p>
              <p className="text-xs text-mute">Único método disponível</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-mute">
            Ao continuar, criamos um pedido com uma referência AUREA única e mostramos as instruções de pagamento. Não há renovação nem cobranças automáticas.
          </p>
          <div className="mt-6">
            <CreateOrderForm plan={plan.code} />
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-mute">
            <ShieldCheck className="h-3.5 w-3.5" /> O acesso só é ativado após confirmação do pagamento.
          </p>
        </div>
        )}
      </div>
    </section>
  );
}
