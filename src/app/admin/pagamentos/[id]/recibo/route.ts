import { NextResponse, type NextRequest } from "next/server";
import { checkSuperAdmin } from "@/lib/auth";
import { getNotificationSettings } from "@/lib/notifications/server";
import { loadReceipt, receiptResponse } from "@/lib/receipts/server";

/** Recibo de pagamento em PDF (só pagamentos confirmados). ?download=1 descarrega. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await checkSuperAdmin();
  if (!check.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const receipt = await loadReceipt(id, await getNotificationSettings());
  if (!receipt) return NextResponse.json({ error: "not_confirmed" }, { status: 404 });
  return receiptResponse(receipt, req.nextUrl.searchParams.get("download") === "1");
}
