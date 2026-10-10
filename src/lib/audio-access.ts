import "server-only";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface OwnAudioAccess {
  allowed: boolean;
  /** Fim da assinatura: depois disto os áudios descarregados deixam de tocar. */
  until: string | null;
}

/**
 * Áudio AUREA (ecrã bloqueado e offline) só para planos que o incluem (Trimestral e Anual).
 * Uma consulta por pedido; em caso de erro fica fechado.
 */
export const getOwnAudioAccess = cache(async (): Promise<OwnAudioAccess> => {
  const user = await getSessionUser();
  if (!user) return { allowed: false, until: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("own_audio_until", { p_user: user.id });
  if (error) {
    console.error("[audio] own_audio_until", error.message);
    return { allowed: false, until: null };
  }
  return data ? { allowed: true, until: String(data) } : { allowed: false, until: null };
});
