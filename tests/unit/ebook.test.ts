import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkCheckoutUrl, DEFAULT_EBOOK, parseKzToMinor, resolveEbookConfig, sellableProblems } from "@/lib/ebook/config";
import { detectImageKind, EBOOK_MEDIA_PATH } from "@/lib/ebook/media";
import { formatKz } from "@/lib/pricing";

// ---------------------------------------------------------------- checkout

describe("validação do URL de checkout da Kursinha", () => {
  it("aceita https válido e remove o fragmento", () => {
    const r = checkCheckoutUrl("https://pay.kursinha-loja.com/p/aurea-guide?ref=ads#topo");
    expect(r).toEqual({ ok: true, url: "https://pay.kursinha-loja.com/p/aurea-guide?ref=ads", host: "pay.kursinha-loja.com" });
  });

  it.each([
    ["http://checkout.loja.com/p/1", "https://"],
    ["javascript:alert(1)", "https://"],
    ["data:text/html,oi", "https://"],
    ["ftp://loja.com/x", "https://"],
    ["https://user:pass@loja.com/p", "credenciais"],
    ["https://loja.com:8443/p", "porta"],
    ["https://localhost/p", "Domínio inválido"],
    ["https://127.0.0.1/p", "IP"],
    ["https://[::1]/p", "Domínio inválido"],
    ["https://intranet/p", "Domínio inválido"],
    ["https://example.com/checkout", "exemplo"],
    ["nada", "inválido"],
    ["", "Indique"],
  ])("rejeita %s", (url, msg) => {
    const r = checkCheckoutUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it("com domínios autorizados, aceita só esses (e subdomínios)", () => {
    const allowed = ["kursinha.com"];
    expect(checkCheckoutUrl("https://kursinha.com/p/1", allowed).ok).toBe(true);
    expect(checkCheckoutUrl("https://pay.kursinha.com/p/1", allowed).ok).toBe(true);
    expect(checkCheckoutUrl("https://kursinha.com.evil.io/p/1", allowed).ok).toBe(false);
    expect(checkCheckoutUrl("https://evilkursinha.com/p/1", allowed).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- preço e configuração

describe("preço e configuração", () => {
  it("converte Kz em cêntimos sem aceitar decimais ou lixo", () => {
    expect(parseKzToMinor("2500")).toBe(250_000);
    expect(parseKzToMinor("2.500")).toBe(250_000);
    expect(parseKzToMinor("2 500 Kz")).toBe(250_000);
    expect(parseKzToMinor("2500,50")).toBeNull();
    expect(parseKzToMinor("-10")).toBeNull();
    expect(parseKzToMinor("")).toBeNull();
    expect(formatKz(parseKzToMinor("3.000")!)).toBe("3.000 Kz");
  });

  it("os valores por omissão seguem a especificação (2.500 Kz, textos e FAQ)", () => {
    expect(formatKz(DEFAULT_EBOOK.priceMinor)).toBe("2.500 Kz");
    expect(DEFAULT_EBOOK.hero.cta).toBe("DESCOBRIR O GUIA");
    expect(DEFAULT_EBOOK.oferta.cta).toBe("QUERO O MEU GUIA");
    expect(DEFAULT_EBOOK.faq).toHaveLength(6);
    expect(DEFAULT_EBOOK.checkoutUrl).toBe("");
  });

  it("junta o guardado com os valores por omissão e ignora lixo", () => {
    const cfg = resolveEbookConfig({ priceMinor: 300_000, hero: { title: "Outro título" }, desconhecido: 1 });
    expect(cfg.priceMinor).toBe(300_000);
    expect(cfg.hero.title).toBe("Outro título");
    expect(cfg.hero.cta).toBe(DEFAULT_EBOOK.hero.cta);
    expect(resolveEbookConfig(null)).toEqual(DEFAULT_EBOOK);
    expect(resolveEbookConfig({ priceMinor: "grátis" })).toEqual(DEFAULT_EBOOK);
  });

  it("sem checkout válido a página não é vendável", () => {
    expect(sellableProblems(DEFAULT_EBOOK, [])).not.toHaveLength(0);
    expect(sellableProblems({ ...DEFAULT_EBOOK, checkoutUrl: "https://loja.kursinha.com/p/1" }, [])).toEqual([]);
    expect(sellableProblems({ ...DEFAULT_EBOOK, checkoutUrl: "https://loja.kursinha.com/p/1" }, ["outra.com"])).not.toHaveLength(0);
  });
});

describe("imagens da página", () => {
  it("deteta PNG, JPG e WebP pelo conteúdo", () => {
    expect(detectImageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(detectImageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))?.ext).toBe("jpg");
    expect(detectImageKind(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.ext).toBe("webp");
    expect(detectImageKind(new TextEncoder().encode("<svg onload=x>"))).toBeNull();
  });
  it("só aceita caminhos gerados pelo servidor", () => {
    expect(EBOOK_MEDIA_PATH.test("cover/0123456789abcdef.png")).toBe(true);
    expect(EBOOK_MEDIA_PATH.test("../payment-proofs/x.png")).toBe(false);
    expect(EBOOK_MEDIA_PATH.test("previews/0123456789abcdef.svg")).toBe(false);
  });
});

// ---------------------------------------------------------------- rota pública e redirecionamento

const state: { row: Record<string, unknown> | null } = { row: null };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }) }),
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
  }),
}));

const CHECKOUT = "https://loja.kursinha.com/p/aurea-guide";
const published = { ...DEFAULT_EBOOK, checkoutUrl: CHECKOUT, priceMinor: 320_000 };

async function load() {
  vi.resetModules();
  const server = await import("@/lib/ebook/server");
  const route = await import("@/app/ebook/comprar/route");
  return { server, route };
}

describe("controlo de publicação no servidor", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
    delete process.env.EBOOK_CHECKOUT_ALLOWED_HOSTS;
  });

  it("sem configuração: página fechada e compra volta a /ebook", async () => {
    state.row = null;
    const { server, route } = await load();
    expect(await server.getPublicEbook()).toBeNull();
    const res = await route.GET(new Request("https://www.aurea-som.site/ebook/comprar"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.aurea-som.site/ebook");
  });

  it("publicada mas desativada: fechada", async () => {
    state.row = { id: 1, enabled: false, draft: published, published, published_at: "2026-10-10T00:00:00Z", updated_at: null };
    const { server } = await load();
    expect(await server.getPublicEbook()).toBeNull();
  });

  it("ativa mas com checkout inválido: fechada", async () => {
    state.row = { id: 1, enabled: true, draft: published, published: { ...published, checkoutUrl: "http://loja.com/p" }, published_at: null, updated_at: null };
    const { server } = await load();
    expect(await server.getPublicEbook()).toBeNull();
  });

  it("ativa, com o preço do admin, e a compra redireciona só para o checkout configurado", async () => {
    state.row = { id: 1, enabled: true, draft: DEFAULT_EBOOK, published, published_at: null, updated_at: null };
    const { server, route } = await load();
    const ebook = await server.getPublicEbook();
    expect(ebook?.config.priceMinor).toBe(320_000);
    // O rascunho (diferente) nunca é mostrado ao público.
    expect(ebook?.config.checkoutUrl).toBe(CHECKOUT);
    const res = await route.GET(new Request("https://www.aurea-som.site/ebook/comprar?url=https://evil.io"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(CHECKOUT);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("respeita a lista de domínios autorizados do servidor", async () => {
    process.env.EBOOK_CHECKOUT_ALLOWED_HOSTS = "outra-loja.com";
    state.row = { id: 1, enabled: true, draft: published, published, published_at: null, updated_at: null };
    const { server } = await load();
    expect(await server.getPublicEbook()).toBeNull();
  });
});

// ---------------------------------------------------------------- sem ligações públicas

describe("página não divulgada", () => {
  const root = join(__dirname, "../../src");
  const allowed = [/^app\/ebook\//, /^app\/admin\/ebook\//, /^components\/ebook\//, /^lib\/ebook\//];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|mdx?)$/.test(name)) files.push(full);
    }
  };
  walk(root);

  it("nenhuma página, menu ou rodapé fora do e-book e do admin aponta para /ebook", () => {
    const offenders = files
      .map((f) => relative(root, f).replace(/\\/g, "/"))
      .filter((rel) => !allowed.some((re) => re.test(rel)))
      .filter((rel) => /["'`(]\/ebook\b/.test(readFileSync(join(root, rel), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("não existe sitemap a divulgar o endereço", () => {
    const sitemaps = files.filter((f) => /sitemap\.(ts|tsx|xml)$/.test(f));
    for (const f of sitemaps) expect(readFileSync(f, "utf8")).not.toContain("/ebook");
  });

  it("a página e o redirecionamento declaram noindex", () => {
    expect(readFileSync(join(root, "app/ebook/layout.tsx"), "utf8")).toMatch(/index: false/);
    expect(readFileSync(join(root, "../next.config.ts"), "utf8")).toMatch(/\/ebook[\s\S]*X-Robots-Tag[\s\S]*noindex/);
  });
});
