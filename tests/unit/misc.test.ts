import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";
import { csvCell, slugify } from "@/lib/format";
import { registerSchema } from "@/lib/validation";

describe("redirecionamentos seguros", () => {
  it.each([
    ["/app/biblioteca", "/app/biblioteca"],
    ["//evil.com", "/app"],
    ["/\\evil.com", "/app"],
    ["https://evil.com", "/app"],
    [null, "/app"],
  ])("%s → %s", (input, out) => expect(safeNext(input)).toBe(out));
});

describe("exportação CSV", () => {
  it("neutraliza fórmulas e escapa separadores", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
    expect(csvCell(null)).toBe("");
  });
});

describe("registo", () => {
  const base = { fullName: "Ana", email: "ANA@Exemplo.ao ", password: "segredo1234", acceptTerms: "on" };
  it("normaliza o e-mail e exige termos", () => {
    const r = registerSchema.safeParse(base);
    expect(r.success && r.data.email).toBe("ana@exemplo.ao");
    expect(registerSchema.safeParse({ ...base, acceptTerms: undefined }).success).toBe(false);
  });
  it("rejeita palavras-passe fracas", () => {
    expect(registerSchema.safeParse({ ...base, password: "curta1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "semnumerosaqui" }).success).toBe(false);
  });
  it("ignora campos extra como role", () => {
    const r = registerSchema.safeParse({ ...base, role: "super_admin" });
    expect(r.success && "role" in r.data).toBe(false);
  });
});

describe("slugs", () => {
  it("remove acentos", () => expect(slugify("Meditação 432 Hz — Noite")).toBe("meditacao-432-hz-noite"));
});
