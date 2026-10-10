import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { serviceRoleKeyOrNull } from "@/lib/env";
import { mergeNotificationSettings, processQueue, type EmailJob, type NotificationSettings, type QueueRepo, type QueueRunResult } from "./engine";
import { getEmailProvider, type EmailProvider } from "./providers";
import { renderAccountConfirmEmail, renderVerificationEmail } from "./render";
import { samplePayload, luandaDate, luandaHour } from "./vars";
import type { TemplateContent, TemplateKey } from "./templates";
import { jobAttachments } from "@/lib/receipts/server";

let providerSingleton: { key: string; p: EmailProvider } | null = null;
/** Reutiliza o fornecedor (e o token de acesso em cache) entre pedidos da mesma instância. */
export function emailProvider(): EmailProvider {
  const key = [process.env.EMAIL_PROVIDER, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_REFRESH_TOKEN?.length].join("|");
  if (!providerSingleton || providerSingleton.key !== key) providerSingleton = { key, p: getEmailProvider() };
  return providerSingleton.p;
}

export async function getNotificationSettings(svc: SupabaseClient = createServiceClient()): Promise<NotificationSettings> {
  const { data } = await svc.from("platform_settings").select("value").eq("key", "notifications").maybeSingle();
  return mergeNotificationSettings(data?.value);
}

export interface IntegrationState {
  verified_from: string | null;
  verified_at: string | null;
  verification_from: string | null;
  verification_sent_at: string | null;
  last_sent_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
}

export type IntegrationStatus =
  | { code: "not_configured"; label: string; missing: string[] }
  | { code: "pending_verification"; label: string }
  | { code: "active"; label: string };

export async function getIntegration(svc: SupabaseClient = createServiceClient()) {
  const [settings, { data, error }] = await Promise.all([
    getNotificationSettings(svc),
    svc.from("email_integration_state").select("verified_from, verified_at, verification_from, verification_sent_at, last_sent_at, last_error_at, last_error").eq("id", 1).maybeSingle(),
  ]);
  const state = (data ?? null) as IntegrationState | null;
  const provider = emailProvider();
  const missing = provider.missing();
  let status: IntegrationStatus;
  if (error || !state) status = { code: "not_configured", label: "Integração por configurar", missing: ["migração 20261010000400_notifications.sql"] };
  else if (missing.length) status = { code: "not_configured", label: "Integração por configurar", missing };
  else if (state.verified_from?.toLowerCase() !== settings.from_email.toLowerCase()) status = { code: "pending_verification", label: "Autenticação configurada · envio de teste por validar" };
  else status = { code: "active", label: "Ativa" };
  return { settings, state, provider, status };
}

function repo(svc: SupabaseClient): QueueRepo {
  return {
    async claim(limit, worker, jobId) {
      const { data, error } = await svc.rpc("claim_email_jobs", { p_limit: limit, p_worker: worker, p_job: jobId ?? null });
      if (error) throw new Error(`claim_email_jobs: ${error.message}`);
      return (data ?? []) as EmailJob[];
    },
    async staleReason(jobId) {
      const { data, error } = await svc.rpc("email_job_stale_reason", { p_job: jobId });
      if (error) throw new Error(`email_job_stale_reason: ${error.message}`);
      return (data as string | null) ?? null;
    },
    async complete(jobId, outcome, r) {
      const { data, error } = await svc.rpc("complete_email_job", {
        p_job: jobId,
        p_outcome: outcome,
        p_provider: r.provider ?? null,
        p_message_id: r.messageId ?? null,
        p_error: r.error ?? null,
        p_permanent: r.permanent ?? false,
        p_duration_ms: r.durationMs ?? null,
      });
      if (error) console.error("[email] complete_email_job", error.message);
      return (data as string | null) ?? null;
    },
    async templates() {
      const { data } = await svc.from("email_templates").select("key, subject, heading, body, cta_label");
      return Object.fromEntries((data ?? []).map((t) => [t.key, t])) as Partial<Record<TemplateKey, TemplateContent>>;
    },
    async alert(kind, title, body, dedupe) {
      await svc.rpc("notify_admin", { p_kind: kind, p_severity: "error", p_title: title, p_body: body, p_link: "/admin/notificacoes", p_dedupe: dedupe });
    },
  };
}

/** Processa a fila. Seguro para chamar em paralelo (SKIP LOCKED na base de dados). */
export async function runQueue(opts: { limit?: number; jobId?: string; deadlineMs?: number } = {}): Promise<QueueRunResult | null> {
  if (!serviceRoleKeyOrNull()) return null;
  const svc = createServiceClient();
  const { settings, status, provider } = await getIntegration(svc);
  return processQueue({
    repo: repo(svc),
    provider,
    settings,
    active: status.code === "active",
    limit: opts.limit,
    jobId: opts.jobId,
    deadline: opts.deadlineMs ? Date.now() + opts.deadlineMs : undefined,
    worker: `vercel:${process.env.VERCEL_REGION ?? "local"}`,
    attachments: (job) => jobAttachments(job, settings, svc),
  });
}

/**
 * Depois de responder ao utilizador, tenta enviar já os e-mails acabados de
 * criar. Se falhar, ficam na fila para o agendador: nada se perde.
 */
export function kickQueue() {
  try {
    after(async () => {
      try {
        await runQueue({ limit: 10, deadlineMs: 20_000 });
      } catch (e) {
        console.error("[email] envio imediato falhou; fica na fila", e instanceof Error ? e.message : e);
      }
    });
  } catch {
    // Fora de um pedido (ex.: testes): o agendador trata da fila.
  }
}

/**
 * Agendador. "daily" é o Vercel Cron (uma vez por dia, garantido); "tick" é o
 * agendador frequente opcional (GitHub Actions), que só faz a verificação de
 * expirações a partir da hora configurada e se ainda não tiver sido feita hoje.
 */
export async function runScheduler(kind: "daily" | "tick" | "manual") {
  const svc = createServiceClient();
  const day = luandaDate();
  const settings = await getNotificationSettings(svc);
  const { data: log } = await svc.from("notification_schedule_logs").insert({ kind, luanda_date: day }).select("id").single();
  const details: Record<string, unknown> = {};
  let ok = true;
  let errorMsg: string | null = null;
  try {
    let scan = kind !== "tick";
    if (kind === "tick") {
      const { count } = await svc
        .from("notification_schedule_logs")
        .select("id", { count: "exact", head: true })
        .eq("luanda_date", day)
        .eq("ok", true)
        .contains("details", { scanned: true });
      scan = (count ?? 0) === 0 && luandaHour() >= settings.daily_hour;
    }
    if (kind !== "tick") {
      const { data, error } = await svc.rpc("expire_stale_records");
      if (error) throw new Error(`expire_stale_records: ${error.message}`);
      details.expire = data;
    }
    if (scan) {
      const { data, error } = await svc.rpc("enqueue_expiry_reminders");
      if (error) throw new Error(`enqueue_expiry_reminders: ${error.message}`);
      details.reminders = data;
      details.scanned = true;
    }
    details.queue = await runQueue({ limit: 50, deadlineMs: 40_000 });
  } catch (e) {
    ok = false;
    errorMsg = e instanceof Error ? e.message : String(e);
    await svc.rpc("notify_admin", {
      p_kind: "scheduler_failed",
      p_severity: "error",
      p_title: "Falha no agendador de notificações",
      p_body: errorMsg.slice(0, 300),
      p_link: "/admin/notificacoes",
      p_dedupe: `scheduler_failed:${day}`,
    });
  }
  if (log) await svc.from("notification_schedule_logs").update({ finished_at: new Date().toISOString(), ok, details, error: errorMsg }).eq("id", log.id);
  return { ok, details, error: errorMsg };
}

const hash = (code: string) => createHash("sha256").update(`aurea-email-verification:${code}`).digest("hex");

/** Envia um código para um endereço autorizado. A integração só fica ativa depois de o código ser confirmado. */
export async function sendVerificationEmail(to: string) {
  const svc = createServiceClient();
  const { settings, provider } = await getIntegration(svc);
  const missing = provider.missing();
  if (missing.length) return { ok: false as const, error: `Integração por configurar: falta ${missing.join(", ")} na Vercel.` };
  const code = String(randomInt(100000, 1000000));
  const opts = { siteUrl: settings.site_url, supportEmail: settings.reply_to || settings.from_email, button: settings.design.button };
  const mail = renderVerificationEmail(code, settings.from_email, opts);
  const { data: job } = await svc
    .from("email_jobs")
    .insert({
      idempotency_key: `verification:${crypto.randomUUID()}`,
      event_type: "integration.verification",
      template_key: "verification",
      audience: "admin",
      to_email: to.toLowerCase(),
      payload: { from: settings.from_email },
      status: "processing",
      attempts: 1,
      locked_at: new Date().toISOString(),
      is_test: true,
    })
    .select("id")
    .single();
  const started = Date.now();
  const r = await provider.send({
    from: { name: settings.from_name, email: settings.from_email },
    to,
    replyTo: settings.reply_to || null,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  if (job) {
    await svc.rpc("complete_email_job", {
      p_job: job.id,
      p_outcome: r.ok ? "sent" : "failed",
      p_provider: provider.id,
      p_message_id: r.ok ? r.messageId : null,
      p_error: r.ok ? null : r.error,
      p_permanent: true,
      p_duration_ms: Date.now() - started,
    });
  }
  if (!r.ok) return { ok: false as const, error: r.error };
  await svc
    .from("email_integration_state")
    .update({ verification_from: settings.from_email, verification_code_hash: hash(code), verification_sent_at: new Date().toISOString() })
    .eq("id", 1);
  return { ok: true as const, messageId: r.messageId };
}

/**
 * Envia o link de confirmação de conta pelo Gmail da AUREA, em vez do e-mail do Supabase
 * (que tem um limite baixo por hora e bloqueava registos com "Demasiadas tentativas").
 * Só envia com a integração ativa; devolve ok:false para o chamador usar o Supabase.
 */
export async function sendAccountConfirmEmail(to: string, name: string, link: string, userId: string | null) {
  const svc = createServiceClient();
  const { settings, provider, status } = await getIntegration(svc);
  if (status.code !== "active") return { ok: false as const, error: "integration_inactive" };
  const opts = { siteUrl: settings.site_url, supportEmail: settings.reply_to || settings.from_email, button: settings.design.button };
  const mail = renderAccountConfirmEmail(name, link, opts);
  // Registo para o painel; o link (credencial) nunca é guardado.
  const { data: job } = await svc
    .from("email_jobs")
    .insert({
      idempotency_key: `auth-confirm:${crypto.randomUUID()}`,
      event_type: "auth.signup",
      template_key: "auth_confirm",
      audience: "customer",
      to_email: to.toLowerCase(),
      user_id: userId,
      status: "processing",
      attempts: 1,
      locked_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const started = Date.now();
  const r = await provider.send({
    from: { name: settings.from_name, email: settings.from_email },
    to,
    replyTo: settings.reply_to || null,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  if (job) {
    await svc.rpc("complete_email_job", {
      p_job: job.id,
      p_outcome: r.ok ? "sent" : "failed",
      p_provider: provider.id,
      p_message_id: r.ok ? r.messageId : null,
      p_error: r.ok ? null : r.error,
      p_permanent: true,
      p_duration_ms: Date.now() - started,
    });
  }
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function confirmVerificationCode(code: string, actorId: string) {
  const svc = createServiceClient();
  const { data: st } = await svc.from("email_integration_state").select("verification_code_hash, verification_from, verification_sent_at").eq("id", 1).maybeSingle();
  if (!st?.verification_code_hash || !st.verification_sent_at) return { ok: false as const, error: "Envie primeiro o e-mail de verificação." };
  if (Date.now() - new Date(st.verification_sent_at).getTime() > 30 * 60_000) return { ok: false as const, error: "O código expirou. Envie um novo e-mail de verificação." };
  const a = Buffer.from(hash(code.trim()), "hex");
  const b = Buffer.from(st.verification_code_hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false as const, error: "Código incorreto." };
  await svc
    .from("email_integration_state")
    .update({ verified_from: st.verification_from, verified_at: new Date().toISOString(), verified_by: actorId, verification_code_hash: null })
    .eq("id", 1);
  return { ok: true as const, from: st.verification_from as string };
}

/** Envio de teste de um modelo, com dados de demonstração, para um endereço autorizado. */
export async function sendTemplateTest(key: TemplateKey, to: string) {
  const svc = createServiceClient();
  const missing = emailProvider().missing();
  if (missing.length) return { ok: false as const, error: `Integração por configurar: falta ${missing.join(", ")} na Vercel.` };
  const { data: job, error } = await svc
    .from("email_jobs")
    .insert({
      idempotency_key: `test:${key}:${crypto.randomUUID()}`,
      event_type: "test",
      template_key: key,
      audience: "admin",
      to_email: to.toLowerCase(),
      payload: samplePayload(key),
      is_test: true,
      max_attempts: 1,
    })
    .select("id")
    .single();
  if (error || !job) return { ok: false as const, error: "Não foi possível criar o envio de teste." };
  await runQueue({ jobId: job.id });
  const { data: done } = await svc.from("email_jobs").select("status, last_error, provider_message_id").eq("id", job.id).maybeSingle();
  if (done?.status === "sent") return { ok: true as const, messageId: done.provider_message_id as string };
  return { ok: false as const, error: done?.last_error ?? "Integração por configurar." };
}
