import Link from "next/link";
import { Plus, AlertTriangle } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { FilterBar, Table, td } from "@/components/admin/Table";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { ButtonLink } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { CONTENT_STATUS_LABEL, formatDate } from "@/lib/format";
import { youtubeThumbnail } from "@/lib/youtube";
import { recheckEmbedAction, setContentStatusAction } from "../actions";

export const metadata = { title: "Conteúdos" };

const EMBED_LABEL: Record<string, string> = {
  embed_not_allowed: "Incorporação não permitida",
  not_embeddable: "Incorporação não permitida",
  unavailable_or_private: "Indisponível ou privado",
  not_found: "Indisponível ou privado",
  verification_unavailable: "Por verificar",
};

export default async function AdminContent({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; erros?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 60);
  let query = createServiceClient()
    .from("content_items")
    .select("id, slug, title, status, is_premium, is_featured, featured_order, youtube_video_id, cover_url, embed_error, updated_at")
    .order("is_featured", { ascending: false })
    .order("featured_order")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (q) query = query.ilike("title", `%${q}%`);
  if (sp.estado && ["draft", "published", "unpublished", "removed"].includes(sp.estado)) query = query.eq("status", sp.estado);
  if (sp.erros === "1") query = query.not("embed_error", "is", null);
  const { data } = await query;
  const rows = data ?? [];

  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Conteúdos" action={<ButtonLink href="/admin/conteudos/novo" size="sm"><Plus className="h-4 w-4" /> Adicionar</ButtonLink>} />
      <FilterBar action="/admin/conteudos">
        <label className="text-xs text-mute">Título<input name="q" defaultValue={q} className={`${inputClass} mt-1 h-11 w-56`} /></label>
        <label className="text-xs text-mute">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ""} className={`${inputClass} mt-1 h-11 w-40`}>
            <option value="">Todos</option>
            {Object.entries(CONTENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="flex h-11 items-center gap-2 text-sm text-paper/70"><input type="checkbox" name="erros" value="1" defaultChecked={sp.erros === "1"} className="accent-[#D6B46A]" /> Só com erros de incorporação</label>
      </FilterBar>
      <Table head={["", "Título", "Estado", "Acesso", "Destaque", "Incorporação", "Atualizado", ""]} empty={!rows.length}>
        {rows.map((c) => (
          <tr key={c.id} className="hover:bg-white/[0.02]">
            <td className={td}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.cover_url || youtubeThumbnail(c.youtube_video_id)} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
            </td>
            <td className={td}><Link href={`/admin/conteudos/${c.id}`} className="font-medium text-paper hover:text-gold-light">{c.title}</Link></td>
            <td className={td}><Badge tone={c.status === "published" ? "ok" : c.status === "removed" ? "danger" : "neutral"}>{CONTENT_STATUS_LABEL[c.status]}</Badge></td>
            <td className={td}>{c.is_premium ? <Badge tone="gold">Premium</Badge> : <Badge>Aberto</Badge>}</td>
            <td className={`${td} text-mute`}>{c.is_featured ? `#${c.featured_order}` : "—"}</td>
            <td className={td}>
              {c.embed_error ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-danger"><AlertTriangle className="h-3.5 w-3.5" /> {EMBED_LABEL[c.embed_error] ?? c.embed_error}</span>
              ) : (
                <span className="text-xs text-mute">OK</span>
              )}
            </td>
            <td className={`${td} text-mute`}>{formatDate(c.updated_at)}</td>
            <td className={`${td} whitespace-nowrap text-right`}>
              <form action={recheckEmbedAction} className="inline">
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-mute hover:text-paper">Verificar</button>
              </form>
              <form action={setContentStatusAction} className="ml-3 inline">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value={c.status === "published" ? "unpublished" : "published"} />
                <button className="text-xs text-gold-light hover:underline">{c.status === "published" ? "Despublicar" : "Publicar"}</button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
