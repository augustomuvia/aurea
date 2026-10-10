import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { FilterBar, Table, td } from "@/components/admin/Table";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { inputClass } from "@/components/ui/Field";
import { formatDate, formatDateTime, SUBSCRIPTION_STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "Assinaturas" };

export default async function AdminSubscriptions({ searchParams }: { searchParams: Promise<{ estado?: string; expira?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const now = new Date().toISOString();
  let query = createServiceClient()
    .from("subscriptions")
    .select("id, user_id, status, starts_at, expires_at, payment_method, last_confirmed_at, plans(name), profiles(email, full_name)")
    .order("expires_at", { ascending: true, nullsFirst: false })
    .limit(500);
  if (sp.estado === "active") query = query.eq("status", "active").gt("expires_at", now);
  else if (sp.estado === "expired") query = query.or(`status.eq.expired,and(status.eq.active,expires_at.lte.${now})`);
  else if (sp.estado && ["pending_payment", "suspended", "cancelled"].includes(sp.estado)) query = query.eq("status", sp.estado);
  if (sp.expira === "7") query = query.eq("status", "active").gt("expires_at", now).lte("expires_at", new Date(Date.now() + 7 * 86_400_000).toISOString());
  const { data } = await query;
  type Row = { id: string; user_id: string; status: string; starts_at: string | null; expires_at: string | null; payment_method: string | null; last_confirmed_at: string | null; plans: { name: string } | null; profiles: { email: string; full_name: string } | null };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader eyebrow="Gestão" title="Assinaturas">A expiração retira o acesso automaticamente no servidor. Não existem renovações automáticas.</PageHeader>
      <FilterBar action="/admin/assinaturas">
        <label className="text-xs text-mute">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ""} className={`${inputClass} mt-1 h-11 w-48`}>
            <option value="">Todos</option>
            {["active", "pending_payment", "expired", "suspended", "cancelled"].map((s) => <option key={s} value={s}>{SUBSCRIPTION_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex h-11 items-center gap-2 text-sm text-paper/70"><input type="checkbox" name="expira" value="7" defaultChecked={sp.expira === "7"} className="accent-[#D6B46A]" /> Expiram nos próximos 7 dias</label>
      </FilterBar>
      <Table head={["Utilizador", "Plano", "Estado", "Início", "Expira", "Método", "Última confirmação"]} empty={!rows.length}>
        {rows.map((s) => {
          const eff = s.status === "active" && s.expires_at && s.expires_at <= now ? "expired" : s.status;
          return (
            <tr key={s.id} className="hover:bg-white/[0.02]">
              <td className={td}><Link href={`/admin/utilizadores/${s.user_id}`} className="text-paper hover:text-gold-light">{s.profiles?.full_name || s.profiles?.email}</Link></td>
              <td className={td}>{s.payment_method === "manual_grant" ? "Manual" : (s.plans?.name ?? "—")}</td>
              <td className={td}><Badge tone={eff === "active" ? "ok" : eff === "pending_payment" ? "warn" : eff === "suspended" ? "danger" : "neutral"}>{SUBSCRIPTION_STATUS_LABEL[eff]}</Badge></td>
              <td className={`${td} text-mute`}>{formatDate(s.starts_at)}</td>
              <td className={`${td} text-mute`}>{formatDate(s.expires_at)}</td>
              <td className={`${td} text-mute`}>{s.payment_method === "manual_grant" ? "Concessão manual" : s.payment_method ? "Multicaixa Express" : "—"}</td>
              <td className={`${td} text-mute`}>{formatDateTime(s.last_confirmed_at)}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
