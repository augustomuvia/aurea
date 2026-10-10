"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/admin";
import { fieldErrors } from "@/lib/validation";
import { checkCheckoutUrl, EBOOK_SECTIONS, parseKzToMinor, ebookConfigSchema, sellableProblems, type EbookConfig } from "@/lib/ebook/config";
import { EBOOK_MEDIA_BUCKET, getEbookRow } from "@/lib/ebook/server";
import { detectImageKind, EBOOK_MEDIA_MAX_BYTES, EBOOK_MEDIA_PATH } from "@/lib/ebook/media";
import type { ActionResult } from "@/lib/types";

const MAX_BENEFITS = 4;
const MAX_FAQ = 12;

function revalidateEbook() {
  revalidatePath("/ebook");
  revalidatePath("/ebook/pre-visualizar");
  revalidatePath("/admin/ebook");
}

async function writeDraft(adminId: string, draft: EbookConfig) {
  return createServiceClient().from("ebook_page").upsert({ id: 1, draft, updated_by: adminId }, { onConflict: "id" });
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").replace(/\r\n/g, "\n");

export async function saveEbookDraftAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const row = await getEbookRow();

  const priceMinor = parseKzToMinor(str(formData, "price"));
  if (priceMinor === null || priceMinor < 100) return { ok: false, error: "Preço inválido. Indique o valor em Kz, por exemplo 2500.", fieldErrors: { price: ["Valor em Kz, sem casas decimais."] } };

  const checkoutUrl = str(formData, "checkoutUrl").trim();
  if (checkoutUrl) {
    const c = checkCheckoutUrl(checkoutUrl, serverEnv.ebookCheckoutHosts);
    if (!c.ok) return { ok: false, error: c.error, fieldErrors: { checkoutUrl: [c.error] } };
  }

  const benefits = Array.from({ length: MAX_BENEFITS }, (_, i) => ({ title: str(formData, `benefit_${i}_title`).trim(), text: str(formData, `benefit_${i}_text`).trim() })).filter(
    (b) => b.title || b.text,
  );
  const faq = Array.from({ length: MAX_FAQ }, (_, i) => ({ q: str(formData, `faq_${i}_q`).trim(), a: str(formData, `faq_${i}_a`).trim() })).filter((f) => f.q || f.a);
  const items = str(formData, "con_items")
    .split("\n")
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean);

  const candidate = {
    priceMinor,
    checkoutUrl: checkoutUrl ? (checkCheckoutUrl(checkoutUrl, serverEnv.ebookCheckoutHosts) as { url: string }).url : "",
    hero: { eyebrow: str(formData, "hero_eyebrow"), title: str(formData, "hero_title"), subtitle: str(formData, "hero_subtitle"), cta: str(formData, "hero_cta") },
    orientacao: { title: str(formData, "ori_title"), body: str(formData, "ori_body"), benefits },
    conteudo: { title: str(formData, "con_title"), items, note: str(formData, "con_note") },
    experiencia: { title: str(formData, "exp_title"), body: str(formData, "exp_body") },
    oferta: {
      title: str(formData, "off_title"),
      productName: str(formData, "off_productName"),
      description: str(formData, "off_description"),
      label: str(formData, "off_label"),
      cta: str(formData, "off_cta"),
      microtext: str(formData, "off_microtext"),
      checkoutNotice: str(formData, "off_checkoutNotice"),
    },
    faq,
    sections: Object.fromEntries(EBOOK_SECTIONS.map((s) => [s, formData.get(`sec_${s}`) === "on"])),
    media: row.draft.media,
  };
  const parsed = ebookConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Verifique o campo «${issue.path.join(" › ")}»: ${issue.message}`, fieldErrors: fieldErrors(parsed.error) };
  }
  const { error } = await writeDraft(admin.id, parsed.data);
  if (error) {
    console.error("[ebook] guardar rascunho", error.message);
    return { ok: false, error: "Não foi possível guardar. Confirme que a migração do e-book foi aplicada no Supabase." };
  }
  await audit(admin.id, "ebook.save_draft", "ebook", "1", null, { priceMinor: parsed.data.priceMinor, checkoutHost: parsed.data.checkoutUrl ? new URL(parsed.data.checkoutUrl).hostname : null });
  revalidateEbook();
  return { ok: true, message: "Rascunho guardado. Pré-visualize e publique quando estiver pronto." };
}

export async function publishEbookAction(_: unknown, __: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const row = await getEbookRow();
  if (!row.exists) return { ok: false, error: "Guarde primeiro o rascunho." };
  const problems = sellableProblems(row.draft, serverEnv.ebookCheckoutHosts);
  if (problems.length) return { ok: false, error: `Não é possível publicar: ${problems.join(" ")}` };
  const svc = createServiceClient();
  const { error } = await svc.from("ebook_page").update({ published: row.draft, published_at: new Date().toISOString(), updated_by: admin.id }).eq("id", 1);
  if (error) return { ok: false, error: "Não foi possível publicar." };
  // Imagens que deixaram de ser usadas no rascunho e na versão publicada.
  const keep = new Set(mediaPaths(row.draft));
  const orphans = mediaPaths(row.published).filter((p) => !keep.has(p));
  if (orphans.length) await svc.storage.from(EBOOK_MEDIA_BUCKET).remove(orphans);
  await audit(admin.id, "ebook.publish", "ebook", "1", null, { priceMinor: row.draft.priceMinor });
  revalidateEbook();
  return { ok: true, message: row.enabled ? "Publicado. A página pública já mostra esta versão." : "Publicado. Ative a página para a tornar acessível." };
}

export async function discardDraftAction(_: unknown, __: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const row = await getEbookRow();
  if (!row.published) return { ok: false, error: "Ainda não existe versão publicada." };
  const keep = new Set(mediaPaths(row.published));
  const orphans = mediaPaths(row.draft).filter((p) => !keep.has(p));
  const { error } = await writeDraft(admin.id, row.published);
  if (error) return { ok: false, error: "Não foi possível descartar." };
  if (orphans.length) await createServiceClient().storage.from(EBOOK_MEDIA_BUCKET).remove(orphans);
  await audit(admin.id, "ebook.discard_draft", "ebook", "1", null, {});
  revalidateEbook();
  return { ok: true, message: "Rascunho reposto a partir da versão publicada." };
}

export async function setEbookEnabledAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const enable = formData.get("enable") === "1";
  const row = await getEbookRow();
  if (enable) {
    if (!row.published) return { ok: false, error: "Publique primeiro a página." };
    const problems = sellableProblems(row.published, serverEnv.ebookCheckoutHosts);
    if (problems.length) return { ok: false, error: `A versão publicada não está pronta: ${problems.join(" ")}` };
  } else if (!row.exists) {
    return { ok: true, message: "A página já está desativada." };
  }
  const { error } = await createServiceClient().from("ebook_page").update({ enabled: enable, updated_by: admin.id }).eq("id", 1);
  if (error) return { ok: false, error: "Não foi possível alterar o estado." };
  await audit(admin.id, enable ? "ebook.enable" : "ebook.disable", "ebook", "1", null, {});
  revalidateEbook();
  return { ok: true, message: enable ? "Página ativa em /ebook." : "Página desativada: /ebook passa a responder «não encontrado»." };
}

export async function resetEbookAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  if (String(formData.get("confirm") ?? "").trim() !== "ELIMINAR") return { ok: false, error: 'Escreva "ELIMINAR" para confirmar.' };
  const row = await getEbookRow();
  const svc = createServiceClient();
  const { error } = await svc.from("ebook_page").delete().eq("id", 1);
  if (error) return { ok: false, error: "Não foi possível eliminar a configuração." };
  const files = [...new Set([...mediaPaths(row.draft), ...mediaPaths(row.published)])];
  if (files.length) await svc.storage.from(EBOOK_MEDIA_BUCKET).remove(files);
  await audit(admin.id, "ebook.reset", "ebook", "1", null, { removedFiles: files.length });
  revalidateEbook();
  redirect("/admin/ebook?eliminado=1");
}

export async function uploadEbookMediaAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const kind = formData.get("kind") === "cover" ? "cover" : "previews";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Escolha uma imagem." };
  if (file.size > EBOOK_MEDIA_MAX_BYTES) return { ok: false, error: "A imagem tem mais de 3 MB." };
  const buf = new Uint8Array(await file.arrayBuffer());
  const img = detectImageKind(buf);
  if (!img) return { ok: false, error: "Formato não aceite. Use PNG, JPG ou WebP." };

  const row = await getEbookRow();
  if (kind === "previews" && row.draft.media.previews.length >= 6) return { ok: false, error: "Máximo de 6 pré-visualizações." };
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const path = `${kind}/${rand}.${img.ext}`;
  const svc = createServiceClient();
  const up = await svc.storage.from(EBOOK_MEDIA_BUCKET).upload(path, buf, { contentType: img.mime, upsert: false, cacheControl: "31536000" });
  if (up.error) {
    console.error("[ebook] upload", up.error.message);
    return { ok: false, error: "Não foi possível carregar a imagem. Confirme que a migração do e-book foi aplicada." };
  }
  const previous = row.draft.media.cover;
  const media = kind === "cover" ? { ...row.draft.media, cover: path } : { ...row.draft.media, previews: [...row.draft.media.previews, path] };
  const { error } = await writeDraft(admin.id, { ...row.draft, media });
  if (error) {
    await svc.storage.from(EBOOK_MEDIA_BUCKET).remove([path]);
    return { ok: false, error: "Não foi possível guardar a imagem." };
  }
  // A capa anterior só é apagada se não estiver na versão publicada.
  if (kind === "cover" && previous && !mediaPaths(row.published).includes(previous)) await svc.storage.from(EBOOK_MEDIA_BUCKET).remove([previous]);
  await audit(admin.id, "ebook.media_upload", "ebook", "1", null, { kind, path });
  revalidateEbook();
  return { ok: true, message: kind === "cover" ? "Capa carregada no rascunho." : "Pré-visualização adicionada ao rascunho." };
}

export async function removeEbookMediaAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await assertSuperAdmin();
  const path = String(formData.get("path") ?? "");
  if (!EBOOK_MEDIA_PATH.test(path)) return { ok: false, error: "Imagem inválida." };
  const row = await getEbookRow();
  const media = { cover: row.draft.media.cover === path ? null : row.draft.media.cover, previews: row.draft.media.previews.filter((p) => p !== path) };
  const { error } = await writeDraft(admin.id, { ...row.draft, media });
  if (error) return { ok: false, error: "Não foi possível remover." };
  if (!mediaPaths(row.published).includes(path)) await createServiceClient().storage.from(EBOOK_MEDIA_BUCKET).remove([path]);
  await audit(admin.id, "ebook.media_remove", "ebook", "1", null, { path });
  revalidateEbook();
  return { ok: true, message: "Imagem removida do rascunho." };
}

function mediaPaths(cfg: EbookConfig | null): string[] {
  if (!cfg) return [];
  return [cfg.media.cover, ...cfg.media.previews].filter((p): p is string => Boolean(p));
}
