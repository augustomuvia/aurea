"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { serverEnv } from "@/lib/env";
import { getProvider } from "@/lib/payments/providers";
import { fieldErrors, reportPaymentSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

async function activeUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/conta-suspensa");
  return user;
}

/** Cria o pedido de pagamento. Preço e duração vêm exclusivamente da base de dados. */
export async function createOrderAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const user = await activeUser();
  const plan = String(formData.get("plan") ?? "");
  if (!(await rateLimit(`order:${user.id}`, 10, 3600))) return { ok: false, error: "Demasiados pedidos. Tente novamente mais tarde." };

  const provider = getProvider(serverEnv.paymentMode);
  if (provider.id === "manual_review") {
    const s = await getSettings();
    if (!s.payment.mcx_recipient_phone) {
      return { ok: false, error: "Os pagamentos ainda não estão disponíveis. Tente novamente em breve ou contacte o suporte." };
    }
  }

  const { data, error } = await createServiceClient().rpc("create_payment_order", { p_user: user.id, p_plan_code: plan }).single<{ reference: string }>();
  if (error || !data) {
    if (error?.message.includes("plan_not_available")) return { ok: false, error: "Este plano não está disponível." };
    console.error("[checkout] create_payment_order", error?.message);
    return { ok: false, error: "Não foi possível criar o pedido. Tente novamente." };
  }
  revalidatePath("/app/pagamentos");
  redirect(`/checkout/estado?ref=${data.reference}`);
}

export async function reportPaymentAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const user = await activeUser();
  if (!(await rateLimit(`report:${user.id}`, 10, 3600))) return { ok: false, error: "Demasiadas tentativas. Tente mais tarde." };
  const parsed = reportPaymentSchema.safeParse({
    reference: formData.get("reference"),
    transactionId: formData.get("transactionId"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Verifique os dados.", fieldErrors: fieldErrors(parsed.error) };
  const { error } = await createServiceClient().rpc("report_payment", {
    p_user: user.id,
    p_reference: parsed.data.reference,
    p_txn: parsed.data.transactionId,
    p_note: parsed.data.note,
  });
  if (error) {
    if (error.message.includes("payment_not_pending")) return { ok: false, error: "Este pedido já não está pendente." };
    return { ok: false, error: "Não foi possível registar a informação. Tente novamente." };
  }
  revalidatePath("/checkout/estado");
  return { ok: true, message: "Recebemos os dados do comprovativo. O acesso será ativado após a verificação do pagamento." };
}

export async function cancelOrderAction(formData: FormData) {
  const user = await activeUser();
  const ref = String(formData.get("reference") ?? "");
  if (!/^AUR-[A-Z0-9]{8}$/.test(ref)) return;
  await createServiceClient().rpc("cancel_own_pending_payment", { p_user: user.id, p_reference: ref });
  revalidatePath("/app/pagamentos");
  redirect("/app/pagamentos");
}
