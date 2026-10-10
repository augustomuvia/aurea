import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { EVENT_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE as STATUS_TONE } from "@/lib/notifications/labels";
import { TEMPLATE_KEYS, TEMPLATES } from "@/lib/notifications/templates";
import { FilterBar, Pager, Table, td } from "@/components/admin/Table";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { inputClass } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import { NotificationTabs } from "../Tabs";

export const metadata = { title: "Histórico de e-mails" };
const PAGE = 50;

export default async function EmailHistory({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  const svc = createServiceClient();
  let q = svc
    .from("email_jobs")
    .select("id, created_at, to_email, template_key, event_type, audience, status, attempts, last_error, provider_message_id, user_id, payment_id, subscription_id, is_test, payload")
    .order("created_at", { ascending: false });
  if (sp.estado && sp.estado in JOB_STATUS_LABEL) q = q.eq("status", sp.estado);
  if (sp.modelo && (TEMPLATE_KEYS as string[]).includes(sp.modelo)) q = q.eq("template_key", sp.modelo);
  if (sp.evento && sp.evento in EVENT_LABEL) q = q.eq("event_type", sp.evento);
  if (sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de)) q = q.gte("created_at", `${sp.de}T00:00:00+01:00`);
  if (sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate)) q = q.lte("created_at", `${sp.ate}T23:59:59+01:00`);
  if (sp.para) q = q.ilike("to_email", `%${sp.para.replace(/[%_,()]/g, "").slice(0, 120)}%`);
  if (sp.pagamento && /^[0-9a-f-]{36}$/.test(sp.pagamento)) q = q.eq("payment_id", sp.pagamento);
  if (sp.utilizador && /^[0-9a-f-]{36}$/.test(sp.utilizador)) q = q.eq("user_id", sp.utilizador);
  const { data } = await q.range((page - 1) * PAGE, page * PAGE);
  const rows = data ?? [];
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "p" && v) as [string, string][]).toString();

  return (
    <>
      <PageHeader eyebrow="Notificações" title="Histórico de e-mails">
        “Enviado pelo serviço” significa que o Google aceitou a mensagem; não é uma confirmação de entrega na caixa do destinatário.
      </PageHeader>
      <NotificationTabs current="/admin/notificacoes/historico" />
      <FilterBar action="/admin/notificacoes/historico">
        <label className="text-xs text-mute">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ""} className={`${inputClass} mt-1 h-11 w-48`}>
            <option value="">Todos</option>
            {Object.entries(JOB_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs text-mute">
          Evento
          <select name="evento" defaultValue={sp.evento ?? ""} className={`${inputClass} mt-1 h-11 w-48`}>
            <option value="">Todos</option>
            {Object.entries(EVENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs text-mute">
          Tipo de mensagem
          <select name="modelo" defaultValue={sp.modelo ?? ""} className={`${inputClass} mt-1 h-11 w-52`}>
            <option value="">Todos</option>
            {TEMPLATE_KEYS.map((k) => <option key={k} value={k}>{TEMPLATES[k].name}</option>)}
          </select>
        </label>
        <label className="text-xs text-mute">
          Destinatário
          <input name="para" defaultValue={sp.para} placeholder="e-mail" className={`${inputClass} mt-1 h-11 w-52`} />
        </label>
        <label className="text-xs text-mute">
          De
          <input type="date" name="de" defaultValue={sp.de} className={`${inputClass} mt-1 h-11 w-40`} />
        </label>
        <label className="text-xs text-mute">
          Até
          <input type="date" name="ate" defaultValue={sp.ate} className={`${inputClass} mt-1 h-11 w-40`} />
        </label>
      </FilterBar>
      <Table head={["Data", "Destinatário", "Tipo", "Relacionado", "Estado", "Tentativas", "Erro / ID", ""]} empty={!rows.length}>
        {rows.slice(0, PAGE).map((j) => {
          const ref = (j.payload as { reference?: string } | null)?.reference;
          return (
            <tr key={j.id} className="hover:bg-white/[0.02]">
              <td className={`${td} whitespace-nowrap text-mute`}>{formatDateTime(j.created_at)}</td>
              <td className={td}><span className="block max-w-[14rem] truncate text-paper/80">{j.to_email}</span></td>
              <td className={td}>
                {TEMPLATES[j.template_key as keyof typeof TEMPLATES]?.name ?? (j.template_key === "verification" ? "Verificação" : j.template_key === "auth_confirm" ? "Confirmação de conta" : j.template_key)}
                {j.is_test && <span className="ml-1 text-xs text-amber-200">teste</span>}
              </td>
              <td className={`${td} text-xs`}>
                {j.payment_id ? <Link className="text-gold-light hover:underline" href={`/admin/pagamentos/${j.payment_id}`}>{ref ?? "Pagamento"}</Link> : j.user_id ? <Link className="text-gold-light hover:underline" href={`/admin/utilizadores/${j.user_id}`}>Utilizador</Link> : "—"}
              </td>
              <td className={td}><Badge tone={STATUS_TONE[j.status as keyof typeof STATUS_TONE] ?? "neutral"}>{JOB_STATUS_LABEL[j.status] ?? j.status}</Badge></td>
              <td className={`${td} tabular-nums`}>{j.attempts}</td>
              <td className={`${td} max-w-[16rem] truncate text-xs text-mute`} title={j.last_error ?? j.provider_message_id ?? ""}>{j.last_error ?? j.provider_message_id ?? "—"}</td>
              <td className={td}><Link href={`/admin/notificacoes/historico/${j.id}`} className="text-xs text-gold-light hover:underline">Detalhes</Link></td>
            </tr>
          );
        })}
      </Table>
      <Pager page={page} hasMore={rows.length > PAGE} base={`/admin/notificacoes/historico${qs ? `?${qs}` : ""}`} />
    </>
  );
}
