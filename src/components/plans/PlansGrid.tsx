import { Check } from "lucide-react";
import type { Plan } from "@/lib/types";
import { basePlan, computeSavings, durationLabel, formatKz } from "@/lib/pricing";
import { ButtonLink } from "@/components/ui/Button";

export function PlansGrid({ plans, currentPlanCode }: { plans: Plan[]; currentPlanCode?: string | null }) {
  if (!plans.length) {
    return <p className="text-center text-sm text-mute">Os planos estarão disponíveis em breve.</p>;
  }
  const base = basePlan(plans)!;
  return (
    <div className="grid gap-4 md:grid-cols-3 md:gap-5">
      {plans.map((plan, i) => {
        const savings = computeSavings(plan, base);
        const highlighted = plan.is_highlighted;
        return (
          <article
            key={plan.id}
            className={`glass glass-sheen relative flex flex-col p-6 animate-rise sm:p-7 ${highlighted ? "border-gold/40 shadow-[0_0_0_1px_rgba(214,180,106,0.15),0_30px_80px_-40px_rgba(214,180,106,0.45)]" : ""}`}
            style={{ animationDelay: `${i * 80}ms` }}
            aria-label={`Plano ${plan.name}`}
          >
            {highlighted && (
              <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-b from-gold-light to-gold px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink">
                Melhor valor
              </span>
            )}
            <h3 className="font-serif text-3xl text-paper">{plan.name}</h3>
            <p className="mt-1 text-sm text-mute">{plan.description}</p>
            <p className="mt-7 flex items-baseline gap-2">
              <span className="font-serif text-5xl tracking-tight text-paper tabular-nums">{formatKz(plan.amount_minor).replace(" Kz", "")}</span>
              <span className="text-sm text-mute">Kz / {durationLabel(plan.duration_months)}</span>
            </p>
            <div className="mt-3 min-h-[3.25rem] text-sm">
              {savings ? (
                <>
                  <p className="text-gold-light">
                    Poupa {formatKz(savings.savingsMinor)} ({savings.savingsPercent}%)
                  </p>
                  <p className="text-mute">
                    vs. {plan.duration_months / base.duration_months} × {base.name.toLowerCase()} = <s>{formatKz(savings.baselineMinor)}</s> · equivale a{" "}
                    {formatKz(savings.monthlyEquivalentMinor)}/mês
                  </p>
                </>
              ) : (
                <p className="text-mute">Sem compromisso. Renove quando quiser.</p>
              )}
            </div>
            <ul className="mt-6 flex-1 space-y-2.5 border-t border-white/[0.07] pt-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-paper/75">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.8} />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-7">
              {currentPlanCode === plan.code ? (
                <ButtonLink href={`/checkout/${plan.code}`} variant="glass" className="w-full">
                  Renovar {plan.name.toLowerCase()}
                </ButtonLink>
              ) : (
                <ButtonLink href={`/checkout/${plan.code}`} variant={highlighted ? "gold" : "glass"} className="w-full">
                  Escolher {plan.name.toLowerCase()}
                </ButtonLink>
              )}
              <p className="mt-3 text-center text-[0.72rem] text-mute">Pagamento por Multicaixa Express · sem renovação automática</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
