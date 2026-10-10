import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Verificação genérica de notificações de pagamento assinadas com HMAC-SHA256.
 *
 * IMPORTANTE: o formato exato (nome do cabeçalho, conteúdo assinado, campos do
 * corpo) depende da especificação oficial do parceiro Multicaixa Express escolhido.
 * Este módulo define o contrato interno normalizado; o adaptador do parceiro
 * (src/lib/payments/providers) deve mapear a especificação real para ele.
 */
export function computeSignature(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifySignature(opts: {
  secret: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  toleranceSeconds?: number;
  now?: number;
}): { ok: true } | { ok: false; reason: "not_configured" | "missing_signature" | "stale" | "bad_signature" } {
  const { secret, rawBody, signature, timestamp } = opts;
  if (!secret || secret.length < 32) return { ok: false, reason: "not_configured" };
  if (!signature || !timestamp) return { ok: false, reason: "missing_signature" };
  const ts = Number(timestamp);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (opts.toleranceSeconds ?? 300)) return { ok: false, reason: "stale" };
  const expected = Buffer.from(computeSignature(secret, timestamp, rawBody), "hex");
  const given = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

/** Notificação normalizada que o núcleo de pagamentos aceita. */
export const normalizedNotificationSchema = z.object({
  eventId: z.string().min(1).max(128),
  reference: z.string().regex(/^AUR-[A-Z0-9]{8}$/),
  status: z.enum(["confirmed", "failed"]),
  amountMinor: z.number().int().positive(),
  currency: z.literal("AOA"),
  providerTransactionId: z.string().min(1).max(64),
});
export type NormalizedNotification = z.infer<typeof normalizedNotificationSchema>;

export type ConfirmFn = (n: NormalizedNotification) => Promise<{ ok: boolean; status?: string; error?: string }>;

/**
 * Processa uma notificação já autenticada. A ativação nunca acontece aqui:
 * é delegada na função SQL confirm_payment, que valida valor, referência,
 * idempotência e reutilização de transações de forma atómica.
 */
export async function processNotification(payload: unknown, confirm: ConfirmFn) {
  const parsed = normalizedNotificationSchema.safeParse(payload);
  if (!parsed.success) return { httpStatus: 400, body: { ok: false, error: "invalid_payload" } } as const;
  if (parsed.data.status !== "confirmed") return { httpStatus: 200, body: { ok: true, status: "ignored" } } as const;
  const r = await confirm(parsed.data);
  if (r.ok) return { httpStatus: 200, body: { ok: true, status: r.status } } as const;
  // Erros de negócio ficam registados em payment_events; o parceiro recebe um 4xx explícito.
  return { httpStatus: r.error === "payment_not_found" ? 404 : 409, body: { ok: false, error: r.error } } as const;
}
