import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { FilterBar, Pager, Table, td } from "@/components/admin/Table";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { inputClass } from "@/components/ui/Field";
import { formatDate, SUBSCRIPTION_STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "Utilizadores" };
const PAGE = 50;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; p?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  const q = (sp.q ?? "").replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80);
  let query = createServiceClient()
    .from("profiles")
    .select("id, email, full_name, status, created_at, subscriptions(status, expires_at), roles(role)")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE);
  if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  if (sp.estado === "active" || sp.estado === "suspended") query = query.eq("status", sp.estado);
  const { data } = await query;
  type Row = { id: string; email: string; full_name: string; status: string; created_at: string; subscriptions: { status: string; expires_at: string | null } | null; roles: { role: string }[] };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader eyebrow="Gestão" title="Utilizadores" />
      <FilterBar action="/admin/utilizadores">
        <label className="text-xs text-mute">
          Nome ou e-mail
          <input name="q" defaultValue={q} className={`${inputClass} mt-1 h-11 w-64`} />
        </label>
        <label className="text-xs text-mute">
          Conta
          <select name="estado" defaultValue={sp.estado ?? ""} className={`${inputClass} mt-1 h-11 w-40`}>
            <option value="">Todas</option>
            <option value="active">Ativas</option>
            <option value="suspended">Suspensas</option>
          </select>
        </label>
      </FilterBar>
      <Table head={["Nome", "E-mail", "Conta", "Assinatura", "Expira", "Registo"]} empty={!rows.length}>
        {rows.slice(0, PAGE).map((u) => {
          const sub = u.subscriptions;
          const eff = sub ? (sub.status === "active" && sub.expires_at && new Date(sub.expires_at) <= new Date() ? "expired" : sub.status) : "none";
          return (
            <tr key={u.id} className="hover:bg-white/[0.02]">
              <td className={td}>
                <Link href={`/admin/utilizadores/${u.id}`} className="font-medium text-paper hover:text-gold-light">{u.full_name || "—"}</Link>
                {u.roles?.length ? <span className="ml-2"><Badge tone="gold">admin</Badge></span> : null}
              </td>
              <td className={`${td} text-paper/75`}>{u.email}</td>
              <td className={td}><Badge tone={u.status === "active" ? "neutral" : "danger"}>{u.status === "active" ? "Ativa" : "Suspensa"}</Badge></td>
              <td className={td}><Badge tone={eff === "active" ? "ok" : eff === "pending_payment" ? "warn" : "neutral"}>{SUBSCRIPTION_STATUS_LABEL[eff]}</Badge></td>
              <td className={`${td} text-mute`}>{formatDate(sub?.expires_at)}</td>
              <td className={`${td} text-mute`}>{formatDate(u.created_at)}</td>
            </tr>
          );
        })}
      </Table>
      <Pager page={page} hasMore={rows.length > PAGE} base={`/admin/utilizadores?q=${encodeURIComponent(q)}&estado=${sp.estado ?? ""}`} />
    </>
  );
}
