import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { FilterBar, Pager, Table, td } from "@/components/admin/Table";
import { PageHeader } from "@/components/ui/Glass";
import { inputClass } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Auditoria" };
const PAGE = 100;

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ acao?: string; p?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  const acao = (sp.acao ?? "").replace(/[^a-z._]/g, "").slice(0, 60);
  let q = createServiceClient().from("admin_audit_logs").select("*").order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE);
  if (acao) q = q.ilike("action", `${acao}%`);
  const { data } = await q;
  const rows = data ?? [];
  return (
    <>
      <PageHeader eyebrow="Segurança" title="Auditoria">Registo imutável das ações administrativas sensíveis.</PageHeader>
      <FilterBar action="/admin/auditoria">
        <label className="text-xs text-mute">Ação (prefixo)<input name="acao" defaultValue={acao} placeholder="payment." className={`${inputClass} mt-1 h-11 w-56`} /></label>
      </FilterBar>
      <Table head={["Data", "Ação", "Administrador", "Alvo", "Motivo", "Detalhes"]} empty={!rows.length}>
        {rows.slice(0, PAGE).map((l) => (
          <tr key={l.id} className="align-top">
            <td className={`${td} whitespace-nowrap text-mute`}>{formatDateTime(l.created_at)}</td>
            <td className={`${td} font-medium text-paper`}>{l.action}</td>
            <td className={`${td} text-paper/75`}>{l.actor_email ?? "—"}</td>
            <td className={`${td} text-mute`}>{l.target_type}{l.target_id ? ` · ${String(l.target_id).slice(0, 12)}` : ""}</td>
            <td className={`${td} text-paper/75`}>{l.reason ?? "—"}</td>
            <td className={td}><code className="block max-w-xs truncate text-xs text-mute" title={JSON.stringify(l.details)}>{JSON.stringify(l.details)}</code></td>
          </tr>
        ))}
      </Table>
      <Pager page={page} hasMore={rows.length > PAGE} base={`/admin/auditoria?acao=${acao}`} />
    </>
  );
}
