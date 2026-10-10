import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Subscription } from "@/lib/types";

export type SubscriptionView = {
  sub: Subscription | null;
  /** Estado efetivo: uma assinatura "active" com data passada é apresentada como expirada. */
  effective: "none" | Subscription["status"];
  hasAccess: boolean;
  daysLeft: number | null;
};

export async function getSubscriptionView(userId: string): Promise<SubscriptionView> {
  const supabase = await createClient();
  const { data } = await supabase.from("subscriptions").select("*, plans(name, code)").eq("user_id", userId).maybeSingle();
  const sub = (data as Subscription | null) ?? null;
  if (!sub) return { sub: null, effective: "none", hasAccess: false, daysLeft: null };
  const now = Date.now();
  const exp = sub.expires_at ? new Date(sub.expires_at).getTime() : null;
  let effective = sub.status;
  if (sub.status === "active" && exp !== null && exp <= now) effective = "expired";
  const hasAccess = effective === "active";
  return { sub, effective, hasAccess, daysLeft: hasAccess && exp ? Math.max(0, Math.ceil((exp - now) / 86_400_000)) : null };
}
