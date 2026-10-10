"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase/admin";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications/engine";
import { renderEmail, validateTemplate } from "@/lib/notifications/render";
import { confirmVerificationCode, getIntegration, getNotificationSettings, runQueue, runScheduler, sendTemplateTest, sendVerificationEmail } from "@/lib/notifications/server";
import { isTemplateKey, TEMPLATES, type TemplateContent } from "@/lib/notifications/templates";
import { buildVars, samplePayload } from "@/lib/notifications/vars";
import { isValidEmail } from "@/lib/notifications/mime";
import type { ActionResult } from "@/lib/types";

const email = z.string().trim().toLowerCase().refine(isValidEmail, "E-mail inválido.");
const FLAGS = Object.keys(DEFAULT_NOTIFICATION_SETTINGS.emails);
/** Desligar estes tipos pode impedir mensagens importantes: exige confirmação explícita. */
const ESSENTIAL = ["payment_requested", "payment_under_review", "admin_payment_confirmed", "plan_activated", "expiring"];

const settingsSchema = z.object({
  from_email: email,
  from_name: z.string().trim().min(2, "Indique o nome de apresentação.").max(60),
  reply_to: email,
  admin_email: email,
  site_url: z
    .string()
    .trim()
    .url("URL inválido.")
    .refine((u) => u.startsWith("https://"), "Use https://.")
    .transform((u) => u.replace(/\/+$/, "")),
  daily_hour: z.coerce.number().int().min(0).max(23),
  test_mode: z.boolean(),
  test_recipients: z.array(email).max(10, "No máximo 10 endereços de teste."),
  design: z.object({ button: z.enum(["dark", "gold"]), footer_note: z.string().trim().max(200) }),
  emails: z.record(z.string(), z.boolean()),
});

export async function saveNotificationSettingsAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const recipients = String(formData.get("test_recipients") ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parsed = settingsSchema.safeParse({
    from_email: formData.get("from_email"),
    from_name: formData.get("from_name"),
    reply_to: formData.get("reply_to"),
    admin_email: formData.get("admin_email"),
    site_url: formData.get("site_url"),
    daily_hour: formData.get("daily_hour"),
    test_mode: formData.get("test_mode") === "on",
    test_recipients: recipients,
    design: { button: formData.get("button") ?? "dark", footer_note: formData.get("footer_note") ?? "" },
    emails: Object.fromEntries(FLAGS.map((f) => [f, formData.get(`email_${f}`) === "on"])),
  });
  if (!parsed.success) {
    const fe: Record<string, string[]> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] = [i.message];
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Verifique os campos.", fieldErrors: fe };
  }
  const v = parsed.data;
  const svc = createServiceClient();
  const before = await getNotificationSettings(svc);
  const turnedOff = ESSENTIAL.filter((f) => before.emails[f] !== false && v.emails[f] === false);
  if (turnedOff.length && formData.get("confirm_disable") !== "on") {
    return {
      ok: false,
      error: `Vai desativar e-mails importantes (${turnedOff.map((f) => labelForFlag(f)).join(", ")}). Os clientes deixam de os receber. Marque a confirmação para continuar.`,
    };
  }
  const { error } = await svc.from("platform_settings").upsert({ key: "notifications", value: v, is_public: false, updated_by: admin.id });
  if (error) return { ok: false, error: "Não foi possível guardar. A migração das notificações já foi executada?" };
  await audit(admin.id, "notifications.settings", "settings", "notifications", null, { before, after: v });
  revalidatePath("/admin/notificacoes");
  const senderChanged = before.from_email.toLowerCase() !== v.from_email.toLowerCase();
  return {
    ok: true,
    message: senderChanged
      ? "Guardado. O remetente mudou: a integração só volta a ficar ativa depois de um novo envio de verificação."
      : "Configurações guardadas.",
  };
}

function labelForFlag(f: string) {
  return (
    {
      welcome: "boas-vindas",
      payment_requested: "pedido de pagamento",
      payment_under_review: "pagamento em validação",
      admin_payment_requested: "novo pedido (admin)",
      admin_payment_confirmed: "pagamento confirmado (admin)",
      plan_activated: "plano ativado",
      expiring: "avisos de expiração",
      expired: "plano expirado",
    }[f] ?? f
  );
}

async function authorizedRecipients(adminEmail: string) {
  const s = await getNotificationSettings();
  return new Set([adminEmail, s.admin_email, s.from_email, ...s.test_recipients].map((e) => e.toLowerCase()));
}

export async function sendVerificationAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const to = email.safeParse(formData.get("to"));
  if (!to.success) return { ok: false, error: "Indique um endereço válido." };
  if (!(await authorizedRecipients(admin.email)).has(to.data)) return { ok: false, error: "Use o seu e-mail, o e-mail administrativo ou um endereço de teste autorizado." };
  const r = await sendVerificationEmail(to.data);
  await audit(admin.id, "notifications.verification_sent", "email_integration", "1", null, { to: to.data, ok: r.ok, error: r.ok ? null : r.error });
  revalidatePath("/admin/notificacoes");
  if (!r.ok) return { ok: false, error: `O serviço não aceitou o envio: ${r.error}` };
  return { ok: true, message: `E-mail aceite pelo Google (id ${r.messageId}). Introduza o código recebido em ${to.data}.` };
}

export async function confirmVerificationAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const code = z.string().trim().regex(/^\d{6}$/).safeParse(formData.get("code"));
  if (!code.success) return { ok: false, error: "O código tem 6 algarismos." };
  const r = await confirmVerificationCode(code.data, admin.id);
  if (!r.ok) return { ok: false, error: r.error };
  await audit(admin.id, "notifications.integration_verified", "email_integration", "1", null, { from: r.from });
  revalidatePath("/admin/notificacoes");
  const { status } = await getIntegration();
  return {
    ok: true,
    message: status.code === "active" ? "Integração ativa. Os e-mails na fila começam a ser enviados." : "Código confirmado, mas o remetente atual é diferente do validado. Envie novo teste.",
  };
}

function readTemplate(formData: FormData): TemplateContent {
  return {
    subject: String(formData.get("subject") ?? "").trim(),
    heading: String(formData.get("heading") ?? "").trim(),
    body: String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim(),
    cta_label: String(formData.get("cta_label") ?? "").trim(),
  };
}

export type PreviewResult = ActionResult<{ subject: string; html: string; text: string }>;

export async function previewTemplateAction(_: unknown, formData: FormData): Promise<PreviewResult> {
  await assertSuperAdmin();
  const key = formData.get("key");
  if (!isTemplateKey(key)) return { ok: false, error: "Modelo inválido." };
  const content = readTemplate(formData);
  const issues = validateTemplate(key, content);
  if (issues.length) return { ok: false, error: issues[0].message, fieldErrors: Object.fromEntries(issues.map((i) => [i.field, [i.message]])) };
  const s = await getNotificationSettings();
  const vars = buildVars(key, samplePayload(key), { siteUrl: s.site_url, supportEmail: s.reply_to || s.from_email });
  const r = renderEmail(key, content, vars, { siteUrl: s.site_url, supportEmail: s.reply_to || s.from_email, button: s.design.button, footerNote: s.design.footer_note, test: true });
  return { ok: true, data: r };
}

export async function saveTemplateAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const key = formData.get("key");
  if (!isTemplateKey(key)) return { ok: false, error: "Modelo inválido." };
  const content = readTemplate(formData);
  const issues = validateTemplate(key, content);
  if (issues.length) return { ok: false, error: issues[0].message, fieldErrors: Object.fromEntries(issues.map((i) => [i.field, [i.message]])) };
  const svc = createServiceClient();
  const { data: before } = await svc.from("email_templates").select("subject, heading, body, cta_label").eq("key", key).maybeSingle();
  const { error } = await svc.from("email_templates").upsert({ key, ...content, updated_at: new Date().toISOString(), updated_by: admin.id });
  if (error) return { ok: false, error: "Não foi possível guardar o modelo." };
  await audit(admin.id, "notifications.template_update", "email_template", key, null, { before: before ?? TEMPLATES[key].defaults, after: content });
  revalidatePath("/admin/notificacoes/modelos");
  return { ok: true, message: "Modelo guardado. Aplica-se aos próximos envios." };
}

export async function resetTemplateAction(formData: FormData) {
  const admin = await assertSuperAdmin();
  const key = formData.get("key");
  if (!isTemplateKey(key)) return;
  await createServiceClient().from("email_templates").delete().eq("key", key);
  await audit(admin.id, "notifications.template_reset", "email_template", key, null, {});
  revalidatePath(`/admin/notificacoes/modelos/${key}`);
  revalidatePath("/admin/notificacoes/modelos");
}

export async function sendTemplateTestAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const key = formData.get("key");
  if (!isTemplateKey(key)) return { ok: false, error: "Modelo inválido." };
  const to = email.safeParse(formData.get("to"));
  if (!to.success) return { ok: false, error: "Indique um endereço válido." };
  if (!(await authorizedRecipients(admin.email)).has(to.data)) return { ok: false, error: "Só pode enviar testes para o seu e-mail, o e-mail administrativo ou os endereços de teste autorizados." };
  const r = await sendTemplateTest(key, to.data);
  await audit(admin.id, "notifications.template_test", "email_template", key, null, { to: to.data, ok: r.ok });
  revalidatePath("/admin/notificacoes/historico");
  if (!r.ok) return { ok: false, error: `Teste não enviado: ${r.error}` };
  return { ok: true, message: `Teste aceite pelo serviço (id ${r.messageId}). Usa o modelo guardado e dados de demonstração.` };
}

export async function requeueEmailAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Trabalho inválido." };
  const { data, error } = await createServiceClient().rpc("requeue_email_job", { p_job: id.data, p_actor: admin.id });
  const r = data as { ok: boolean; error?: string } | null;
  if (error || !r?.ok) return { ok: false, error: r?.error === "not_failed" ? "Só é possível repetir e-mails que falharam." : "Não foi possível voltar a colocar na fila." };
  revalidatePath("/admin/notificacoes/historico");
  return { ok: true, message: "Colocado novamente na fila. Sai no próximo processamento." };
}

export async function runNowAction(_: unknown, _formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const r = await runScheduler("manual");
  await audit(admin.id, "notifications.run_now", "scheduler", null, null, { ok: r.ok });
  revalidatePath("/admin/notificacoes");
  if (!r.ok) return { ok: false, error: `Falhou: ${r.error}` };
  const q = r.details.queue as { sent?: number; retry?: number; failed?: number; skipped?: number; active?: boolean } | null;
  const rem = r.details.reminders as { created?: number } | undefined;
  return {
    ok: true,
    message: `Processamento concluído. Avisos novos: ${rem?.created ?? 0}. E-mails enviados: ${q?.sent ?? 0}, a repetir: ${q?.retry ?? 0}, falhados: ${q?.failed ?? 0}, não enviados: ${q?.skipped ?? 0}.${q && !q.active ? " A integração não está ativa: os e-mails ficam na fila." : ""}`,
  };
}

export async function markAdminNotificationsReadAction(formData: FormData) {
  const admin = await assertSuperAdmin();
  const id = formData.get("id");
  const svc = createServiceClient();
  let q = svc.from("admin_notifications").update({ read_at: new Date().toISOString(), read_by: admin.id }).is("read_at", null);
  if (typeof id === "string" && z.string().uuid().safeParse(id).success) q = q.eq("id", id);
  await q;
  revalidatePath("/admin", "layout");
}

const BACKFILL_ERRORS: Record<string, string> = {
  forbidden: "Sem permissão.",
  invalid_kind: "Tipo de envio inválido.",
  disabled: "Este tipo de e-mail está desativado em Configurações. Ative-o primeiro.",
  test_mode: "O modo de teste está ativo: os e-mails para clientes seriam descartados. Desative-o antes de enviar.",
};

/**
 * Envio aos clientes atuais: coloca os e-mails na fila (a função SQL escolhe os
 * destinatários e impede duplicados) e processa já um primeiro lote. O admin
 * confirma escrevendo o número exato de destinatários.
 */
export async function enqueueBackfillAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const kind = z.enum(["welcome", "payment"]).safeParse(formData.get("kind"));
  if (!kind.success) return { ok: false, error: "Tipo de envio inválido." };
  const typed = String(formData.get("confirm") ?? "").trim();
  if (!/^\d{1,6}$/.test(typed)) return { ok: false, error: "Para confirmar, escreva o número de destinatários." };
  const { status } = await getIntegration();
  if (status.code !== "active") {
    return { ok: false, error: `${status.label}. Nada foi colocado na fila: ative a integração antes de enviar aos clientes atuais.` };
  }
  const { data, error } = await createServiceClient().rpc("notif_backfill_enqueue", { p_actor: admin.id, p_kind: kind.data, p_expected: Number(typed) });
  const r = data as { ok: boolean; error?: string; eligible?: number; enqueued?: number } | null;
  if (error || !r) return { ok: false, error: "Não foi possível colocar na fila. A migração 20261010000500_backfill_receipts.sql já foi executada?" };
  if (!r.ok) {
    if (r.error === "count_changed") {
      return { ok: false, error: `O número escrito não corresponde aos destinatários atuais (${r.eligible}). Confirme de novo com ${r.eligible}.` };
    }
    return { ok: false, error: BACKFILL_ERRORS[r.error ?? ""] ?? "Não foi possível colocar na fila." };
  }
  revalidatePath("/admin/notificacoes/clientes");
  if (!r.enqueued) return { ok: true, message: "Nada a enviar: todos os destinatários já têm este e-mail registado." };

  // Primeiro lote já; o resto sai nos processamentos seguintes (agendador ou "Processar agora").
  let q: Awaited<ReturnType<typeof runQueue>> = null;
  try {
    q = await runQueue({ limit: 50, deadlineMs: 40_000 });
  } catch (e) {
    console.error("[email] envio aos clientes atuais: primeiro lote falhou; fica na fila", e instanceof Error ? e.message : e);
  }
  revalidatePath("/admin/notificacoes");
  return {
    ok: true,
    message: `${r.enqueued} e-mail(s) colocados na fila.${q ? ` Primeiro lote: ${q.sent} enviado(s), ${q.retry} a repetir, ${q.failed} falhado(s), ${q.skipped} não enviado(s).` : ""} Os restantes saem nos próximos processamentos (lotes de 50).`,
  };
}
