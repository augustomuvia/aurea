"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { kickQueue } from "@/lib/notifications/server";
import { createServiceClient } from "@/lib/supabase/admin";

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
