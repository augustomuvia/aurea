import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runScheduler } from "@/lib/notifications/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Agendador frequente opcional (ex.: GitHub Actions a cada 15 min): envia a fila,
 * repete tentativas falhadas e, a partir da hora diária configurada, cria os
 * avisos de expiração se ainda não tiverem sido criados hoje.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await runScheduler("tick");
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
