import { describe, expect, it } from "vitest";
import { authenticateKursinha, isProductAllowed, kursinhaSignature, parseKursinhaPayload } from "@/lib/payments/kursinha";

// Exemplo da documentação oficial (WEBHOOKS_GUIDE.md), evento sale.approved do produtor.
const DOC_EXAMPLE = {
  event: "sale.approved",
  timestamp: "2026-08-07T10:15:30.000Z",
  data: {
    saleId: "65a1b2c3d4e5f67890123456",
    orderId: "65a1b2c3d4e5f67890129999",
    status: "approved",
    product: { id: "64f0f2c8e4b0a1b2c3d4e5f6", name: "Curso de Marketing Digital", price: 15000, currency: "AOA" },
    buyer: { id: "64f0f2c8e4b0a1b2c3d40000", name: "Cliente Exemplo", email: "Cliente@Example.com", phone: "923000000" },
    payment: { method: "reference", transactionId: "TXN_1234567890" },
    producer: { id: "64f0f2c8e4b0a1b2c3d41111", name: "Produtor Exemplo", email: "produtor@example.com" },
    affiliate: { id: "64f0f2c8e4b0a1b2c3d42222", commission: 1500 },
    netAmount: 12500,
    serviceFee: 1000,
  },
};
const SECRET = "s".repeat(40);
const body = JSON.stringify(DOC_EXAMPLE);

describe("autenticação do webhook Kursinha", () => {
  it("aceita a assinatura HMAC-SHA256 do corpo bruto (sha256=<hex>)", () => {
    expect(authenticateKursinha({ secret: SECRET }, { rawBody: body, signature: kursinhaSignature(SECRET, body), token: null })).toEqual({ ok: true });
  });
  it("rejeita corpo adulterado, assinatura em falta ou de outro segredo", () => {
    const sig = kursinhaSignature(SECRET, body);
    expect(authenticateKursinha({ secret: SECRET }, { rawBody: body.replace("15000", "5000"), signature: sig, token: null }).ok).toBe(false);
    expect(authenticateKursinha({ secret: SECRET }, { rawBody: body, signature: null, token: null })).toEqual({ ok: false, reason: "missing_signature" });
    expect(authenticateKursinha({ secret: SECRET }, { rawBody: body, signature: kursinhaSignature("x".repeat(40), body), token: null })).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("com segredo configurado, o token no URL não basta", () => {
    const token = "t".repeat(40);
    expect(authenticateKursinha({ secret: SECRET, token }, { rawBody: body, signature: null, token }).ok).toBe(false);
  });
  it("sem segredo, aceita apenas o token certo no URL", () => {
    const token = "t".repeat(40);
    expect(authenticateKursinha({ token }, { rawBody: body, signature: null, token })).toEqual({ ok: true });
    expect(authenticateKursinha({ token }, { rawBody: body, signature: null, token: "t".repeat(39) + "u" })).toEqual({ ok: false, reason: "bad_token" });
    expect(authenticateKursinha({ token }, { rawBody: body, signature: null, token: null })).toEqual({ ok: false, reason: "bad_token" });
  });
  it("sem configuração (ou valores curtos) recusa tudo", () => {
    expect(authenticateKursinha({}, { rawBody: body, signature: "x", token: "y" })).toEqual({ ok: false, reason: "not_configured" });
    expect(authenticateKursinha({ token: "curto" }, { rawBody: body, signature: null, token: "curto" })).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("leitura do payload Kursinha", () => {
  it("normaliza o exemplo da documentação (Kz → cêntimos, e-mail em minúsculas)", () => {
    const r = parseKursinhaPayload(DOC_EXAMPLE);
    expect(r).toEqual({
      ok: true,
      value: {
        event: "sale.approved",
        sale_id: "65a1b2c3d4e5f67890123456",
        order_id: "65a1b2c3d4e5f67890129999",
        occurred_at: "2026-08-07T10:15:30.000Z",
        product_id: "64f0f2c8e4b0a1b2c3d4e5f6",
        product_name: "Curso de Marketing Digital",
        amount_minor: 1500000,
        buyer_email: "cliente@example.com",
        buyer_name: "Cliente Exemplo",
        payment_method: "reference",
        transaction_id: "TXN_1234567890",
      },
    });
  });
  it("aceita payload de afiliado e campos opcionais nulos", () => {
    const { producer: _p, netAmount: _n, serviceFee: _s, ...data } = DOC_EXAMPLE.data;
    const r = parseKursinhaPayload({ ...DOC_EXAMPLE, data: { ...data, affiliate: null, buyer: { ...data.buyer, phone: null }, payment: { method: "unknown", transactionId: null } } });
    expect(r.ok).toBe(true);
  });
  it("recusa eventos desconhecidos, e-mail inválido ou outra moeda", () => {
    expect(parseKursinhaPayload({ ...DOC_EXAMPLE, event: "sale.refunded" }).ok).toBe(false);
    expect(parseKursinhaPayload({ ...DOC_EXAMPLE, data: { ...DOC_EXAMPLE.data, buyer: { ...DOC_EXAMPLE.data.buyer, email: "x" } } }).ok).toBe(false);
    expect(parseKursinhaPayload({ ...DOC_EXAMPLE, data: { ...DOC_EXAMPLE.data, product: { ...DOC_EXAMPLE.data.product, currency: "USD" } } })).toEqual({ ok: false, error: "unsupported_currency" });
  });
  it("filtro de produtos: vazio aceita todos", () => {
    expect(isProductAllowed("a", [])).toBe(true);
    expect(isProductAllowed("a", ["a", "b"])).toBe(true);
    expect(isProductAllowed("c", ["a"])).toBe(false);
    expect(isProductAllowed(null, ["a"])).toBe(false);
  });
});
