"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { kickQueue } from "@/lib/notifications/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

/** Volta a tentar aplicar uma venda (ex.: depois de corrigir o preço de um plano). */
export async function retryKursinhaSaleAction(formData: FormData) {
  const admin = await assertSuperAdmin();
  const saleId = z.string().min(1).max(64).safeParse(formData.get("saleId"));
  if (!saleId.success) return;
  const { data } = await createServiceClient().rpc("kursinha_apply_sale", { p_sale_id: saleId.data });
  await audit(admin.id, "kursinha.retry", "kursinha_sale", saleId.data, "Nova tentativa de aplicar venda Kursinha", { result: data });
  if ((data as { status?: string } | null)?.status === "activated") kickQueue();
  revalidatePath("/admin/kursinha");
}

const ASSIGN_ERRORS: Record<string, string> = {
  forbidden: "Sem permissão.",
  reason_required: "Indique um motivo (mínimo 5 caracteres).",
  sale_not_found: "Venda não encontrada.",
  sale_not_awaiting: "Esta venda já não está à espera de conta.",
  user_not_found: "Conta não encontrada.",
  no_matching_plan: "Nenhum plano ativo tem o preço desta venda.",
};

/** Associa uma venda "à espera de conta" à conta AUREA indicada (comprador usou outro e-mail). */
export async function assignKursinhaSaleAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const saleId = z.string().min(1).max(64).safeParse(formData.get("saleId"));
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(formData.get("email"));
  const reason = z.string().trim().min(5).max(500).safeParse(formData.get("reason"));
  if (!saleId.success) return { ok: false, error: "Venda inválida." };
  if (!email.success) return { ok: false, error: "Indique o e-mail da conta AUREA." };
  if (!reason.success) return { ok: false, error: ASSIGN_ERRORS.reason_required };

  const svc = createServiceClient();
  const { data: profile } = await svc.from("profiles").select("id").ilike("email", email.data.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  if (!profile) return { ok: false, error: `Não existe conta AUREA com o e-mail ${email.data}.` };

  const { data, error } = await svc.rpc("kursinha_assign_sale", { p_sale_id: saleId.data, p_user: profile.id, p_actor: admin.id, p_reason: reason.data });
  if (error) return { ok: false, error: "Não foi possível associar a venda." };
  const r = data as { ok: boolean; status?: string; error?: string };
  revalidatePath("/admin/kursinha");
  if (!r?.ok) return { ok: false, error: ASSIGN_ERRORS[r?.error ?? ""] ?? "Não foi possível associar a venda." };
  if (r.status === "activated") {
    kickQueue();
    return { ok: true, message: "Venda associada e plano ativado." };
  }
  if (r.status === "no_matching_plan") return { ok: false, error: ASSIGN_ERRORS.no_matching_plan };
  return { ok: true, message: "Venda associada." };
}
