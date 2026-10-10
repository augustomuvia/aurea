"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { kickQueue } from "@/lib/notifications/server";
import { slugify } from "@/lib/format";
import { checkYouTubeOEmbed, parseYouTubeUrl } from "@/lib/youtube";
import { contentSchema, evidenceSchema, fieldErrors, planSchema, reasonSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";
import { checkCheckoutUrl } from "@/lib/ebook/config";
import { serverEnv } from "@/lib/env";
import { CONTENT_AUDIO_BUCKET, CONTENT_AUDIO_MAX_BYTES, CONTENT_AUDIO_TYPES } from "@/lib/audio";

const uuid = z.string().uuid();

const RPC_ERRORS: Record<string, string> = {
  forbidden: "Sem permissão.",
  evidence_required: "Indique a evidência verificada (mínimo 10 caracteres).",
  transaction_id_required: "Indique o identificador da transação confirmado no extrato.",
  amount_mismatch: "O valor não corresponde ao pedido.",
  transaction_reused: "Este identificador de transação já foi usado noutro pagamento.",
  payment_not_pending: "Este pagamento já não está pendente.",
  payment_not_found: "Pagamento não encontrado.",
  already_confirmed_other_txn: "Este pagamento já foi confirmado com outra transação.",
  reason_required: "Indique um motivo.",
  payment_not_confirmed: "Apenas pagamentos confirmados podem ser revertidos.",
  invalid_expiry: "Data de expiração inválida.",
  cannot_change_self: "Não pode alterar o estado da sua própria conta.",
  cannot_reactivate: "Só é possível reativar assinaturas suspensas e ainda dentro do período.",
  invalid_transition: "Transição de estado inválida.",
  subscription_not_found: "O utilizador não tem assinatura.",
  user_not_found: "Utilizador não encontrado.",
};

function rpcResult(data: unknown, error: { message: string } | null, okMessage: string): ActionResult {
  if (error) return { ok: false, error: "Erro ao processar o pedido." };
  const r = data as { ok: boolean; error?: string; status?: string };
  if (!r?.ok) return { ok: false, error: RPC_ERRORS[r?.error ?? ""] ?? "Não foi possível concluir a operação." };
  return { ok: true, message: okMessage };
}

// ------------------------------------------------------------------ Pagamentos

export async function confirmPaymentAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const id = uuid.safeParse(formData.get("paymentId"));
  const evidence = evidenceSchema.safeParse(formData.get("evidence"));
  const txn = z.string().trim().min(4).max(64).safeParse(formData.get("transactionId"));
  if (!id.success) return { ok: false, error: "Pagamento inválido." };
  if (!txn.success) return { ok: false, error: "Indique o identificador da transação confirmado no extrato.", fieldErrors: { transactionId: ["Obrigatório."] } };
  if (!evidence.success) return { ok: false, error: evidence.error.issues[0].message, fieldErrors: { evidence: [evidence.error.issues[0].message] } };
  if (formData.get("confirmReceived") !== "on") return { ok: false, error: "Confirme que verificou a receção do valor." };

  const svc = createServiceClient();
  // Referência e valor lidos da BD: o formulário não pode alterar o montante.
  const { data: payment } = await svc.from("payments").select("reference, amount_minor").eq("id", id.data).maybeSingle();
  if (!payment) return { ok: false, error: "Pagamento não encontrado." };

  const { data, error } = await svc.rpc("confirm_payment", {
    p_reference: payment.reference,
    p_amount_minor: payment.amount_minor,
    p_provider_txn_id: txn.data,
    p_source: "admin",
    p_actor: admin.id,
    p_evidence: evidence.data,
    p_provider_event_id: null,
  });
  const result = rpcResult(data, error, "Pagamento confirmado e assinatura ativada.");
  // Os e-mails (admin e cliente) e as notificações foram criados na mesma transação
  // da confirmação; aqui apenas se pede o envio imediato. Uma falha de envio não
  // afeta o pagamento nem a assinatura: o trabalho fica na fila.
  if (result.ok) kickQueue();
  revalidatePath("/admin/pagamentos");
  revalidatePath("/admin");
  return result;
}

export async function rejectPaymentAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const id = uuid.safeParse(formData.get("paymentId"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!id.success) return { ok: false, error: "Pagamento inválido." };
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };
  const { data, error } = await createServiceClient().rpc("reject_payment", { p_payment_id: id.data, p_actor: admin.id, p_reason: reason.data });
  revalidatePath("/admin/pagamentos");
  return rpcResult(data, error, "Pagamento rejeitado.");
}

export async function reversePaymentAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const id = uuid.safeParse(formData.get("paymentId"));
  const reason = z.string().trim().min(10, "Descreva a correção (mínimo 10 caracteres).").max(500).safeParse(formData.get("reason"));
  if (!id.success) return { ok: false, error: "Pagamento inválido." };
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };
  if (formData.get("confirmReverse") !== "REVERTER") return { ok: false, error: 'Escreva "REVERTER" para confirmar.' };
  const { data, error } = await createServiceClient().rpc("reverse_payment", { p_payment_id: id.data, p_actor: admin.id, p_reason: reason.data });
  revalidatePath("/admin/pagamentos");
  return rpcResult(data, error, "Pagamento revertido e período removido.");
}

// ------------------------------------------------------------------ Utilizadores

export async function grantAccessAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const userId = uuid.safeParse(formData.get("userId"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("expiresAt"));
  if (!userId.success) return { ok: false, error: "Utilizador inválido." };
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };
  if (!date.success) return { ok: false, error: "Indique a data de expiração." };
  const expires = new Date(`${date.data}T23:59:59+01:00`).toISOString();
  const { data, error } = await createServiceClient().rpc("grant_manual_access", { p_user: userId.data, p_expires_at: expires, p_reason: reason.data, p_actor: admin.id });
  revalidatePath(`/admin/utilizadores/${userId.data}`);
  return rpcResult(data, error, "Acesso premium concedido.");
}

export async function setAccountStatusAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const userId = uuid.safeParse(formData.get("userId"));
  const status = z.enum(["active", "suspended"]).safeParse(formData.get("status"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!userId.success || !status.success) return { ok: false, error: "Dados inválidos." };
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("admin_set_account_status", { p_user: userId.data, p_status: status.data, p_reason: reason.data, p_actor: admin.id });
  const result = rpcResult(data, error, status.data === "suspended" ? "Conta suspensa e sessões terminadas." : "Conta reativada.");
  if (result.ok) {
    // Bloqueia novos inícios de sessão no Supabase Auth e invalida sessões existentes.
    await svc.auth.admin.updateUserById(userId.data, { ban_duration: status.data === "suspended" ? "876000h" : "none" });
    if (status.data === "suspended") await svc.rpc("admin_revoke_sessions", { p_user: userId.data });
  }
  revalidatePath(`/admin/utilizadores/${userId.data}`);
  return result;
}

export async function revokeSessionsAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const userId = uuid.safeParse(formData.get("userId"));
  if (!userId.success) return { ok: false, error: "Utilizador inválido." };
  const { error } = await createServiceClient().rpc("admin_revoke_sessions", { p_user: userId.data });
  if (error) return { ok: false, error: "Não foi possível terminar as sessões." };
  await audit(admin.id, "account.revoke_sessions", "user", userId.data, null);
  return { ok: true, message: "Sessões terminadas. O utilizador terá de iniciar sessão novamente." };
}

export async function setSubscriptionStatusAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const userId = uuid.safeParse(formData.get("userId"));
  const status = z.enum(["suspended", "cancelled", "active"]).safeParse(formData.get("status"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!userId.success || !status.success) return { ok: false, error: "Dados inválidos." };
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };
  const { data, error } = await createServiceClient().rpc("admin_set_subscription_status", { p_user: userId.data, p_status: status.data, p_reason: reason.data, p_actor: admin.id });
  revalidatePath(`/admin/utilizadores/${userId.data}`);
  revalidatePath("/admin/assinaturas");
  return rpcResult(data, error, "Estado da assinatura atualizado.");
}

export async function updateUserNameAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const userId = uuid.safeParse(formData.get("userId"));
  const name = z.string().trim().min(2).max(120).safeParse(formData.get("fullName"));
  if (!userId.success || !name.success) return { ok: false, error: "Nome inválido." };
  const svc = createServiceClient();
  const { data: before } = await svc.from("profiles").select("full_name").eq("id", userId.data).maybeSingle();
  const { error } = await svc.from("profiles").update({ full_name: name.data }).eq("id", userId.data);
  if (error) return { ok: false, error: "Não foi possível guardar." };
  await audit(admin.id, "account.update_name", "user", userId.data, null, { from: before?.full_name, to: name.data });
  revalidatePath(`/admin/utilizadores/${userId.data}`);
  return { ok: true, message: "Nome atualizado." };
}

// ------------------------------------------------------------------ Conteúdos

function readContentForm(formData: FormData) {
  const list = (k: string) =>
    String(formData.get(k) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return contentSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug") ?? "",
    description: formData.get("description") ?? "",
    youtubeUrl: formData.get("youtubeUrl"),
    declaredFrequencyHz: formData.get("declaredFrequencyHz"),
    durationSeconds: (() => {
      const m = Number(formData.get("durationMinutes") || 0);
      return m > 0 ? Math.round(m * 60) : "";
    })(),
    coverUrl: formData.get("coverUrl") ?? "",
    categoryIds: formData.getAll("categoryIds").map(String),
    recommendedUse: formData.getAll("recommendedUse").map(String),
    tags: list("tags"),
    isPremium: formData.get("isPremium") === "on",
    isBinaural: formData.get("isBinaural") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    featuredOrder: formData.get("featuredOrder") || 0,
    status: formData.get("status") ?? "draft",
  });
}

export async function saveContentAction(_: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const admin = await assertSuperAdmin();
  const existingId = formData.get("id") ? uuid.safeParse(formData.get("id")) : null;
  if (existingId && !existingId.success) return { ok: false, error: "Conteúdo inválido." };
  const parsed = readContentForm(formData);
  if (!parsed.success) return { ok: false, error: "Verifique os campos assinalados.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const svc = createServiceClient();
  // Sem URL do YouTube: só para conteúdos que já tocam pelo áudio próprio.
  let yt: { videoId: string; canonicalUrl: string } | null = null;
  if (v.youtubeUrl) {
    const parsedYt = parseYouTubeUrl(v.youtubeUrl);
    if (!parsedYt.ok) return { ok: false, error: parsedYt.error, fieldErrors: { youtubeUrl: [parsedYt.error] } };
    yt = parsedYt;
  } else {
    const { data: media } = existingId ? await svc.from("content_media").select("audio_path").eq("content_id", existingId.data).maybeSingle() : { data: null };
    if (!media?.audio_path) {
      const msg = "Indique o URL do YouTube, ou use Enviar áudios para criar conteúdos só com áudio próprio.";
      return { ok: false, error: msg, fieldErrors: { youtubeUrl: [msg] } };
    }
  }

  // Verificação oficial (oEmbed): rejeita vídeos privados/inexistentes e sem incorporação.
  const check = yt ? await checkYouTubeOEmbed(yt.videoId) : ({ ok: true } as const);
  if (!check.ok && check.reason === "not_found") return { ok: false, error: "Vídeo inexistente ou privado.", fieldErrors: { youtubeUrl: ["O vídeo não está disponível publicamente."] } };
  if (!check.ok && check.reason === "not_embeddable") return { ok: false, error: "O proprietário não permite a incorporação deste vídeo.", fieldErrors: { youtubeUrl: ["Incorporação não permitida."] } };

  const slug = v.slug || slugify(v.title) || `som-${Date.now().toString(36)}`;
  const row = {
    slug,
    title: v.title,
    description: v.description,
    declared_frequency_hz: v.declaredFrequencyHz,
    duration_seconds: v.durationSeconds,
    cover_url: v.coverUrl || null,
    youtube_video_id: yt?.videoId ?? null,
    status: v.status,
    is_premium: v.isPremium,
    is_binaural: v.isBinaural,
    is_featured: v.isFeatured,
    featured_order: v.featuredOrder,
    recommended_use: v.recommendedUse,
    tags: [...new Set(v.tags)],
    embed_error: check.ok ? null : "verification_unavailable",
    embed_checked_at: yt ? new Date().toISOString() : null,
  };

  let id: string;
  if (existingId) {
    const { data: prev } = await svc.from("content_items").select("status, published_at").eq("id", existingId.data).maybeSingle();
    if (!prev) return { ok: false, error: "Conteúdo não encontrado." };
    const { error } = await svc
      .from("content_items")
      .update({ ...row, published_at: v.status === "published" ? (prev.published_at ?? new Date().toISOString()) : prev.published_at })
      .eq("id", existingId.data);
    if (error) return { ok: false, error: error.code === "23505" ? "Já existe um conteúdo com este identificador (slug)." : "Não foi possível guardar.", fieldErrors: error.code === "23505" ? { slug: ["Em uso."] } : undefined };
    id = existingId.data;
  } else {
    const { data, error } = await svc
      .from("content_items")
      .insert({ ...row, created_by: admin.id, published_at: v.status === "published" ? new Date().toISOString() : null })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.code === "23505" ? "Já existe um conteúdo com este identificador (slug)." : "Não foi possível guardar.", fieldErrors: error?.code === "23505" ? { slug: ["Em uso."] } : undefined };
    id = data.id;
  }

  await svc.from("content_media").upsert({ content_id: id, youtube_url: yt?.canonicalUrl ?? null, youtube_video_id: yt?.videoId ?? null });
  await svc.from("content_categories").delete().eq("content_id", id);
  if (v.categoryIds.length) await svc.from("content_categories").insert(v.categoryIds.map((category_id) => ({ content_id: id, category_id })));

  await audit(admin.id, existingId ? "content.update" : "content.create", "content", id, null, { title: v.title, status: v.status, video: yt?.videoId ?? null });
  revalidatePath("/admin/conteudos");
  revalidatePath("/app", "layout");
  if (!existingId) redirect(`/admin/conteudos/${id}?criado=1`);
  return { ok: true, message: check.ok ? "Conteúdo guardado." : "Conteúdo guardado. Não foi possível verificar o vídeo no YouTube agora; confirme a reprodução.", data: { id } };
}

export async function setContentStatusAction(formData: FormData) {
  const admin = await assertSuperAdmin();
  const id = uuid.parse(formData.get("id"));
  const status = z.enum(["draft", "published", "unpublished", "removed"]).parse(formData.get("status"));
  const svc = createServiceClient();
  const { data: prev } = await svc.from("content_items").select("published_at").eq("id", id).maybeSingle();
  await svc
    .from("content_items")
    .update({ status, published_at: status === "published" ? (prev?.published_at ?? new Date().toISOString()) : prev?.published_at })
    .eq("id", id);
  await audit(admin.id, "content.set_status", "content", id, null, { status });
  revalidatePath("/admin/conteudos");
  revalidatePath("/app", "layout");
}

export async function recheckEmbedAction(formData: FormData) {
  const admin = await assertSuperAdmin();
  const id = uuid.parse(formData.get("id"));
  const svc = createServiceClient();
  const { data } = await svc.from("content_items").select("youtube_video_id").eq("id", id).maybeSingle();
  if (!data?.youtube_video_id) return;
  const check = await checkYouTubeOEmbed(data.youtube_video_id);
  await svc
    .from("content_items")
    .update({ embed_error: check.ok ? null : check.reason, embed_checked_at: new Date().toISOString() })
    .eq("id", id);
  await audit(admin.id, "content.recheck_embed", "content", id, null, { result: check.ok ? "ok" : check.reason });
  revalidatePath("/admin/conteudos");
}

// ------------------------------------------------------------------ Planos

export async function updatePlanAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const parsed = planSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priceKz: formData.get("priceKz"),
    features: String(formData.get("features") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    isActive: formData.get("isActive") === "on",
    isHighlighted: formData.get("isHighlighted") === "on",
    includesOwnAudio: formData.get("includesOwnAudio") === "on",
    checkoutUrl: String(formData.get("checkoutUrl") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  let checkoutUrl: string | null = null;
  if (v.checkoutUrl) {
    const c = checkCheckoutUrl(v.checkoutUrl, serverEnv.planCheckoutHosts);
    if (!c.ok) return { ok: false, error: c.error, fieldErrors: { checkoutUrl: [c.error] } };
    checkoutUrl = c.url;
  }
  const svc = createServiceClient();
  const { data: before } = await svc.from("plans").select("*").eq("id", v.id).maybeSingle();
  if (!before) return { ok: false, error: "Plano não encontrado." };
  const amount = v.priceKz * 100;
  const { error } = await svc
    .from("plans")
    .update({ name: v.name, description: v.description, amount_minor: amount, features: v.features, is_active: v.isActive, is_highlighted: v.isHighlighted, includes_own_audio: v.includesOwnAudio, checkout_url: checkoutUrl })
    .eq("id", v.id);
  if (error) return { ok: false, error: "Não foi possível guardar." };
  await audit(admin.id, "plan.update", "plan", v.id, null, {
    code: before.code,
    price_from_minor: before.amount_minor,
    price_to_minor: amount,
    active: v.isActive,
    own_audio: v.includesOwnAudio,
    checkout_url: checkoutUrl,
  });
  revalidatePath("/admin/planos");
  revalidatePath("/planos");
  revalidatePath("/");
  return { ok: true, message: "Plano atualizado. Pedidos já criados mantêm o valor original." };
}

// ------------------------------------------------------------------ Configurações

const SETTINGS_SCHEMAS = {
  brand: z.object({ name: z.string().trim().min(2).max(40), slogan: z.string().trim().max(120), logo_url: z.string().trim().url().startsWith("https://").nullable().or(z.literal("").transform(() => null)) }),
  support: z.object({
    email: z.string().trim().email().nullable().or(z.literal("").transform(() => null)),
    phone: z.string().trim().max(40).nullable().or(z.literal("").transform(() => null)),
    whatsapp: z.string().trim().max(40).nullable().or(z.literal("").transform(() => null)),
    hours: z.string().trim().max(120).nullable().or(z.literal("").transform(() => null)),
  }),
  announcement: z.object({ active: z.boolean(), message: z.string().trim().max(200) }),
  maintenance: z.object({ enabled: z.boolean(), message: z.string().trim().max(300) }),
  payment: z.object({
    mode: z.literal("manual_review"),
    mcx_recipient_name: z.string().trim().max(80).nullable().or(z.literal("").transform(() => null)),
    mcx_recipient_phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ]{9,16}$/, "Número inválido.")
      .nullable()
      .or(z.literal("").transform(() => null)),
    instructions: z.string().trim().max(800).nullable().or(z.literal("").transform(() => null)),
  }),
  email: z.object({ from_name: z.string().trim().min(2).max(60), from_email: z.string().trim().email().nullable().or(z.literal("").transform(() => null)), send_payment_emails: z.boolean() }),
  legal: z.object({
    company_name: z.string().trim().max(120).nullable().or(z.literal("").transform(() => null)),
    nif: z.string().trim().max(30).nullable().or(z.literal("").transform(() => null)),
    address: z.string().trim().max(200).nullable().or(z.literal("").transform(() => null)),
    terms_updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    privacy_updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
} as const;

export async function updateSettingsAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const key = String(formData.get("key") ?? "") as keyof typeof SETTINGS_SCHEMAS;
  const schema = SETTINGS_SCHEMAS[key];
  if (!schema) return { ok: false, error: "Secção inválida." };
  const raw: Record<string, unknown> = {};
  for (const field of Object.keys(schema.shape)) {
    const v = formData.get(field);
    raw[field] = ["active", "enabled", "send_payment_emails"].includes(field) ? v === "on" : (v ?? "");
  }
  if (key === "payment") raw.mode = "manual_review";
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos.", fieldErrors: fieldErrors(parsed.error) };
  const svc = createServiceClient();
  const { data: before } = await svc.from("platform_settings").select("value").eq("key", key).maybeSingle();
  const { error } = await svc.from("platform_settings").update({ value: parsed.data, updated_by: admin.id }).eq("key", key);
  if (error) return { ok: false, error: "Não foi possível guardar." };
  await audit(admin.id, "settings.update", "settings", key, null, { before: before?.value, after: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true, message: "Configurações guardadas." };
}

export async function saveCategoryAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const parsed = z
    .object({
      id: z.string().uuid().optional().or(z.literal("")),
      name: z.string().trim().min(2).max(60),
      slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/).optional().or(z.literal("")),
      description: z.string().trim().max(200),
      kind: z.enum(["purpose", "frequency", "ambient"]),
      sortOrder: z.coerce.number().int().min(0).max(999),
      isVisible: z.boolean(),
    })
    .safeParse({
      id: formData.get("id") ?? "",
      name: formData.get("name"),
      slug: formData.get("slug") ?? "",
      description: formData.get("description") ?? "",
      kind: formData.get("kind"),
      sortOrder: formData.get("sortOrder") || 0,
      isVisible: formData.get("isVisible") === "on",
    });
  if (!parsed.success) return { ok: false, error: "Verifique os campos da categoria." };
  const v = parsed.data;
  const row = { name: v.name, slug: v.slug || slugify(v.name), description: v.description, kind: v.kind, sort_order: v.sortOrder, is_visible: v.isVisible };
  const svc = createServiceClient();
  const { error } = v.id ? await svc.from("categories").update(row).eq("id", v.id) : await svc.from("categories").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? "Já existe uma categoria com este slug." : "Não foi possível guardar." };
  await audit(admin.id, v.id ? "category.update" : "category.create", "category", v.id || row.slug, null, row);
  revalidatePath("/admin/configuracoes");
  revalidatePath("/", "layout");
  return { ok: true, message: "Categoria guardada." };
}

export async function setSupportStatusAction(formData: FormData) {
  const admin = await assertSuperAdmin();
  const id = uuid.parse(formData.get("id"));
  const status = z.enum(["open", "answered", "closed"]).parse(formData.get("status"));
  await createServiceClient().from("support_requests").update({ status }).eq("id", id);
  await audit(admin.id, "support.set_status", "support_request", id, null, { status });
  revalidatePath("/admin/configuracoes");
}

// ------------------------------------------------------------------ Áudio próprio

const audioUploadSchema = z.object({
  contentId: uuid,
  fileName: z.string().min(1).max(200),
  type: z.enum(CONTENT_AUDIO_TYPES),
  size: z.number().int().positive().max(CONTENT_AUDIO_MAX_BYTES),
});

/** Passo 1: URL assinado para o browser enviar o ficheiro diretamente para o Storage. */
export async function createAudioUploadAction(input: z.input<typeof audioUploadSchema>): Promise<ActionResult<{ path: string; token: string }>> {
  await assertSuperAdmin();
  const parsed = audioUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Use um ficheiro MP3 ou M4A até 50 MB." };
  const { contentId, fileName } = parsed.data;
  const ext = /\.m4a$/i.test(fileName) ? "m4a" : /\.aac$/i.test(fileName) ? "aac" : "mp3";
  const path = `${contentId}/${Date.now()}.${ext}`;
  const { data, error } = await createServiceClient().storage.from(CONTENT_AUDIO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Não foi possível preparar o envio. Confirme que a migração do áudio foi aplicada." };
  return { ok: true, data: { path: data.path, token: data.token } };
}

/** Passo 2 (ou remoção com path = null): associa o ficheiro ao conteúdo e apaga o anterior. */
export async function setContentAudioAction(input: { contentId: string; path: string | null }): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const contentId = uuid.safeParse(input.contentId);
  if (!contentId.success) return { ok: false, error: "Conteúdo inválido." };
  const path = input.path;
  if (path !== null && !new RegExp(`^${contentId.data}/[A-Za-z0-9._-]{1,100}$`).test(path)) return { ok: false, error: "Ficheiro inválido." };
  const svc = createServiceClient();
  const bucket = svc.storage.from(CONTENT_AUDIO_BUCKET);
  if (path) {
    const name = path.slice(contentId.data.length + 1);
    const { data: found } = await bucket.list(contentId.data, { search: name, limit: 1 });
    if (!found?.some((f) => f.name === name)) return { ok: false, error: "O ficheiro não chegou ao servidor. Tente enviar de novo." };
  }
  const { data: prev } = await svc.from("content_media").select("audio_path, youtube_video_id").eq("content_id", contentId.data).maybeSingle();
  if (!prev && !path) return { ok: true };
  if (!path && !prev?.youtube_video_id) return { ok: false, error: "Este conteúdo só tem áudio próprio. Carregue outro ficheiro em vez de remover." };
  const { error } = prev
    ? await svc.from("content_media").update({ audio_path: path }).eq("content_id", contentId.data)
    : await svc.from("content_media").insert({ content_id: contentId.data, audio_path: path });
  if (error) return { ok: false, error: "Não foi possível guardar o áudio." };
  if (prev?.audio_path && prev.audio_path !== path) await bucket.remove([prev.audio_path]);
  await audit(admin.id, path ? "content.audio_set" : "content.audio_remove", "content", contentId.data, null, { path });
  revalidatePath(`/admin/conteudos/${contentId.data}`);
  revalidatePath("/app", "layout");
  return { ok: true, message: path ? "Áudio guardado. Este conteúdo já toca com o ecrã bloqueado." : "Áudio removido. O conteúdo volta a usar o YouTube." };
}

// ------------------------------------------------------------------ Envio em massa (conteúdos só com áudio)

const bulkAudioSchema = audioUploadSchema.omit({ contentId: true }).extend({
  title: z.string().trim().min(2).max(140),
  durationSeconds: z.number().int().positive().max(86400 * 2).nullable(),
  isPremium: z.boolean(),
  isBinaural: z.boolean(),
  declaredFrequencyHz: z.number().positive().max(100000).nullable(),
  categoryId: uuid.nullable(),
});

/** Passo 1 do envio em massa: cria o conteúdo (rascunho, sem YouTube) e o URL assinado para o ficheiro. */
export async function createAudioContentAction(input: z.input<typeof bulkAudioSchema>): Promise<ActionResult<{ contentId: string; path: string; token: string }>> {
  const admin = await assertSuperAdmin();
  const parsed = bulkAudioSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ficheiro ou dados inválidos (MP3/M4A até 50 MB)." };
  const v = parsed.data;
  const svc = createServiceClient();
  const slug = `${(slugify(v.title) || "som").slice(0, 80)}-${Math.random().toString(36).slice(2, 7)}`;
  const { data: item, error } = await svc
    .from("content_items")
    .insert({
      slug,
      title: v.title,
      status: "draft",
      is_premium: v.isPremium,
      is_binaural: v.isBinaural,
      declared_frequency_hz: v.declaredFrequencyHz,
      duration_seconds: v.durationSeconds,
      youtube_video_id: null,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error || !item) return { ok: false, error: "Não foi possível criar o conteúdo. Confirme que as migrações de áudio foram aplicadas." };
  if (v.categoryId) await svc.from("content_categories").insert({ content_id: item.id, category_id: v.categoryId });
  const ext = /\.m4a$/i.test(v.fileName) ? "m4a" : /\.aac$/i.test(v.fileName) ? "aac" : "mp3";
  const { data: up } = await svc.storage.from(CONTENT_AUDIO_BUCKET).createSignedUploadUrl(`${item.id}/${Date.now()}.${ext}`);
  if (!up) {
    await svc.from("content_items").delete().eq("id", item.id);
    return { ok: false, error: "Não foi possível preparar o envio." };
  }
  return { ok: true, data: { contentId: item.id, path: up.path, token: up.token } };
}

/** Passo 2: associa o ficheiro enviado e, se pedido, publica. */
export async function finishAudioContentAction(input: { contentId: string; path: string; publish: boolean }): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const saved = await setContentAudioAction({ contentId: input.contentId, path: input.path });
  if (!saved.ok) return saved;
  if (input.publish) {
    await createServiceClient().from("content_items").update({ status: "published", published_at: new Date().toISOString() }).eq("id", input.contentId);
    await audit(admin.id, "content.publish", "content", input.contentId, null, { via: "bulk_audio" });
  }
  revalidatePath("/admin/conteudos");
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Se o envio do ficheiro falhar, apaga o rascunho criado no passo 1 (só se continuar sem fonte). */
export async function discardAudioContentAction(contentId: string): Promise<void> {
  await assertSuperAdmin();
  const id = uuid.safeParse(contentId);
  if (!id.success) return;
  const svc = createServiceClient();
  const { data: media } = await svc.from("content_media").select("content_id").eq("content_id", id.data).maybeSingle();
  if (media) return;
  await svc.from("content_items").delete().eq("id", id.data).eq("status", "draft").is("youtube_video_id", null);
}
