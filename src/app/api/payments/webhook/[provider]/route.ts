import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/payments/providers";
import { processNotification } from "@/lib/payments/webhook";
import { serverEnv } from "@/lib/env";

/**
 * Ponto de receção das notificações do parceiro Multicaixa Express.
 * Fica desativado (404) enquanto PAYMENT_MODE não for "partner" e o adaptador
 * do parceiro não estiver implementado com a especificação oficial.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;
  if (serverEnv.paymentMode !== "partner" || providerId !== "partner") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let provider;
  try {
    provider = getProvider("partner");
  } catch {
    return NextResponse.json({ error: "provider_not_configured" }, { status: 503 });
  }
  if (!provider.parseWebhook) return NextResponse.json({ error: "provider_not_configured" }, { status: 503 });

  const rawBody = await req.text();
  if (rawBody.length > 64_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const parsed = await provider.parseWebhook({ rawBody, headers: req.headers });
  if (!parsed.ok) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  const svc = createServiceClient();
  const result = await processNotification(parsed.notification, async (n) => {
    const { data, error } = await svc.rpc("confirm_payment", {
      p_reference: n.reference,
      p_amount_minor: n.amountMinor,
      p_provider_txn_id: n.providerTransactionId,
      p_source: "webhook",
      p_actor: null,
      p_evidence: null,
      p_provider_event_id: n.eventId,
    });
    if (error) return { ok: false, error: "internal_error" };
    return data as { ok: boolean; status?: string; error?: string };
  });
  return NextResponse.json(result.body, { status: result.httpStatus });
}
