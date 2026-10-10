import { describe, expect, it } from "vitest";
import { renderAccountConfirmEmail } from "@/lib/notifications/render";

const opts = { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" };

describe("e-mail de confirmação de conta", () => {
  it("leva o link de confirmação no botão e no texto, com o primeiro nome", () => {
    const link = "https://www.aurea-som.site/auth/confirm?token_hash=abc123&type=signup&next=/app";
    const m = renderAccountConfirmEmail("Ana Maria Silva", link, opts);
    expect(m.subject).toBe("AUREA · confirme o seu e-mail");
    expect(m.html).toContain(link.replace(/&/g, "&amp;"));
    expect(m.text).toContain(link);
    expect(m.text).toContain("Olá, Ana.");
    expect(m.html).not.toMatch(/\{\{|\[TESTE\]/);
  });

  it("sem nome usa uma saudação neutra", () => {
    expect(renderAccountConfirmEmail("  ", "https://x.test/c", opts).text).toContain("Olá.");
  });
});
