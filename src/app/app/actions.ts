"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { fieldErrors, newPasswordSchema, preferencesSchema, profileSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

const uuid = z.string().uuid();

async function activeUser() {
  const user = await getSessionUser();
  if (!user || user.status !== "active") throw new Error("unauthorized");
  return user;
}

export async function toggleFavorite(contentId: string): Promise<ActionResult<{ favorite: boolean }>> {
  const user = await activeUser();
  if (!uuid.safeParse(contentId).success) return { ok: false, error: "Conteúdo inválido." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("favorites").select("content_id").eq("user_id", user.id).eq("content_id", contentId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("content_id", contentId);
    if (error) return { ok: false, error: "Não foi possível atualizar os favoritos." };
    revalidatePath("/app/favoritos");
    return { ok: true, data: { favorite: false } };
  }
  const { error } = await supabase.from("favorites").insert({ user_id: user.id, content_id: contentId });
  if (error) return { ok: false, error: "Não foi possível atualizar os favoritos." };
  revalidatePath("/app/favoritos");
  return { ok: true, data: { favorite: true } };
}

const playbackSchema = z.object({
  contentId: uuid,
  position: z.number().int().min(0).max(86400 * 2),
  duration: z.number().int().min(0).max(86400 * 2),
  newPlay: z.boolean(),
});

/** Guarda a posição de reprodução. A permissão é revalidada na base de dados. */
export async function recordPlayback(input: z.infer<typeof playbackSchema>): Promise<ActionResult> {
  const user = await activeUser();
  const parsed = playbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  if (!(await rateLimit(`playback:${user.id}`, 120, 60))) return { ok: false, error: "Demasiados pedidos." };
  const { error } = await createServiceClient().rpc("record_playback", {
    p_user: user.id,
    p_content: parsed.data.contentId,
    p_position: parsed.data.position,
    p_duration: parsed.data.duration,
    p_new_play: parsed.data.newPlay,
  });
  if (error) return { ok: false, error: "Não foi possível guardar o progresso." };
  return { ok: true };
}

/** Regista erros de incorporação para o admin rever (sem alterar a publicação). */
export async function reportEmbedError(input: { contentId: string; code: number }): Promise<ActionResult> {
  const user = await activeUser();
  const parsed = z.object({ contentId: uuid, code: z.number().int().min(0).max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  if (!(await rateLimit(`embed-error:${user.id}`, 10, 300))) return { ok: true };
  const reason = [101, 150, 153].includes(parsed.data.code) ? "embed_not_allowed" : parsed.data.code === 100 ? "unavailable_or_private" : `player_error_${parsed.data.code}`;
  await createServiceClient()
    .from("content_items")
    .update({ embed_error: reason, embed_checked_at: new Date().toISOString() })
    .eq("id", parsed.data.contentId);
  return { ok: true };
}

export async function updateProfile(_: unknown, formData: FormData): Promise<ActionResult> {
  const user = await activeUser();
  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { ok: false, error: "Verifique os dados.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  if (error) return { ok: false, error: "Não foi possível guardar." };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Dados atualizados." };
}

export async function updatePreferences(_: unknown, formData: FormData): Promise<ActionResult> {
  const user = await activeUser();
  const parsed = preferencesSchema.safeParse({
    preferredCategories: formData.getAll("preferredCategories").map(String),
    marketingConsent: formData.get("marketingConsent") === "on",
    analyticsConsent: formData.get("analyticsConsent") === "on",
  });
  if (!parsed.success) return { ok: false, error: "Preferências inválidas." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_preferences")
    .update({
      preferred_categories: parsed.data.preferredCategories,
      marketing_consent: parsed.data.marketingConsent,
      analytics_consent: parsed.data.analyticsConsent,
    })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "Não foi possível guardar as preferências." };
  revalidatePath("/app");
  return { ok: true, message: "Preferências guardadas." };
}

export async function changePassword(_: unknown, formData: FormData): Promise<ActionResult> {
  const user = await activeUser();
  if (!(await rateLimit(`pwchange:${user.id}`, 5, 900))) return { ok: false, error: "Demasiadas tentativas. Tente mais tarde." };
  const current = String(formData.get("currentPassword") ?? "");
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, error: "Verifique os dados.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  // Reautenticação com a palavra-passe atual antes de alterar.
  const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (authError) return { ok: false, error: "A palavra-passe atual não está correta.", fieldErrors: { currentPassword: ["Palavra-passe incorreta."] } };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Não foi possível alterar a palavra-passe." };
  return { ok: true, message: "Palavra-passe alterada." };
}

export async function markNotificationsRead(): Promise<void> {
  const user = await activeUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/app", "layout");
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const user = await activeUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  // RLS: só as notificações do próprio utilizador podem ser alteradas.
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id.data).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/app", "layout");
}

/** Marca como lida e abre a página relacionada (apenas caminhos internos). */
export async function openNotification(formData: FormData): Promise<void> {
  const user = await activeUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) redirect("/app/notificacoes");
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("id", id.data).eq("user_id", user.id).maybeSingle();
  if (data && !data.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/app", "layout");
  const link = typeof data?.link === "string" && /^\/[A-Za-z0-9]/.test(data.link) ? data.link : "/app/notificacoes";
  redirect(link);
}

export async function updateNotificationPreferences(_: unknown, formData: FormData): Promise<ActionResult> {
  const user = await activeUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_preferences")
    .update({ reminder_emails: formData.get("reminderEmails") === "on" })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "Não foi possível guardar as preferências de notificação." };
  revalidatePath("/app/conta");
  return { ok: true, message: "Preferências de notificação guardadas." };
}

export async function clearHistory(): Promise<void> {
  const user = await activeUser();
  const supabase = await createClient();
  await supabase.from("listening_history").delete().eq("user_id", user.id);
  revalidatePath("/app/historico");
}

/**
 * Encerramento de conta. Os dados pessoais são eliminados; os registos financeiros
 * permanecem (obrigação legal/contabilística) sem ligação ao perfil.
 */
export async function closeAccount(_: unknown, formData: FormData): Promise<ActionResult> {
  const user = await activeUser();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "ENCERRAR") {
    return { ok: false, error: "Escreva ENCERRAR para confirmar." };
  }
  if (user.isSuperAdmin) return { ok: false, error: "A conta do proprietário não pode ser encerrada por aqui." };
  const supabase = await createClient();
  const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: String(formData.get("password") ?? "") });
  if (authError) return { ok: false, error: "Palavra-passe incorreta." };
  const svc = createServiceClient();
  const { error } = await svc.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: "Não foi possível encerrar a conta. Contacte o suporte." };
  await supabase.auth.signOut();
  redirect("/?conta=encerrada");
}
