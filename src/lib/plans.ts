import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { serviceRoleKeyOrNull } from "@/lib/env";
import type { Plan } from "@/lib/types";

export async function getActivePlans(): Promise<Plan[]> {
  if (!serviceRoleKeyOrNull()) return [];
  const { data } = await createServiceClient().from("plans").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []).map((p) => ({ ...p, amount_minor: Number(p.amount_minor) })) as Plan[];
}

export async function getPlanByCode(code: string): Promise<Plan | null> {
  if (!/^[a-z0-9-]{2,32}$/.test(code)) return null;
  const { data } = await createServiceClient().from("plans").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  return data ? ({ ...data, amount_minor: Number(data.amount_minor) } as Plan) : null;
}
