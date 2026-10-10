"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";
import { fieldErrors, loginSchema, newPasswordSchema, recoverSchema, registerSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";
import { safeNext } from "@/lib/safe-next";

const TOO_MANY = "Demasiadas tentativas. Aguarde alguns minutos e tente novamente.";

export async function registerAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  if (!(await rateLimit(`register:ip:${ip}`, 5, 3600))) return { ok: false, error: TOO_MANY };

  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms"),
  });
  if (!parsed.success) return { ok: false, error: "Verifique os campos assinalados.", fieldErrors: fieldErrors(parsed.error) };

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
    if (/rate/i.test(error.message)) return { ok: false, error: TOO_MANY };
    // Mensagem neutra: não revela se o e-mail já existe.
  }
  redirect(`/registar/verificar?email=${encodeURIComponent(parsed.data.email)}`);
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
  if (!(await rateLimit(`resend:${ip}:${parsed.data.email}`, 3, 3600))) return { ok: false, error: TOO_MANY };
  const supabase = await createClient();
  await supabase.auth.resend({ type: "signup", email: parsed.data.email, options: { emailRedirectTo: `${serverEnv.siteUrl}/auth/confirm?next=/app` } });
  return { ok: true, message: "Se o registo estiver pendente, enviámos um novo e-mail de verificação." };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
