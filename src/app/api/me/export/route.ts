import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/** Exportação dos dados pessoais do próprio utilizador (portabilidade). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`export:${user.id}`, 5, 3600))) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const supabase = await createClient();
  const [profile, prefs, subscription, periods, payments, favorites, history, notifications] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, status, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("subscription_periods").select("period_start, period_end, source, reversed_at, created_at").eq("user_id", user.id),
    supabase.from("payments").select("reference, amount_minor, currency, method, status, created_at, confirmed_at, customer_reported_transaction_id").eq("user_id", user.id),
    supabase.from("favorites").select("content_id, created_at").eq("user_id", user.id),
    supabase.from("listening_history").select("content_id, position_seconds, play_count, first_played_at, last_played_at").eq("user_id", user.id),
    supabase.from("notifications").select("kind, title, body, read_at, created_at").eq("user_id", user.id),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    preferences: prefs.data,
    subscription: subscription.data,
    subscription_periods: periods.data,
    payments: payments.data,
    favorites: favorites.data,
    listening_history: history.data,
    notifications: notifications.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aurea-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
