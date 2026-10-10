import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export async function audit(actorId: string, action: string, targetType: string, targetId: string | null, reason: string | null, details: Record<string, unknown> = {}) {
  const { error } = await createServiceClient().rpc("write_audit", {
    p_actor: actorId,
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_details: details,
  });
  if (error) console.error("[audit] falhou", action, error.message);
}
