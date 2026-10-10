import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Cliente com service_role: ignora RLS. Usar APENAS no servidor, depois de
 * verificar permissões (requireUser / requireSuperAdmin).
 */
export function createServiceClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
