import { describe, expect, it } from "vitest";
import { parseUtmCookie, utmFromSearch, withUtm } from "@/lib/utm";

describe("origem dos anúncios (UTMs)", () => {
  it("lê só os parâmetros de rastreio", () => {
    const s = new URLSearchParams("utm_source=FB&utm_campaign=sono%7C123&fbclid=abc&x=1");
    expect(utmFromSearch(s)).toEqual({ utm_source: "FB", utm_campaign: "sono|123", fbclid: "abc" });
    expect(utmFromSearch(new URLSearchParams("q=chuva"))).toBeNull();
  });

  it("junta as UTMs ao link da Kursinha sem apagar parâmetros existentes", () => {
    const url = withUtm("https://pay.kursinha.com/c/abc?ref=1&utm_source=site", { utm_source: "FB", utm_campaign: "sono" });
    const u = new URL(url);
    expect(u.searchParams.get("ref")).toBe("1");
    expect(u.searchParams.get("utm_source")).toBe("site");
    expect(u.searchParams.get("utm_campaign")).toBe("sono");
  });

  it("ignora cookies inválidos ou com chaves estranhas", () => {
    expect(parseUtmCookie("{bad")).toEqual({});
    expect(parseUtmCookie(JSON.stringify({ utm_source: "FB", evil: "x" }))).toEqual({ utm_source: "FB" });
    expect(withUtm("não é url", { utm_source: "FB" })).toBe("não é url");
  });
});
