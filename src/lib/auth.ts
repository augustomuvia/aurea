import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import type { AccountStatus } from "@/lib/types";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  status: AccountStatus;
  isSuperAdmin: boolean;
  emailVerified: boolean;
}

/** Utilizador autenticado, validado junto do Supabase Auth (não apenas pelo cookie). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();
  const [{ data: profile }, { data: role }] = await Promise.all([
    svc.from("profiles").select("full_name, status, email").eq("id", user.id).maybeSingle(),
    svc.from("roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle(),
  ]);
  if (!profile) return null;

  return {
    id: user.id,
    email: profile.email ?? user.email ?? "",
    fullName: profile.full_name ?? "",
    status: profile.status as AccountStatus,
    isSuperAdmin: Boolean(role) && profile.status === "active",
    emailVerified: Boolean(user.email_confirmed_at),
  };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (user.status !== "active") redirect("/conta-suspensa");
  return user;
}

export type AdminCheck = { ok: true; user: SessionUser } | { ok: false; reason: "unauthenticated" | "forbidden" | "mfa_required" };

/** Verificação de super admin (papel na BD + MFA quando exigido). */
export async function checkSuperAdmin(): Promise<AdminCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (!user.isSuperAdmin) return { ok: false, reason: "forbidden" };
  if (serverEnv.adminRequireMfa) {
    const supabase = await createClient();
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== "aal2") return { ok: false, reason: "mfa_required" };
  }
  return { ok: true, user };
}

/** Para páginas /admin. Utilizadores comuns recebem 404 (não revela a existência da área). */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const check = await checkSuperAdmin();
  if (check.ok) return check.user;
  if (check.reason === "unauthenticated") redirect("/login?next=/admin");
  if (check.reason === "mfa_required") redirect("/admin-mfa");
  notFound();
}

/** Para Server Actions administrativas: lança erro em vez de redirecionar. */
export async function assertSuperAdmin(): Promise<SessionUser> {
  const check = await checkSuperAdmin();
  if (!check.ok) throw new Error("forbidden");
  return check.user;
}
