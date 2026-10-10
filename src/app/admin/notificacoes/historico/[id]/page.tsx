import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { EVENT_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE as STATUS_TONE } from "@/lib/notifications/labels";
import { TEMPLATES } from "@/lib/notifications/templates";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { ActionForm } from "@/components/admin/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Table, td } from "@/components/admin/Table";
import { formatDateTime } from "@/lib/format";
import { NotificationTabs } from "../../Tabs";
import { requeueEmailAction } from "../../actions";

export const metadata = { title: "Detalhes do e-mail" };

export default async function EmailJobDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const svc = createServiceClient();
  const [{ data: job }, { data: logs }] = await Promise.all([
    svc.from("email_jobs").select("*").eq("id", id).maybeSingle(),
    svc.from("email_logs").select("*").eq("job_id", id).order("created_at"),
  ]);
  if (!job) notFound();
  const name = TEMPLATES[job.template_key as keyof typeof TEMPLATES]?.name ?? job.template_key;
  const p = job.payload as Record<string, unknown>;
  // Dados autorizados: sem tokens, sem conteúdo integral do e-mail.
  const rows: [string, React.ReactNode][] = [
    ["Estado", <Badge key="s" tone={STATUS_TONE[job.status as keyof typeof STATUS_TONE] ?? "neutral"}>{JOB_STATUS_LABEL[job.status] ?? job.status}</Badge>],
    ["Destinatário", job.to_email],
    ["Público", job.audience === "admin" ? "Administração" : "Cliente"],
    ["Evento", EVENT_LABEL[job.event_type] ?? job.event_type],
    ["Criado", formatDateTime(job.created_at)],
    ["Tentativas", `${job.attempts} de ${job.max_attempts}`],
    ["Próxima tentativa", job.status === "retry_scheduled" || job.status === "queued" ? formatDateTime(job.next_attempt_at) : "—"],
    ["Concluído", formatDateTime(job.completed_at)],
    ["Fornecedor", job.provider ?? "—"],
    ["ID da mensagem (fornecedor)", job.provider_message_id ?? "—"],
    ["Último erro", job.last_error ?? "—"],
    ["Chave idempotente", <code key="k" className="break-all text-xs">{job.idempotency_key}</code>],
    ["Pagamento", job.payment_id ? <Link key="p" className="text-gold-light hover:underline" href={`/admin/pagamentos/${job.payment_id}`}>{String(p.reference ?? job.payment_id)}</Link> : "—"],
    ["Utilizador", job.user_id ? <Link key="u" className="text-gold-light hover:underline" href={`/admin/utilizadores/${job.user_id}`}>{job.user_id}</Link> : "—"],
    ["Assinatura", job.subscription_id ?? "—"],
    ["Expiração de referência", p.expires_at ? formatDateTime(String(p.expires_at)) : "—"],
  ];
  return (
    <>
      <PageHeader eyebrow="Histórico de e-mails" title={name} />
      <NotificationTabs current="/admin/notificacoes/historico" />
      <p className="mb-6 text-sm"><Link href="/admin/notificacoes/historico" className="text-paper/60 hover:text-paper">← Histórico</Link></p>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <dl className="glass divide-y divide-white/[0.06]">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[11rem_1fr] gap-3 px-5 py-3 text-sm">
              <dt className="text-mute">{k}</dt>
              <dd className="min-w-0 break-words text-paper/85">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-5">
          {job.status === "failed" && !job.is_test && job.template_key !== "auth_confirm" && (
            <section className="glass p-6">
              <h2 className="font-medium text-paper">Voltar a tentar</h2>
              <p className="mt-1 text-sm text-mute">Use depois de corrigir a causa (credenciais, remetente, endereço). O e-mail volta à fila com mais 3 tentativas.</p>
              <ActionForm action={requeueEmailAction} className="mt-4 space-y-3">
                <input type="hidden" name="id" value={job.id} />
                <SubmitButton variant="glass" pendingLabel="A colocar na fila…">Colocar novamente na fila</SubmitButton>
              </ActionForm>
            </section>
          )}
        </div>
      </div>
      <h2 className="mb-4 mt-8 font-serif text-2xl text-paper">Tentativas</h2>
      <Table head={["Data", "Tentativa", "Resultado", "Duração", "ID / erro"]} empty={!logs?.length}>
        {(logs ?? []).map((l) => (
          <tr key={l.id}>
            <td className={`${td} whitespace-nowrap text-mute`}>{formatDateTime(l.created_at)}</td>
            <td className={`${td} tabular-nums`}>{l.attempt}</td>
            <td className={td}>{l.status === "requeued" ? "Colocado na fila pelo admin" : (JOB_STATUS_LABEL[l.status] ?? l.status)}</td>
            <td className={`${td} tabular-nums text-mute`}>{l.duration_ms != null ? `${l.duration_ms} ms` : "—"}</td>
            <td className={`${td} max-w-md break-words text-xs text-mute`}>{l.error ?? l.provider_message_id ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
