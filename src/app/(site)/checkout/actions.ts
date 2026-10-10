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
import { detectProofKind, PROOF_BUCKET, PROOF_MAX_BYTES } from "@/lib/payments/proof";
import type { ActionResult } from "@/lib/types";
import { kickQueue } from "@/lib/notifications/server";

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

  // Plano vendido na Kursinha: não há pedido manual; o acesso chega pelo webhook.
  const { data: planRow } = await createServiceClient().from("plans").select("checkout_url").eq("code", plan).maybeSingle();
  if (planRow?.checkout_url) redirect(`/checkout/${encodeURIComponent(plan)}`);

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
  kickQueue();
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
  kickQueue();
  revalidatePath("/checkout/estado");
  return { ok: true, message: "Recebemos os dados do comprovativo. O acesso será ativado após a verificação do pagamento." };
}

/**
 * O cliente envia o comprovativo (PNG, JPG ou PDF, até 4 MB) para um bucket privado.
 * Serve apenas de evidência para a equipa: NÃO confirma o pagamento nem ativa a assinatura.
 */
export async function uploadProofAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const user = await activeUser();
  if (!(await rateLimit(`proof:${user.id}`, 10, 3600))) return { ok: false, error: "Demasiadas tentativas. Tente mais tarde." };
  const ref = String(formData.get("reference") ?? "");
  if (!/^AUR-[A-Z0-9]{8}$/.test(ref)) return { ok: false, error: "Pedido inválido." };
  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Escolha o ficheiro do comprovativo.", fieldErrors: { proof: ["Escolha um ficheiro PNG, JPG ou PDF."] } };
  if (file.size > PROOF_MAX_BYTES) return { ok: false, error: "O ficheiro é demasiado grande.", fieldErrors: { proof: ["Máximo 4 MB."] } };

  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = detectProofKind(buf);
  if (!kind) return { ok: false, error: "Formato não aceite.", fieldErrors: { proof: ["Apenas PNG, JPG ou PDF."] } };

  const svc = createServiceClient();
  const { data: payment } = await svc.from("payments").select("status, proof_path").eq("reference", ref).eq("user_id", user.id).maybeSingle();
  if (!payment) return { ok: false, error: "Pedido não encontrado." };
  if (payment.status !== "pending") return { ok: false, error: "Este pedido já não está pendente." };

  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const path = `${user.id}/${ref}-${rand}.${kind.ext}`;
  const up = await svc.storage.from(PROOF_BUCKET).upload(path, buf, { contentType: kind.mime, upsert: false });
  if (up.error) {
    console.error("[checkout] proof upload", up.error.message);
    return { ok: false, error: "Não foi possível enviar o comprovativo. Tente novamente." };
  }
  const { error } = await svc.rpc("attach_payment_proof", { p_user: user.id, p_reference: ref, p_path: path, p_mime: kind.mime, p_size: buf.byteLength });
  if (error) {
    await svc.storage.from(PROOF_BUCKET).remove([path]);
    if (error.message.includes("payment_not_pending")) return { ok: false, error: "Este pedido já não está pendente." };
    console.error("[checkout] attach_payment_proof", error.message);
    return { ok: false, error: "Não foi possível registar o comprovativo. Tente novamente." };
  }
  // O ficheiro anterior (se o cliente substituiu) deixa de ser necessário; o evento fica no histórico.
  if (payment.proof_path && payment.proof_path !== path) await svc.storage.from(PROOF_BUCKET).remove([payment.proof_path]);
  kickQueue();
  revalidatePath("/checkout/estado");
  return { ok: true, message: "Comprovativo recebido. O acesso será ativado após a verificação do pagamento." };
}

export async function cancelOrderAction(formData: FormData) {
  const user = await activeUser();
  const ref = String(formData.get("reference") ?? "");
  if (!/^AUR-[A-Z0-9]{8}$/.test(ref)) return;
  await createServiceClient().rpc("cancel_own_pending_payment", { p_user: user.id, p_reference: ref });
  revalidatePath("/app/pagamentos");
  redirect("/app/pagamentos");
}
