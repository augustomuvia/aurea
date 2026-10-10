import { describe, expect, it } from "vitest";
import { basePlan, computeSavings, formatKz } from "@/lib/pricing";

const mensal = { amount_minor: 500000, duration_months: 1 };
const trimestral = { amount_minor: 1200000, duration_months: 3 };
const anual = { amount_minor: 3000000, duration_months: 12 };

describe("preços em kwanzas", () => {
  it("formata sem vírgula flutuante", () => {
    expect(formatKz(500000)).toBe("5.000 Kz");
    expect(formatKz(1200000)).toBe("12.000 Kz");
    expect(formatKz(3000000)).toBe("30.000 Kz");
    expect(formatKz(123456789)).toBe("1.234.567,89 Kz");
    expect(formatKz(5)).toBe("0,05 Kz");
  });

  it("trimestral poupa 3.000 Kz face a 3 × mensal", () => {
    expect(computeSavings(trimestral, mensal)).toEqual({ baselineMinor: 1500000, savingsMinor: 300000, savingsPercent: 20, monthlyEquivalentMinor: 400000 });
  });

  it("anual poupa 30.000 Kz face a 12 × mensal", () => {
    expect(computeSavings(anual, mensal)).toEqual({ baselineMinor: 6000000, savingsMinor: 3000000, savingsPercent: 50, monthlyEquivalentMinor: 250000 });
  });

  it("sem poupança para o próprio plano base ou preço superior", () => {
    expect(computeSavings(mensal, mensal)).toBeNull();
    expect(computeSavings({ amount_minor: 2000000, duration_months: 3 }, mensal)).toBeNull();
  });

  it("recalcula automaticamente quando o admin altera preços", () => {
    expect(computeSavings(anual, { amount_minor: 400000, duration_months: 1 })?.savingsMinor).toBe(1800000);
  });

  it("plano base é o de menor duração", () => {
    expect(basePlan([anual, trimestral, mensal])).toBe(mensal);
  });
});
