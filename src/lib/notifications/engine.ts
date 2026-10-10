import { renderEmail } from "./render";
import { isTemplateKey, TEMPLATES, type TemplateContent, type TemplateKey } from "./templates";
import { buildVars, type JobPayload } from "./vars";
import type { EmailProvider } from "./providers";
import type { MimeAttachment } from "./mime";

/**
 * Motor da fila: reclama trabalhos, revalida-os, renderiza, envia e regista o
 * resultado. Não conhece o Supabase: recebe um repositório (as operações
 * atómicas são funções SQL), o que permite testá-lo contra a base de dados real.
 */

export type JobStatus = "queued" | "processing" | "sent" | "failed" | "retry_scheduled" | "skipped";

export interface EmailJob {
  id: string;
  template_key: string;
  audience: "customer" | "admin";
  to_email: string;
  user_id?: string | null;
  payment_id?: string | null;
  payload: JobPayload & Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  is_test: boolean;
}

export interface NotificationSettings {
  from_email: string;
  from_name: string;
  reply_to: string;
  admin_email: string;
  site_url: string;
  daily_hour: number;
  emails: Record<string, boolean>;
  test_mode: boolean;
  test_recipients: string[];
  design: { button: "dark" | "gold"; footer_note: string };
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  from_email: "suporte@aurea-som.site",
  from_name: "AUREA | Suporte",
  reply_to: "suporte@aurea-som.site",
  admin_email: "suporte@aurea-som.site",
  site_url: "https://www.aurea-som.site",
  daily_hour: 8,
  emails: {
    welcome: true,
    payment_requested: true,
    payment_under_review: true,
    admin_payment_requested: true,
    admin_payment_confirmed: true,
    plan_activated: true,
    expiring: true,
    expired: false,
  },
  test_mode: false,
  test_recipients: [],
  design: { button: "dark", footer_note: "" },
};

export function mergeNotificationSettings(raw: unknown): NotificationSettings {
  const r = (raw ?? {}) as Partial<NotificationSettings>;
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  return {
    ...d,
    ...r,
    emails: { ...d.emails, ...(r.emails ?? {}) },
    design: { ...d.design, ...(r.design ?? {}) },
    test_recipients: Array.isArray(r.test_recipients) ? r.test_recipients.map(String) : [],
  };
}

export interface QueueRepo {
  claim(limit: number, worker: string, jobId?: string): Promise<EmailJob[]>;
  staleReason(jobId: string): Promise<string | null>;
  complete(jobId: string, outcome: "sent" | "failed" | "skipped", r: { provider?: string; messageId?: string; error?: string; permanent?: boolean; durationMs?: number }): Promise<string | null>;
  templates(): Promise<Partial<Record<TemplateKey, TemplateContent>>>;
  alert(kind: string, title: string, body: string, dedupe: string): Promise<void>;
}

export interface QueueRunResult {
  active: boolean;
  claimed: number;
  sent: number;
  retry: number;
  failed: number;
  skipped: number;
}

export async function processQueue(opts: {
  repo: QueueRepo;
  provider: EmailProvider;
  settings: NotificationSettings;
  /** Integração validada (envio de teste confirmado). Sem isto, só os testes saem. */
  active: boolean;
  limit?: number;
  jobId?: string;
  deadline?: number;
  worker?: string;
  now?: () => Date;
  /** Anexos gerados no momento do envio (ex.: recibo em PDF). Nada fica guardado na fila. */
  attachments?: (job: EmailJob) => Promise<MimeAttachment[]>;
}): Promise<QueueRunResult> {
  const { repo, provider, settings } = opts;
  const out: QueueRunResult = { active: opts.active, claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0 };
  if (provider.missing().length) return out;
  if (!opts.active && !opts.jobId) return out;

  const jobs = await repo.claim(opts.limit ?? 25, opts.worker ?? "aurea", opts.jobId);
  out.claimed = jobs.length;
  if (!jobs.length) return out;
  const custom = await repo.templates();
  const allow = new Set([settings.admin_email, ...settings.test_recipients].map((e) => e.toLowerCase()));

  for (const job of jobs) {
    // Real jobs require an active integration even when claimed individually.
    if (!job.is_test && !opts.active) {
      await count(out, repo.complete(job.id, "failed", { error: "Integração por configurar ou por validar", permanent: false }));
      continue;
    }
    if (opts.deadline && Date.now() > opts.deadline) {
      await count(out, repo.complete(job.id, "failed", { error: "Tempo de execução esgotado; nova tentativa programada", permanent: false }));
      continue;
    }
    if (!job.is_test) {
      const stale = await repo.staleReason(job.id);
      if (stale) {
        await count(out, repo.complete(job.id, "skipped", { error: stale }));
        continue;
      }
      if (settings.test_mode && !allow.has(job.to_email.toLowerCase())) {
        await count(out, repo.complete(job.id, "skipped", { error: "Modo de teste: destinatário fora da lista autorizada" }));
        continue;
      }
    }
    if (!isTemplateKey(job.template_key)) {
      await count(out, repo.complete(job.id, "failed", { error: `Modelo desconhecido: ${job.template_key}`, permanent: true }));
      continue;
    }
    const key = job.template_key;
    const content = custom[key] ?? TEMPLATES[key].defaults;
    let rendered;
    try {
      const vars = buildVars(key, job.payload, { siteUrl: settings.site_url, supportEmail: settings.reply_to || settings.from_email, now: opts.now?.() });
      rendered = renderEmail(key, content, vars, {
        siteUrl: settings.site_url,
        supportEmail: settings.reply_to || settings.from_email,
        button: settings.design.button,
        footerNote: settings.design.footer_note,
        test: job.is_test,
      });
    } catch (e) {
      await count(out, repo.complete(job.id, "failed", { error: `Erro ao preparar o e-mail: ${e instanceof Error ? e.message : e}`, permanent: true }));
      continue;
    }
    let attachments: MimeAttachment[] = [];
    try {
      attachments = opts.attachments ? await opts.attachments(job) : [];
    } catch (e) {
      // Sem o anexo (ex.: recibo) o e-mail não sai incompleto: tenta de novo mais tarde.
      await count(out, repo.complete(job.id, "failed", { error: `Erro ao gerar o anexo: ${e instanceof Error ? e.message : e}`, permanent: false }));
      continue;
    }
    const started = Date.now();
    let r;
    try {
      r = await provider.send({
        from: { name: settings.from_name, email: settings.from_email },
        to: job.to_email,
        replyTo: settings.reply_to || null,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        headers: { "X-AUREA-Job": job.id },
        ...(attachments.length ? { attachments } : {}),
      });
    } catch (e) {
      r = { ok: false as const, error: e instanceof Error ? e.message : "Erro inesperado", permanent: false };
    }
    const durationMs = Date.now() - started;
    if (r.ok) {
      await count(out, repo.complete(job.id, "sent", { provider: provider.id, messageId: r.messageId, durationMs }));
    } else {
      await count(out, repo.complete(job.id, "failed", { provider: provider.id, error: r.error, permanent: r.permanent, durationMs }));
      if (r.config) {
        const day = new Date().toISOString().slice(0, 10);
        await repo.alert("email_config", "Envio de e-mails bloqueado", `O serviço recusou as credenciais ou a autorização: ${r.error}`, `email_config:${day}`);
      }
    }
  }
  return out;
}

async function count(out: QueueRunResult, p: Promise<string | null>) {
  const s = await p;
  if (s === "sent") out.sent++;
  else if (s === "retry_scheduled") out.retry++;
  else if (s === "failed") out.failed++;
  else if (s === "skipped") out.skipped++;
}
