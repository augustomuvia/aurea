"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";
import { sendAccountConfirmEmail } from "@/lib/notifications/server";
import { fieldErrors, loginSchema, newPasswordSchema, recoverSchema, registerSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";
import { safeNext } from "@/lib/safe-next";

const TOO_MANY = "Demasiadas tentativas. Aguarde alguns minutos e tente novamente.";

/** Link de confirmação gerado pela AUREA (o Supabase não envia e-mail neste caso). */
function confirmLink(hashedToken: string, type: "signup" | "magiclink") {
  return `${serverEnv.siteUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=/app`;
}

/**
 * Envia a confirmação de conta pelo Gmail da AUREA. Devolve false se não foi possível
 * (integração inativa, utilizador já confirmado, erro do Google), para usar o Supabase.
 */
async function sendOwnConfirmation(email: string, fullName: string, password: string | null) {
  try {
    const admin = createServiceClient().auth.admin;
    const { data, error } = password
      ? await admin.generateLink({ type: "signup", email, password, options: { data: { full_name: fullName, terms_accepted: true } } })
      : await admin.generateLink({ type: "magiclink", email });
    if (error || !data?.properties?.hashed_token || !data.user) return { sent: false, exists: Boolean(error && /already|exists|registered/i.test(error.message)) };
    // Já confirmado (ex.: pedido de reenvio): não manda link de entrada.
    if (!password && data.user.email_confirmed_at) return { sent: true, exists: true };
    const r = await sendAccountConfirmEmail(email, fullName || String(data.user.user_metadata?.full_name ?? ""), confirmLink(data.properties.hashed_token, password ? "signup" : "magiclink"), data.user.id);
    return { sent: r.ok, exists: false };
  } catch (e) {
    console.error("[auth] confirmação própria", e instanceof Error ? e.message : e);
    return { sent: false, exists: false };
  }
}

export async function registerAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  // Limite largo por IP: em Angola muitas pessoas partilham o mesmo IP da operadora móvel.
  if (!(await rateLimit(`register:ip:${ip}`, 40, 3600))) return { ok: false, error: TOO_MANY };

  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms"),
  });
  if (!parsed.success) return { ok: false, error: "Verifique os campos assinalados.", fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimit(`register:email:${parsed.data.email}`, 6, 3600))) return { ok: false, error: TOO_MANY };
  const verify = `/registar/verificar?email=${encodeURIComponent(parsed.data.email)}`;

  // 1) E-mail de confirmação enviado pela AUREA (sem o limite por hora do Supabase).
  const own = await sendOwnConfirmation(parsed.data.email, parsed.data.fullName, parsed.data.password);
  if (own.sent) redirect(verify);
  // Já registado: se ainda não confirmou, recebe um novo link; se já confirmou, nada é enviado.
  if (own.exists) {
    await sendOwnConfirmation(parsed.data.email, parsed.data.fullName, null);
    redirect(verify);
  }

  // 2) Recurso: registo normal do Supabase (envia o e-mail pelo Supabase).
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Apenas dados não privilegiados. O papel nunca vem do cliente.
      data: { full_name: parsed.data.fullName, terms_accepted: true },
      emailRedirectTo: `${serverEnv.siteUrl}/auth/confirm?next=/app`,
    },
  });
  if (error) {
    if (/password/i.test(error.message)) return { ok: false, error: "Esta palavra-passe não cumpre os requisitos de segurança.", fieldErrors: { password: ["Escolha uma palavra-passe mais forte."] } };
    // O limite de e-mails do Supabase: a conta pode ter sido criada; a pessoa pode pedir novo e-mail no ecrã seguinte.
    if (/rate/i.test(error.message)) console.error("[auth] signUp limitado pelo Supabase", error.message);
    // Mensagem neutra: não revela se o e-mail já existe.
  }
  redirect(verify);
}

export async function loginAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: "Verifique os campos assinalados.", fieldErrors: fieldErrors(parsed.error) };

  const [ipOk, emailOk] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 20, 900),
    rateLimit(`login:email:${parsed.data.email}`, 8, 900),
  ]);
  if (!ipOk || !emailOk) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error && /confirm/i.test(error.message)) {
      return { ok: false, error: "Confirme o seu e-mail antes de entrar. Verifique a sua caixa de correio." };
    }
    return { ok: false, error: "E-mail ou palavra-passe incorretos." };
  }

  const { data: profile } = await createServiceClient().from("profiles").select("status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, error: "Esta conta está suspensa. Contacte o suporte." };
  }
  redirect(safeNext(formData.get("next")));
}

export async function recoverAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  const parsed = recoverSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "Indique um e-mail válido.", fieldErrors: fieldErrors(parsed.error) };
  const [ipOk, emailOk] = await Promise.all([rateLimit(`recover:ip:${ip}`, 5, 3600), rateLimit(`recover:email:${parsed.data.email}`, 3, 3600)]);
  if (!ipOk || !emailOk) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${serverEnv.siteUrl}/auth/confirm?next=/nova-password`,
  });
  // Resposta idêntica exista ou não a conta.
  return { ok: true, message: "Se existir uma conta com este e-mail, enviámos as instruções para redefinir a palavra-passe." };
}

export async function newPasswordAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "A ligação expirou. Peça uma nova recuperação de palavra-passe." };
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, error: "Verifique os campos assinalados.", fieldErrors: fieldErrors(parsed.error) };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Não foi possível alterar a palavra-passe. Tente novamente." };
  redirect("/app?senha=alterada");
}

export async function resendVerificationAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  const parsed = recoverSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "E-mail inválido." };
  if (!(await rateLimit(`resend:${ip}:${parsed.data.email}`, 5, 3600))) return { ok: false, error: TOO_MANY };
  const own = await sendOwnConfirmation(parsed.data.email, "", null);
  if (own.sent) return { ok: true, message: "Se o registo estiver pendente, enviámos um novo e-mail de verificação." };
  const supabase = await createClient();
  await supabase.auth.resend({ type: "signup", email: parsed.data.email, options: { emailRedirectTo: `${serverEnv.siteUrl}/auth/confirm?next=/app` } });
  return { ok: true, message: "Se o registo estiver pendente, enviámos um novo e-mail de verificação." };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
