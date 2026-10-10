import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { runScheduler } from "@/lib/notifications/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Processamento diário (Vercel Cron, vercel.json). Exige Authorization: Bearer <CRON_SECRET>.
 * Sincroniza expirações, cria os avisos de expiração do dia e envia a fila de e-mails.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await runScheduler("daily");
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    // Sem a migração das notificações, mantém pelo menos a expiração que já existia.
    console.error("[cron] agendador de notificações", e instanceof Error ? e.message : e);
    const { data, error } = await createServiceClient().rpc("expire_stale_records");
    if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
    return NextResponse.json({ ok: true, ...data, notifications: "unavailable" });
  }
}
