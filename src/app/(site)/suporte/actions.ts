"use server";
import { getSessionUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fieldErrors, supportSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

export async function supportAction(_: unknown, formData: FormData): Promise<ActionResult> {
  // Campo-armadilha contra bots.
  if (String(formData.get("website") ?? "")) return { ok: true, message: "Mensagem enviada." };
  const ip = await clientIp();
  if (!(await rateLimit(`support:${ip}`, 5, 3600))) return { ok: false, error: "Demasiadas mensagens. Tente mais tarde." };
  const parsed = supportSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { ok: false, error: "Verifique os campos assinalados.", fieldErrors: fieldErrors(parsed.error) };
  const user = await getSessionUser();
  const { error } = await createServiceClient().from("support_requests").insert({ ...parsed.data, user_id: user?.id ?? null });
  if (error) return { ok: false, error: "Não foi possível enviar. Tente novamente." };
  return { ok: true, message: "Mensagem enviada. Responderemos para o e-mail indicado." };
}
