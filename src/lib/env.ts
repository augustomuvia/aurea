import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente em falta: ${name}`);
  return v;
}

export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get siteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
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
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "";
  },
};
