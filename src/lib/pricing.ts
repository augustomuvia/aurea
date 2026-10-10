import type { Plan } from "@/lib/types";

/** Formata cêntimos de kwanza como "5.000 Kz". Usa apenas aritmética inteira. */
export function formatKz(amountMinor: number | bigint): string {
  const v = BigInt(amountMinor);
  const whole = v / 100n;
  const cents = v % 100n;
  const base = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cents === 0n ? `${base} Kz` : `${base},${cents.toString().padStart(2, "0")} Kz`;
}

export interface PlanSavings {
  /** Custo equivalente pagando o plano base (mensal) mês a mês. */
  baselineMinor: number;
  savingsMinor: number;
  savingsPercent: number;
  monthlyEquivalentMinor: number;
}

/** Calcula a poupança real de um plano face ao plano base (o de menor duração). */
export function computeSavings(plan: Pick<Plan, "amount_minor" | "duration_months">, base: Pick<Plan, "amount_minor" | "duration_months">): PlanSavings | null {
  if (base.duration_months <= 0 || plan.duration_months <= base.duration_months) return null;
  if (plan.duration_months % base.duration_months !== 0) return null;
  const baselineMinor = (base.amount_minor * plan.duration_months) / base.duration_months;
  const savingsMinor = baselineMinor - plan.amount_minor;
  if (savingsMinor <= 0) return null;
  return {
    baselineMinor,
    savingsMinor,
    savingsPercent: Math.round((savingsMinor * 100) / baselineMinor),
    monthlyEquivalentMinor: Math.round(plan.amount_minor / plan.duration_months),
  };
}

export function basePlan<T extends Pick<Plan, "duration_months">>(plans: T[]): T | undefined {
  return [...plans].sort((a, b) => a.duration_months - b.duration_months)[0];
}

export function durationLabel(months: number) {
  if (months === 1) return "1 mês";
  if (months === 12) return "12 meses";
  return `${months} meses`;
}
