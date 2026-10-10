import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { getNotificationSettings } from "@/lib/notifications/server";
import { loadReceipt, receiptResponse } from "@/lib/receipts/server";

/**
 * Recibo de um pagamento do próprio cliente. A posse é verificada com a sessão
 * do cliente (RLS: só vê os seus pagamentos) e novamente pelo user_id.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await rateLimit(`receipt:${user.id}`, 30, 3600))) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const supabase = await createClient();
  const { data: own } = await supabase.from("payments").select("id").eq("id", id).eq("user_id", user.id).eq("status", "confirmed").maybeSingle();
  if (!own) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const receipt = await loadReceipt(id, await getNotificationSettings());
  if (!receipt || receipt.userId !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return receiptResponse(receipt, req.nextUrl.searchParams.get("download") === "1");
}
