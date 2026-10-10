import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Webhooks de venda da Kursinha (app.kursinha.com).
 * Especificação: https://github.com/kursinha1/kursinha-docs/blob/main/WEBHOOKS_GUIDE.md
 *
 * - POST JSON { event, timestamp, data }, eventos sale.pending | sale.approved | sale.cancelled.
 * - Com "Secret" configurado no webhook, o cabeçalho X-Webhook-Signature traz
 *   "sha256=<hex>" = HMAC-SHA256(secret, corpo bruto).
 * - Entrega "pelo menos uma vez": deduplicar por event + data.saleId e responder 2xx.
 *
 * Quando o painel da Kursinha não permite definir o Secret, aceita-se em alternativa um
 * token longo no URL (?token=…) — mais fraco (o URL fica nos registos da Kursinha), por
 * isso só é usado quando KURSINHA_WEBHOOK_SECRET não está definido.
 */

export const KURSINHA_EVENTS = ["sale.pending", "sale.approved", "sale.cancelled"] as const;

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function kursinhaSignature(secret: string, rawBody: string) {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

export type KursinhaAuth = { secret?: string; token?: string };

export function authenticateKursinha(
  auth: KursinhaAuth,
  req: { rawBody: string; signature: string | null; token: string | null },
): { ok: true } | { ok: false; reason: "not_configured" | "missing_signature" | "bad_signature" | "bad_token" } {
  const secret = auth.secret?.trim() ?? "";
  const token = auth.token?.trim() ?? "";
  if (secret) {
    if (secret.length < 16) return { ok: false, reason: "not_configured" };
    if (!req.signature) return { ok: false, reason: "missing_signature" };
    return safeEqual(kursinhaSignature(secret, req.rawBody), req.signature.trim().toLowerCase()) ? { ok: true } : { ok: false, reason: "bad_signature" };
  }
  if (token) {
    if (token.length < 32) return { ok: false, reason: "not_configured" };
    return req.token && safeEqual(token, req.token) ? { ok: true } : { ok: false, reason: "bad_token" };
  }
  return { ok: false, reason: "not_configured" };
}

const id = z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(64));
const optText = z.string().max(500).nullish();

export const kursinhaWebhookSchema = z.object({
  event: z.enum(KURSINHA_EVENTS),
  timestamp: z.string().datetime({ offset: true }).nullish(),
  data: z.object({
    saleId: id,
    orderId: id.nullish(),
    status: z.string().max(32).nullish(),
    product: z.object({
      id: id.nullish(),
      name: optText,
      price: z.number().nonnegative().finite(),
      currency: z.string().max(8).nullish(),
    }),
    buyer: z.object({
      id: id.nullish(),
      name: optText,
      email: z.string().trim().email().max(254),
      phone: z.string().max(32).nullish(),
    }),
    payment: z.object({ method: z.string().max(32).nullish(), transactionId: z.string().max(128).nullish() }).nullish(),
  }),
});

export type KursinhaNormalized = {
  event: (typeof KURSINHA_EVENTS)[number];
  sale_id: string;
  order_id: string | null;
  occurred_at: string | null;
  product_id: string | null;
  product_name: string | null;
  amount_minor: number;
  buyer_email: string;
  buyer_name: string | null;
  payment_method: string | null;
  transaction_id: string | null;
};

export function parseKursinhaPayload(raw: unknown): { ok: true; value: KursinhaNormalized } | { ok: false; error: string } {
  const r = kursinhaWebhookSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: "invalid_payload" };
  const { event, timestamp, data } = r.data;
  if (data.product.currency && data.product.currency.toUpperCase() !== "AOA") return { ok: false, error: "unsupported_currency" };
  return {
    ok: true,
    value: {
      event,
      sale_id: data.saleId,
      order_id: data.orderId ?? null,
      occurred_at: timestamp ?? null,
      product_id: data.product.id ?? null,
      product_name: data.product.name ?? null,
      // A Kursinha envia valores em Kz (AOA); a AUREA guarda cêntimos.
      amount_minor: Math.round(data.product.price * 100),
      buyer_email: data.buyer.email.toLowerCase(),
      buyer_name: data.buyer.name ?? null,
      payment_method: data.payment?.method ?? null,
      transaction_id: data.payment?.transactionId?.slice(0, 64) ?? null,
    },
  };
}

/** Lista de IDs de produto aceites (KURSINHA_PRODUCT_IDS). Vazia: todos os produtos. */
export function isProductAllowed(productId: string | null, allowed: string[]) {
  if (!allowed.length) return true;
  return productId !== null && allowed.includes(productId);
}
