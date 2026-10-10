import "server-only";
import { supabasePublicKey, supabaseUrl } from "@/lib/supabase/keys";

function required(name: string, value: string | undefined = process.env[name]): string {
  if (!value) throw new Error(`Variável de ambiente em falta: ${name}`);
  return value;
}

/** Chave privilegiada do Supabase (service_role ou, com os nomes novos, secret). */
export function serviceRoleKeyOrNull(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || undefined;
}

/** URL pública: a variável explícita ou, na Vercel, o domínio de produção do projeto. */
export function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (explicit || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
}

export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl());
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", supabasePublicKey());
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKeyOrNull());
  },
  get siteUrl() {
    return resolveSiteUrl();
  },
  get adminRequireMfa() {
    return process.env.ADMIN_REQUIRE_MFA !== "false";
  },
  get paymentMode(): "manual_review" | "partner" {
    return process.env.PAYMENT_MODE === "partner" ? "partner" : "manual_review";
  },
  get paymentWebhookSecret() {
    return process.env.PAYMENT_WEBHOOK_SECRET ?? "";
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  /** Domínios autorizados para o checkout do e-book (ex.: "kursinha.com"). Vazio: qualquer domínio HTTPS válido. */
  get ebookCheckoutHosts(): string[] {
    return (process.env.EBOOK_CHECKOUT_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "";
  },
};
