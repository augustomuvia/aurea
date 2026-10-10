import Link from "next/link";
import { Download } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { buildPaymentsQuery, parsePaymentFilters } from "@/lib/admin/payments-query";
import { FilterBar, Pager, Table, td } from "@/components/admin/Table";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { inputClass } from "@/components/ui/Field";
import { formatKz } from "@/lib/pricing";
import { formatDateTime, PAYMENT_STATUS_LABEL } from "@/lib/format";
import type { Payment } from "@/lib/types";

export const metadata = { title: "Pagamentos" };
const PAGE = 50;
const TONE = { pending: "warn", confirmed: "ok", rejected: "danger", cancelled: "neutral", expired: "neutral", reversed: "danger" } as const;

export default async function AdminPayments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const f = parsePaymentFilters(sp);
  const page = Math.max(1, Number(sp.p) || 1);
  const svc = createServiceClient();
  const [{ data }, { data: plans }] = await Promise.all([
    buildPaymentsQuery(svc, f).range((page - 1) * PAGE, page * PAGE),
    svc.from("plans").select("code, name").order("sort_order"),
  ]);
  const rows = (data ?? []) as Payment[];
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "p" && v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        eyebrow="Gestão comercial"
        title="Pagamentos"
        action={
          <a href={`/api/admin/export/payments?${qs}`} className="press glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-paper">
            <Download className="h-4 w-4" /> Exportar CSV
          </a>
        }
      >
        Modo provisório: confirme apenas pagamentos cuja receção verificou no extrato ou na notificação bancária.
      </PageHeader>
      <FilterBar action="/admin/pagamentos">
        <label className="text-xs text-mute">
          Estado
          <select name="estado" defaultValue={f.status ?? ""} className={`${inputClass} mt-1 h-11 w-40`}>
            <option value="">Todos</option>
            {Object.entries(PAYMENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs text-mute">
          Plano
          <select name="plano" defaultValue={f.plan ?? ""} className={`${inputClass} mt-1 h-11 w-36`}>
            <option value="">Todos</option>
            {(plans ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-mute">
          De
          <input type="date" name="de" defaultValue={f.from} className={`${inputClass} mt-1 h-11 w-40`} />
        </label>
        <label className="text-xs text-mute">
          Até
          <input type="date" name="ate" defaultValue={f.to} className={`${inputClass} mt-1 h-11 w-40`} />
        </label>
        <label className="text-xs text-mute">
          Referência ou transação
          <input name="q" defaultValue={f.q} placeholder="AUR-… ou ID" className={`${inputClass} mt-1 h-11 w-52`} />
        </label>
        {f.user && <input type="hidden" name="utilizador" value={f.user} />}
      </FilterBar>
      <Table head={["Referência", "Utilizador", "Plano", "Valor", "Estado", "Criado", "Comprovativo"]} empty={!rows.length}>
        {rows.slice(0, PAGE).map((p) => (
          <tr key={p.id} className="hover:bg-white/[0.02]">
            <td className={td}><Link href={`/admin/pagamentos/${p.id}`} className="font-medium text-gold-light hover:underline">{p.reference}</Link></td>
            <td className={td}><span className="block max-w-[14rem] truncate text-paper/80">{p.profiles?.email ?? "conta encerrada"}</span></td>
            <td className={td}>{p.plans?.name}</td>
            <td className={`${td} tabular-nums`}>{formatKz(p.amount_minor)}</td>
            <td className={td}><Badge tone={TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge></td>
            <td className={`${td} text-mute`}>{formatDateTime(p.created_at)}</td>
            <td className={`${td} text-mute`}>{p.customer_reported_transaction_id ?? "—"}</td>
          </tr>
        ))}
      </Table>
      <Pager page={page} hasMore={rows.length > PAGE} base={`/admin/pagamentos${qs ? `?${qs}` : ""}`} />
    </>
  );
}
