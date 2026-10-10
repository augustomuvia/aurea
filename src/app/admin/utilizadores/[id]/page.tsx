import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, Input, Select } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatKz } from "@/lib/pricing";
import { formatDate, formatDateTime, PAYMENT_STATUS_LABEL, SUBSCRIPTION_STATUS_LABEL } from "@/lib/format";
import { grantAccessAction, revokeSessionsAction, setAccountStatusAction, setSubscriptionStatusAction, updateUserNameAction } from "../../actions";

export const metadata = { title: "Utilizador" };

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const svc = createServiceClient();
  const [{ data: u }, { data: sub }, { data: payments }, { data: periods }, { data: logs }, { data: role }] = await Promise.all([
    svc.from("profiles").select("*").eq("id", id).maybeSingle(),
    svc.from("subscriptions").select("*, plans(name)").eq("user_id", id).maybeSingle(),
    svc.from("payments").select("id, reference, amount_minor, status, created_at, plans(name)").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    svc.from("subscription_periods").select("*").eq("user_id", id).order("period_start", { ascending: false }),
    svc.from("admin_audit_logs").select("*").eq("target_id", id).order("created_at", { ascending: false }).limit(30),
    svc.from("roles").select("role").eq("user_id", id).maybeSingle(),
  ]);
  if (!u) notFound();
  const self = id === admin.id;
  const eff = sub ? (sub.status === "active" && new Date(sub.expires_at) <= new Date() ? "expired" : sub.status) : "none";
  const defaultExpiry = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <Link href="/admin/utilizadores" className="text-sm text-mute hover:text-paper">← Utilizadores</Link>
      <PageHeader eyebrow={role ? "Super admin" : "Utilizador"} title={u.full_name || u.email}>
        {u.email} · registo em {formatDate(u.created_at)}
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="glass p-6">
          <h2 className="text-sm font-medium text-paper">Estado</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={u.status === "active" ? "neutral" : "danger"}>Conta {u.status === "active" ? "ativa" : "suspensa"}</Badge>
            <Badge tone={eff === "active" ? "ok" : "neutral"}>Assinatura: {SUBSCRIPTION_STATUS_LABEL[eff]}</Badge>
          </div>
          {sub && (
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-mute">Plano</dt><dd>{sub.payment_method === "manual_grant" ? "Acesso manual" : (sub.plans?.name ?? "—")}</dd></div>
              <div><dt className="text-xs text-mute">Expira</dt><dd>{formatDateTime(sub.expires_at)}</dd></div>
              <div><dt className="text-xs text-mute">Última confirmação</dt><dd>{formatDateTime(sub.last_confirmed_at)}</dd></div>
              <div><dt className="text-xs text-mute">Transação</dt><dd className="truncate">{sub.transaction_id ?? "—"}</dd></div>
              {sub.status_reason && <div className="col-span-2"><dt className="text-xs text-mute">Nota</dt><dd>{sub.status_reason}</dd></div>}
            </dl>
          )}
          {u.status_reason && <p className="mt-4 text-sm text-mute">Motivo do estado da conta: {u.status_reason}</p>}

          <ActionForm action={updateUserNameAction} className="mt-6 flex items-end gap-3 border-t border-white/[0.07] pt-5">
            <input type="hidden" name="userId" value={id} />
            <div className="flex-1">
              <Field label="Nome" name="fullName"><Input name="fullName" defaultValue={u.full_name} maxLength={120} /></Field>
            </div>
            <SubmitButton variant="glass" size="md">Guardar</SubmitButton>
          </ActionForm>
        </section>

        <section className="glass p-6">
          <h2 className="font-serif text-2xl text-paper">Conceder acesso premium</h2>
          <p className="mt-1 text-sm text-mute">Acesso manual, sem pagamento. Motivo e expiração obrigatórios; fica registado na auditoria.</p>
          <ActionForm action={grantAccessAction} className="mt-4 space-y-4">
            <input type="hidden" name="userId" value={id} />
            <Field label="Expira em" name="expiresAt"><Input name="expiresAt" type="date" defaultValue={defaultExpiry} required /></Field>
            <Field label="Motivo" name="reason"><Input name="reason" maxLength={500} required placeholder="Ex.: parceria, compensação por falha" /></Field>
            <SubmitButton pendingLabel="A conceder…">Conceder acesso</SubmitButton>
          </ActionForm>
        </section>

        {!self && (
          <section className="glass p-6">
            <h2 className="font-serif text-2xl text-paper">Conta</h2>
            <ActionForm action={setAccountStatusAction} className="mt-4 space-y-4">
              <input type="hidden" name="userId" value={id} />
              <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
              <Field label="Motivo" name="accountReason"><Input name="reason" id="accountReason" maxLength={500} required /></Field>
              <SubmitButton variant={u.status === "active" ? "danger" : "glass"}>{u.status === "active" ? "Suspender conta" : "Reativar conta"}</SubmitButton>
            </ActionForm>
            <ActionForm action={revokeSessionsAction} className="mt-5 border-t border-white/[0.07] pt-5">
              <input type="hidden" name="userId" value={id} />
              <SubmitButton variant="glass" size="sm">Terminar todas as sessões</SubmitButton>
            </ActionForm>
          </section>
        )}

        {sub && (
          <section className="glass p-6">
            <h2 className="font-serif text-2xl text-paper">Assinatura</h2>
            <ActionForm action={setSubscriptionStatusAction} className="mt-4 space-y-4">
              <input type="hidden" name="userId" value={id} />
              <Field label="Novo estado" name="status">
                <Select name="status" defaultValue="suspended">
                  <option value="suspended">Suspender</option>
                  <option value="active">Reativar (se suspensa e dentro do período)</option>
                  <option value="cancelled">Cancelar</option>
                </Select>
              </Field>
              <Field label="Motivo" name="subReason"><Input name="reason" id="subReason" maxLength={500} required /></Field>
              <SubmitButton variant="glass">Aplicar</SubmitButton>
            </ActionForm>
          </section>
        )}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-2xl text-paper">Pagamentos</h2>
          <Link className="text-sm text-mute hover:text-paper" href={`/admin/pagamentos?utilizador=${id}`}>Ver na gestão financeira</Link>
        </div>
        <ul className="glass divide-y divide-white/[0.06] text-sm">
          {(payments ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <Link href={`/admin/pagamentos/${p.id}`} className="text-gold-light hover:underline">{p.reference}</Link>
              <span className="text-paper/75">{(p.plans as unknown as { name: string } | null)?.name} · {formatKz(p.amount_minor)}</span>
              <span className="text-mute">{PAYMENT_STATUS_LABEL[p.status]} · {formatDate(p.created_at)}</span>
            </li>
          ))}
          {!payments?.length && <li className="px-5 py-6 text-mute">Sem pagamentos.</li>}
        </ul>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-serif text-2xl text-paper">Períodos</h2>
          <ul className="glass divide-y divide-white/[0.06] text-sm">
            {(periods ?? []).map((p) => (
              <li key={p.id} className="px-5 py-3">
                <p className="text-paper/85">{formatDate(p.period_start)} → {formatDate(p.period_end)} {p.reversed_at && <Badge tone="danger">revertido</Badge>}</p>
                <p className="text-xs text-mute">{p.source === "manual_grant" ? `Manual: ${p.reason}` : "Pagamento"}</p>
              </li>
            ))}
            {!periods?.length && <li className="px-5 py-6 text-mute">Sem períodos.</li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-serif text-2xl text-paper">Ações administrativas</h2>
          <ul className="glass divide-y divide-white/[0.06] text-sm">
            {(logs ?? []).map((l) => (
              <li key={l.id} className="px-5 py-3">
                <p className="text-paper/85">{l.action}</p>
                <p className="text-xs text-mute">{formatDateTime(l.created_at)} · {l.actor_email}{l.reason ? ` · ${l.reason}` : ""}</p>
              </li>
            ))}
            {!logs?.length && <li className="px-5 py-6 text-mute">Sem registos.</li>}
          </ul>
        </div>
      </section>
    </>
  );
}
