import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Envio de e-mails transacionais via Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Sem RESEND_API_KEY configurada, não envia nada e devolve false (a notificação
 * continua visível na conta do utilizador).
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!serverEnv.resendApiKey || !serverEnv.emailFrom) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: serverEnv.emailFrom, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email] falhou", res.status);
    return res.ok;
  } catch (e) {
    console.error("[email] erro", e instanceof Error ? e.message : e);
    return false;
  }
}
