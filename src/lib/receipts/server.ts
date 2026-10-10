import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import type { EmailJob, NotificationSettings } from "@/lib/notifications/engine";
import type { MimeAttachment } from "@/lib/notifications/mime";
import { buildReceiptPdf, receiptFilename, receiptFromPayload, type ReceiptData } from "./receipt";

/** Modelos de e-mail que levam o recibo do pagamento em anexo. */
export const RECEIPT_TEMPLATES = new Set(["plan_activated", "payment_receipt"]);

type PaymentRow = {
  id: string;
  user_id: string | null;
  reference: string;
  amount_minor: number;
  method: string;
  status: string;
  provider_transaction_id: string | null;
  created_at: string;
  confirmed_at: string | null;
  plans: { name: string; duration_months: number } | null;
  profiles: { email: string; full_name: string } | null;
};

/**
 * Dados do recibo de um pagamento confirmado, lidos da base de dados no momento.
 * Devolve null se o pagamento não existir ou não estiver confirmado.
 */
export async function loadReceipt(paymentId: string, settings: Pick<NotificationSettings, "site_url" | "reply_to" | "from_email">, svc: SupabaseClient = createServiceClient()): Promise<(ReceiptData & { userId: string | null }) | null> {
  const [{ data, error }, { data: period }, { data: legal }] = await Promise.all([
    svc
      .from("payments")
      .select("id, user_id, reference, amount_minor, method, status, provider_transaction_id, created_at, confirmed_at, plans(name, duration_months), profiles!payments_user_id_fkey(email, full_name)")
      .eq("id", paymentId)
      .maybeSingle(),
    svc.from("subscription_periods").select("period_start, period_end").eq("payment_id", paymentId).is("reversed_at", null).maybeSingle(),
    svc.from("platform_settings").select("value").eq("key", "legal").maybeSingle(),
  ]);
  if (error) throw new Error(`Pagamento ${paymentId}: ${error.message}`);
  const p = data as unknown as PaymentRow | null;
  if (!p || p.status !== "confirmed") return null;
  const l = (legal?.value ?? {}) as { company_name?: string | null; nif?: string | null; address?: string | null };
  return {
    userId: p.user_id,
    reference: p.reference,
    issuedAt: new Date(),
    customerName: (p.profiles?.full_name ?? "").trim(),
    customerEmail: p.profiles?.email ?? "",
    planName: p.plans?.name ?? "",
    durationMonths: p.plans?.duration_months ?? null,
    amountMinor: p.amount_minor,
    method: p.method,
    transactionId: p.provider_transaction_id,
    createdAt: p.created_at,
    confirmedAt: p.confirmed_at,
    periodStart: period?.period_start ?? null,
    periodEnd: period?.period_end ?? null,
    siteUrl: settings.site_url,
    supportEmail: settings.reply_to || settings.from_email,
    company: { name: l.company_name, nif: l.nif, address: l.address },
  };
}

/**
 * Anexos de um trabalho de e-mail: o recibo em PDF, gerado agora, para os
 * e-mails de pagamento confirmado. Os envios de teste usam os dados fictícios
 * do próprio trabalho e ficam marcados como demonstração.
 */
export async function jobAttachments(job: EmailJob, settings: NotificationSettings, svc: SupabaseClient): Promise<MimeAttachment[]> {
  if (!RECEIPT_TEMPLATES.has(job.template_key)) return [];
  const ctx = { siteUrl: settings.site_url, supportEmail: settings.reply_to || settings.from_email };
  let receipt: ReceiptData | null;
  if (job.is_test) receipt = receiptFromPayload(job.payload, { ...ctx, demo: true });
  else {
    if (!job.payment_id) throw new Error("Trabalho sem pagamento associado");
    receipt = await loadReceipt(job.payment_id, settings, svc);
    if (!receipt) throw new Error("Pagamento não encontrado ou não confirmado");
  }
  return [{ filename: receiptFilename(receipt.reference), contentType: "application/pdf", content: buildReceiptPdf(receipt) }];
}

/** Resposta HTTP com o PDF (sem cache: o documento contém dados pessoais). */
export function receiptResponse(r: ReceiptData, download: boolean) {
  const name = receiptFilename(r.reference);
  return new Response(Buffer.from(buildReceiptPdf(r)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
