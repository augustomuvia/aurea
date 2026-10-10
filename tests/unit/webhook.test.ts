import { describe, expect, it, vi } from "vitest";
import { computeSignature, processNotification, verifySignature } from "@/lib/payments/webhook";

const SECRET = "x".repeat(40);
const body = JSON.stringify({ hello: "world" });
const now = 1_760_000_000_000;
const ts = String(Math.floor(now / 1000));

describe("verificação de assinatura do callback", () => {
  it("aceita assinatura válida", () => {
    expect(verifySignature({ secret: SECRET, rawBody: body, timestamp: ts, signature: computeSignature(SECRET, ts, body), now })).toEqual({ ok: true });
  });
  it("rejeita callback falso (assinatura errada)", () => {
    expect(verifySignature({ secret: SECRET, rawBody: body, timestamp: ts, signature: computeSignature("y".repeat(40), ts, body), now })).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("rejeita corpo adulterado", () => {
    const sig = computeSignature(SECRET, ts, body);
    expect(verifySignature({ secret: SECRET, rawBody: body.replace("world", "w0rld"), timestamp: ts, signature: sig, now }).ok).toBe(false);
  });
  it("rejeita repetição antiga (replay)", () => {
    const old = String(Number(ts) - 3600);
    expect(verifySignature({ secret: SECRET, rawBody: body, timestamp: old, signature: computeSignature(SECRET, old, body), now })).toEqual({ ok: false, reason: "stale" });
  });
  it("rejeita sem assinatura ou sem segredo configurado", () => {
    expect(verifySignature({ secret: SECRET, rawBody: body, timestamp: ts, signature: null, now }).ok).toBe(false);
    expect(verifySignature({ secret: "", rawBody: body, timestamp: ts, signature: "aa", now })).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("processamento de notificação normalizada", () => {
  const valid = { eventId: "evt_1", reference: "AUR-ABCDEFGH", status: "confirmed", amountMinor: 500000, currency: "AOA", providerTransactionId: "TX1" };

  it("delegação na confirmação atómica", async () => {
    const confirm = vi.fn(async () => ({ ok: true, status: "confirmed" }));
    const r = await processNotification(valid, confirm);
    expect(confirm).toHaveBeenCalledOnce();
    expect(r).toEqual({ httpStatus: 200, body: { ok: true, status: "confirmed" } });
  });
  it("referência inválida não chega à BD", async () => {
    const confirm = vi.fn();
    const r = await processNotification({ ...valid, reference: "'; drop table--" }, confirm);
    expect(confirm).not.toHaveBeenCalled();
    expect(r.httpStatus).toBe(400);
  });
  it("moeda diferente é rejeitada", async () => {
    const confirm = vi.fn();
    expect((await processNotification({ ...valid, currency: "USD" }, confirm)).httpStatus).toBe(400);
  });
  it("valor incorreto devolve 409", async () => {
    const r = await processNotification(valid, async () => ({ ok: false, error: "amount_mismatch" }));
    expect(r).toEqual({ httpStatus: 409, body: { ok: false, error: "amount_mismatch" } });
  });
  it("pagamento falhado é ignorado (não ativa nada)", async () => {
    const confirm = vi.fn();
    const r = await processNotification({ ...valid, status: "failed" }, confirm);
    expect(confirm).not.toHaveBeenCalled();
    expect(r.body).toEqual({ ok: true, status: "ignored" });
  });
});
