import { describe, expect, it } from "vitest";
import { renderEmail, validateTemplate } from "@/lib/notifications/render";
import { TEMPLATE_KEYS, TEMPLATES } from "@/lib/notifications/templates";
import { buildVars, luandaDaysUntil, samplePayload } from "@/lib/notifications/vars";
import { buildMime, encodeHeader, filenameParams } from "@/lib/notifications/mime";
import { buildReceiptPdf, receiptFromPayload } from "@/lib/receipts/receipt";
import { cleanEnvValue, diagnoseGoogleEnv, getEmailProvider, gmailProvider } from "@/lib/notifications/providers";

const opts = { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" };

describe("modelos", () => {
  it("todos os modelos originais são válidos e renderizam sem variáveis por preencher", () => {
    for (const k of TEMPLATE_KEYS) {
      expect(validateTemplate(k, TEMPLATES[k].defaults), k).toEqual([]);
      const r = renderEmail(k, TEMPLATES[k].defaults, buildVars(k, samplePayload(k), opts), { ...opts, test: true });
      expect(r.html, k).not.toMatch(/\{\{|\}\}/);
      expect(r.text, k).not.toMatch(/\{\{|\}\}/);
      expect(r.subject.startsWith("[TESTE] "), k).toBe(true);
      expect(r.html, k).not.toMatch(/<script/i);
      expect(r.text, k).toContain("suporte@aurea-som.site");
    }
  });

  it("recusa variáveis desconhecidas, de outro modelo, mal fechadas e obrigatórias em falta", () => {
    const base = TEMPLATES.expiring_5.defaults;
    expect(validateTemplate("expiring_5", { ...base, body: `${base.body} {{password}}` })[0].message).toMatch(/não existe/);
    expect(validateTemplate("expiring_5", { ...base, body: `${base.body} {{mcx_numero}}` })[0].message).toMatch(/não está disponível/);
    expect(validateTemplate("expiring_5", { ...base, body: `${base.body} {{nome` })[0].message).toMatch(/mal fechadas/);
    const noDate = { ...base, subject: "Aviso", body: "Olá, a sua assinatura termina em breve." };
    expect(validateTemplate("expiring_5", noDate).some((i) => /data_expiracao/.test(i.message))).toBe(true);
    expect(validateTemplate("payment_requested", { ...TEMPLATES.payment_requested.defaults, subject: "Pedido\nX" }).some((i) => i.field === "subject")).toBe(true);
  });

  it("escapa conteúdo dinâmico e mantém o botão num link interno", () => {
    const vars = buildVars("welcome", { nome: '<img src=x onerror="alert(1)">' }, opts);
    const r = renderEmail("welcome", TEMPLATES.welcome.defaults, vars, opts);
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;img");
    expect(r.html).toContain('href="https://www.aurea-som.site/app"');
  });

  it("versão em texto simples e HTML com estrutura acessível", () => {
    const k = "payment_requested";
    const r = renderEmail(k, TEMPLATES[k].defaults, buildVars(k, samplePayload(k), opts), opts);
    expect(r.html).toContain('lang="pt"');
    expect(r.html).toContain("<h1");
    expect(r.html).toMatch(/role="presentation"/);
    expect(r.text).toContain("Valor a pagar: 5.000 Kz");
    expect(r.text).toContain("Ver o estado do pedido: https://www.aurea-som.site/checkout/estado?ref=AUR-DEMO0000");
  });
});

describe("datas em Africa/Luanda", () => {
  it("conta dias de calendário em Luanda (UTC+1)", () => {
    const now = new Date("2026-11-10T22:30:00Z"); // 23:30 em Luanda, dia 10
    expect(luandaDaysUntil("2026-11-20T14:00:00Z", now)).toBe(10);
    expect(luandaDaysUntil("2026-11-20T23:30:00Z", now)).toBe(11); // já é dia 21 em Luanda
    expect(luandaDaysUntil("2026-11-10T23:10:00Z", now)).toBe(1); // 00:10 do dia 11
  });

  it("os dias restantes do e-mail são calculados no momento do envio", () => {
    const v = buildVars("expiring_10", { expires_at: "2026-11-20T14:00:00Z" }, { ...opts, now: new Date("2026-11-11T08:00:00Z") });
    expect(v.dias_restantes).toBe("9");
    expect(v.data_expiracao).toBe("20 de novembro de 2026");
  });
});

describe("MIME", () => {
  it("monta multipart com texto e HTML, cabeçalhos codificados e remetente com nome", () => {
    const raw = buildMime({
      from: { name: "AUREA | Suporte", email: "suporte@aurea-som.site" },
      to: "cliente@exemplo.ao",
      replyTo: "suporte@aurea-som.site",
      subject: "Último dia da sua assinatura AUREA",
      text: "Olá",
      html: "<p>Olá</p>",
    });
    expect(raw).toContain('From: "AUREA | Suporte" <suporte@aurea-som.site>');
    expect(raw).toContain("To: <cliente@exemplo.ao>");
    expect(raw).toContain(`Subject: ${encodeHeader("Último dia da sua assinatura AUREA")}`);
    expect(raw).toMatch(/Content-Type: multipart\/alternative; boundary="aurea_[0-9a-f]+"/);
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it("com anexos: multipart/mixed com a mensagem e o PDF em base64 (linhas de 76)", () => {
    const pdf = buildReceiptPdf(receiptFromPayload(samplePayload("payment_receipt"), { ...opts, demo: true }));
    const base = { from: { name: "AUREA", email: "suporte@aurea-som.site" }, to: "cliente@exemplo.ao", subject: "Recibo", text: "Olá", html: "<p>Olá</p>" };
    const plain = buildMime(base);
    expect(plain).not.toContain("multipart/mixed");
    expect(buildMime({ ...base, attachments: [] })).not.toContain("multipart/mixed");

    const raw = buildMime({ ...base, attachments: [{ filename: "Recibo-AUR-DEMO0000.pdf", contentType: "application/pdf", content: pdf }] });
    const mixed = /Content-Type: multipart\/mixed; boundary="(aurea_mx_[0-9a-f]+)"/.exec(raw)![1];
    const alt = /Content-Type: multipart\/alternative; boundary="(aurea_[0-9a-f]+)"/.exec(raw)![1];
    const parts = raw.split(`--${mixed}`);
    expect(parts).toHaveLength(4); // cabeçalhos, alternativa, anexo, fim
    expect(parts[1]).toContain(`--${alt}--`);
    expect(parts[2]).toContain('Content-Type: application/pdf; name="Recibo-AUR-DEMO0000.pdf"');
    expect(parts[2]).toContain('Content-Disposition: attachment; filename="Recibo-AUR-DEMO0000.pdf"');
    expect(parts[3]).toBe("--\r\n");
    const body = parts[2].split("\r\n\r\n")[1].trim();
    expect(body.split("\r\n").every((l) => l.length <= 76)).toBe(true);
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").equals(Buffer.from(pdf))).toBe(true);
    expect(raw.split("\r\n").every((l) => l.length <= 998)).toBe(true);
  });

  it("nome de ficheiro seguro (RFC 2231) e recusa anexos inválidos", () => {
    expect(filenameParams("filename", "Recibo-AUR-1.pdf")).toBe('filename="Recibo-AUR-1.pdf"');
    expect(filenameParams("filename", "Recibo ção.pdf")).toBe(`filename="Recibo cao.pdf"; filename*=UTF-8''Recibo%20%C3%A7%C3%A3o.pdf`);
    const inj = filenameParams("filename", 'a"\r\nBcc: x.pdf');
    expect(inj).not.toMatch(/[\r\n]/);
    expect(inj.split('"')).toHaveLength(3);
    const m = { from: { name: "AUREA", email: "suporte@aurea-som.site" }, to: "a@b.ao", subject: "x", text: "x", html: "x" };
    expect(() => buildMime({ ...m, attachments: [{ filename: "a.pdf", contentType: "application/pdf\r\nX: y", content: new Uint8Array(1) }] })).toThrow();
    expect(() => buildMime({ ...m, attachments: [{ filename: "a.pdf", contentType: "application/pdf", content: new Uint8Array(4 * 1024 * 1024) }] })).toThrow(/demasiado grandes/);
  });

  it("impede injeção de cabeçalhos e endereços inválidos", () => {
    const m = { from: { name: "AUREA", email: "suporte@aurea-som.site" }, to: "a@b.ao", subject: "x", text: "x", html: "x" };
    expect(() => buildMime({ ...m, subject: "x\r\nBcc: alvo@x.com" })).toThrow();
    expect(() => buildMime({ ...m, to: "a@b.ao>\r\nBcc: c@d.ao" })).toThrow();
  });
});

describe("Gmail API", () => {
  const env = { EMAIL_PROVIDER: "gmail", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh" };
  const msg = { from: { name: "AUREA | Suporte", email: "suporte@aurea-som.site" }, to: "cliente@exemplo.ao", subject: "Teste", text: "t", html: "<p>t</p>" };

  function fakeFetch(handlers: { token?: () => Response; send?: (body: { raw: string }) => Response }) {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) return handlers.token?.() ?? Response.json({ access_token: "at", expires_in: 3600 });
      return handlers.send?.(JSON.parse(String(init.body))) ?? Response.json({ id: "18c0ffee" });
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  it("sem credenciais fica por configurar e não envia", async () => {
    expect(getEmailProvider({}).missing()).toEqual(["EMAIL_PROVIDER"]);
    expect(gmailProvider({ EMAIL_PROVIDER: "gmail" }).missing()).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]);
    const r = await getEmailProvider({}).send(msg);
    expect(r.ok).toBe(false);
  });

  it("troca o refresh token, envia a mensagem MIME e devolve o id do Gmail", async () => {
    let raw = "";
    const { f, calls } = fakeFetch({ send: (b) => ((raw = b.raw), Response.json({ id: "18c0ffee" })) });
    const r = await gmailProvider(env, f).send(msg);
    expect(r).toEqual({ ok: true, messageId: "18c0ffee" });
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(String(calls[0].init.body)).toContain("grant_type=refresh_token");
    expect(calls[1].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer at");
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(decoded).toContain('From: "AUREA | Suporte" <suporte@aurea-som.site>');
  });

  it("envia mensagens com o recibo anexado (raw muito abaixo do limite do Gmail)", async () => {
    let raw = "";
    const { f } = fakeFetch({ send: (b) => ((raw = b.raw), Response.json({ id: "18c0ffee" })) });
    const pdf = buildReceiptPdf(receiptFromPayload(samplePayload("plan_activated"), { ...opts, demo: true }));
    const r = await gmailProvider(env, f).send({ ...msg, attachments: [{ filename: "Recibo-AUR-DEMO0000.pdf", contentType: "application/pdf", content: pdf }] });
    expect(r.ok).toBe(true);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(raw.length).toBeLessThan(100_000);
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(decoded).toContain("multipart/mixed");
    expect(decoded).toContain('filename="Recibo-AUR-DEMO0000.pdf"');
  });

  it("classifica erros: credenciais (configuração), 5xx (repetir) e 400 (definitivo)", async () => {
    const bad = await gmailProvider(env, fakeFetch({ token: () => Response.json({ error: "invalid_grant" }, { status: 400 }) }).f).send(msg);
    expect(bad).toMatchObject({ ok: false, permanent: false, config: true });
    const down = await gmailProvider(env, fakeFetch({ send: () => Response.json({ error: { message: "x" } }, { status: 503 }) }).f).send(msg);
    expect(down).toMatchObject({ ok: false, permanent: false });
    const invalid = await gmailProvider(env, fakeFetch({ send: () => Response.json({ error: { message: "Invalid To header" } }, { status: 400 }) }).f).send(msg);
    expect(invalid).toMatchObject({ ok: false, permanent: true });
    const scope = await gmailProvider(env, fakeFetch({ send: () => Response.json({ error: { message: "Insufficient Permission" } }, { status: 403 }) }).f).send(msg);
    expect(scope).toMatchObject({ ok: false, permanent: false, config: true });
  });

  it("ignora espaços, quebras de linha e aspas coladas na Vercel", async () => {
    expect(cleanEnvValue("  123-abc.apps.googleusercontent.com\n")).toBe("123-abc.apps.googleusercontent.com");
    expect(cleanEnvValue('"gmail"')).toBe("gmail");
    expect(cleanEnvValue("   ")).toBeUndefined();
    const padded = { EMAIL_PROVIDER: " gmail\n", GOOGLE_CLIENT_ID: "id\n", GOOGLE_CLIENT_SECRET: " secret ", GOOGLE_REFRESH_TOKEN: "refresh\r\n" };
    let body = "";
    const f = (async (url: string, init: RequestInit) => {
      if (url.includes("oauth2")) return (body = String(init.body)), Response.json({ access_token: "at", expires_in: 3600 });
      return Response.json({ id: "x" });
    }) as unknown as typeof fetch;
    expect(getEmailProvider(padded).id).toBe("gmail");
    await gmailProvider({ GOOGLE_CLIENT_ID: cleanEnvValue(padded.GOOGLE_CLIENT_ID), GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh" }, f).send(msg);
    expect(new URLSearchParams(body).get("client_id")).toBe("id");
  });

  it("diagnóstico mostra o ID do cliente mas nunca a chave nem o token", () => {
    const d = diagnoseGoogleEnv({
      EMAIL_PROVIDER: "gmail",
      GOOGLE_CLIENT_ID: "764-abc123.apps.googleusercontent.com\n",
      GOOGLE_CLIENT_SECRET: "GOCSPX-supersecretvalue99",
      GOOGLE_REFRESH_TOKEN: "1//0verysecrettoken",
    });
    expect(d.every((c) => c.ok)).toBe(true);
    const text = JSON.stringify(d);
    expect(text).toContain("764-abc123.apps.googleusercontent.com");
    expect(text).toContain("espaços");
    expect(text).not.toContain("supersecret");
    expect(text).not.toContain("verysecrettoken");
    const swapped = diagnoseGoogleEnv({ EMAIL_PROVIDER: "gmail", GOOGLE_CLIENT_ID: "GOCSPX-oopssecret" })[1];
    expect(swapped.ok).toBe(false);
    expect(swapped.detail).toContain("parece a chave secreta");
    expect(swapped.detail).not.toContain("oopssecret");
  });
});
