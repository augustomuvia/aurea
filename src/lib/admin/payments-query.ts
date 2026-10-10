import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PaymentFilters {
  status?: string;
  plan?: string;
  q?: string;
  from?: string;
  to?: string;
  user?: string;
}

const STATUSES = new Set(["pending", "confirmed", "rejected", "cancelled", "expired", "reversed"]);

export function parsePaymentFilters(sp: Record<string, string | undefined>): PaymentFilters {
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    status: sp.estado && STATUSES.has(sp.estado) ? sp.estado : undefined,
    plan: sp.plano && /^[a-z0-9-]{2,32}$/.test(sp.plano) ? sp.plano : undefined,
    q: sp.q ? sp.q.replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80) : undefined,
    from: date(sp.de),
    to: date(sp.ate),
    user: sp.utilizador && /^[0-9a-f-]{36}$/.test(sp.utilizador) ? sp.utilizador : undefined,
  };
}

export function buildPaymentsQuery(svc: SupabaseClient, f: PaymentFilters) {
  let q = svc
    .from("payments")
    .select("*, plans!inner(name, code), profiles!payments_user_id_fkey(email, full_name)")
    .order("created_at", { ascending: false });
  if (f.status) q = q.eq("status", f.status);
  if (f.user) q = q.eq("user_id", f.user);
  if (f.plan) q = q.eq("plans.code", f.plan);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+01:00`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59+01:00`);
  if (f.q) {
    if (/^AUR-/i.test(f.q)) q = q.ilike("reference", `${f.q.toUpperCase()}%`);
    else q = q.or(`provider_transaction_id.ilike.%${f.q}%,customer_reported_transaction_id.ilike.%${f.q}%`);
  }
  return q;
}
