import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { kickQueue } from "@/lib/notifications/server";
import { authenticateKursinha, isProductAllowed, parseKursinhaPayload } from "@/lib/payments/kursinha";
import { serverEnv } from "@/lib/env";

/**
 * Webhook de vendas da Kursinha. Configurar em app.kursinha.com → Webhooks com os eventos
 * Compra aprovada, Compra pendente e Compra cancelada. Ver docs/KURSINHA.md.
 * Só uma resposta 2xx conta como entregue; duplicados respondem 200.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (rawBody.length > 64_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  const auth = authenticateKursinha(
    { secret: serverEnv.kursinhaWebhookSecret, token: serverEnv.kursinhaWebhookToken },
    { rawBody, signature: req.headers.get("x-webhook-signature"), token: req.nextUrl.searchParams.get("token") },
  );
  if (!auth.ok) {
    if (auth.reason === "not_configured") return NextResponse.json({ error: "not_configured" }, { status: 503 });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = parseKursinhaPayload(json);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await createServiceClient().rpc("kursinha_handle_event", {
    p: { ...parsed.value, raw: json },
    p_product_allowed: isProductAllowed(parsed.value.product_id, serverEnv.kursinhaProductIds),
  });
  if (error) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  const r = data as { ok: boolean; status?: string; error?: string };
  if (!r?.ok) return NextResponse.json({ ok: false, error: r?.error ?? "rejected" }, { status: r?.error === "invalid_payload" ? 400 : 409 });
  if (r.status === "activated" || r.status === "reversed") kickQueue();
  return NextResponse.json({ ok: true, status: r.status });
}
