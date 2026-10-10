import { NextResponse, type NextRequest } from "next/server";
import { checkSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { csvCell } from "@/lib/format";
import { buildPaymentsQuery, parsePaymentFilters } from "@/lib/admin/payments-query";

export async function GET(req: NextRequest) {
  const check = await checkSuperAdmin();
  if (!check.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const filters = parsePaymentFilters(Object.fromEntries(req.nextUrl.searchParams));
  const { data, error } = await buildPaymentsQuery(createServiceClient(), filters).limit(10_000);
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });

  const header = ["referencia", "estado", "plano", "valor_kz", "utilizador_email", "utilizador_nome", "criado_em", "confirmado_em", "transacao", "transacao_indicada_cliente", "evidencia", "motivo"];
  const rows = (data ?? []).map((p: Record<string, unknown>) => {
    const plan = p.plans as { name?: string } | null;
    const prof = p.profiles as { email?: string; full_name?: string } | null;
    return [
      p.reference,
      p.status,
      plan?.name,
      (Number(p.amount_minor) / 100).toFixed(2),
      prof?.email,
      prof?.full_name,
      p.created_at,
      p.confirmed_at,
      p.provider_transaction_id,
      p.customer_reported_transaction_id,
      p.verification_evidence,
      p.rejected_reason,
    ].map(csvCell).join(";");
  });
  await audit(check.user.id, "payments.export_csv", "payments", null, null, { filters, rows: rows.length });
  const csv = "﻿" + [header.join(";"), ...rows].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aurea-pagamentos-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
