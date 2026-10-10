import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { ActionForm } from "@/components/admin/ActionForm";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatKz } from "@/lib/pricing";
import { formatDateTime, PAYMENT_STATUS_LABEL } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { FileText, ExternalLink } from "lucide-react";
import { formatBytes, PROOF_BUCKET } from "@/lib/payments/proof";
import { confirmPaymentAction, rejectPaymentAction, reversePaymentAction } from "../../actions";

export const metadata = { title: "Pagamento" };

export default async function AdminPaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const svc = createServiceClient();
  const [{ data }, { data: events }] = await Promise.all([
    svc.from("payments").select("*, plans(name, code, duration_months), profiles!payments_user_id_fkey(email, full_name)").eq("id", id).maybeSingle(),
    svc.from("payment_events").select("*").eq("payment_id", id).order("created_at"),
  ]);
  const p = data as (Payment & { confirmed_by: string | null }) | null;
  if (!p) notFound();
  // Link temporário (10 min) para o ficheiro no bucket privado; nunca é público.
  const proofUrl = p.proof_path ? (await svc.storage.from(PROOF_BUCKET).createSignedUrl(p.proof_path, 600)).data?.signedUrl ?? null : null;
  const proofIsPdf = p.proof_mime === "application/pdf";

  return (
    <>
      <Link href="/admin/pagamentos" className="text-sm text-mute hover:text-paper">← Pagamentos</Link>
      <PageHeader eyebrow="Pagamento" title={p.reference} action={<Badge tone={p.status === "confirmed" ? "ok" : p.status === "pending" ? "warn" : "danger"}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <section className="glass p-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Dt label="Utilizador">
              {p.user_id ? <Link className="text-gold-light hover:underline" href={`/admin/utilizadores/${p.user_id}`}>{p.profiles?.email}</Link> : "conta encerrada"}
            </Dt>
            <Dt label="Plano">{p.plans?.name} ({p.plans?.duration_months} m)</Dt>
            <Dt label="Valor esperado"><span className="tabular-nums">{formatKz(p.amount_minor)}</span></Dt>
            <Dt label="Método">Multicaixa Express</Dt>
            <Dt label="Criado">{formatDateTime(p.created_at)}</Dt>
            <Dt label="Confirmado">{formatDateTime(p.confirmed_at)}</Dt>
            <Dt label="Transação indicada pelo cliente">{p.customer_reported_transaction_id ?? "—"}</Dt>
            <Dt label="Indicado em">{formatDateTime(p.customer_reported_at)}</Dt>
            <Dt label="Transação confirmada">{p.provider_transaction_id ?? "—"}</Dt>
            <Dt label="Origem">{p.provider === "partner" ? "Parceiro (webhook)" : "Verificação manual"}</Dt>
          </dl>
          <div className="mt-6 border-t border-white/[0.07] pt-5">
            <h2 className="text-[0.7rem] uppercase tracking-[0.14em] text-mute">Comprovativo enviado pelo cliente</h2>
            {!p.proof_path ? (
              <p className="mt-2 text-sm text-mute">O cliente ainda não enviou comprovativo.</p>
            ) : !proofUrl ? (
              <p className="mt-2 text-sm text-danger">Não foi possível abrir o ficheiro. Verifique o bucket “{PROOF_BUCKET}” no Supabase Storage.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {!proofIsPdf && (
                  <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL assinado e temporário do Storage privado */}
                    <img src={proofUrl} alt={`Comprovativo do pedido ${p.reference}`} className="max-h-[28rem] w-full object-contain" />
                  </a>
                )}
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-paper"
                >
                  {proofIsPdf ? <FileText className="h-4 w-4 text-gold" /> : <ExternalLink className="h-4 w-4 text-gold" />}
                  {proofIsPdf ? "Abrir PDF do comprovativo" : "Abrir imagem em tamanho real"}
                </a>
                <p className="text-xs text-mute">
                  {proofIsPdf ? "PDF" : p.proof_mime === "image/png" ? "PNG" : "JPG"}
                  {p.proof_size ? ` · ${formatBytes(p.proof_size)}` : ""} · enviado em {formatDateTime(p.proof_uploaded_at)} · o link expira em 10 minutos.
                </p>
                <p className="text-xs text-amber-100/80">Um comprovativo pode ser falsificado: confirme sempre a receção do valor no extrato Multicaixa Express antes de ativar.</p>
              </div>
            )}
          </div>
          {p.customer_note && <p className="mt-5 rounded-xl bg-white/[0.03] p-3 text-sm text-paper/75">Nota do cliente: {p.customer_note}</p>}
          {p.verification_evidence && <p className="mt-3 text-sm text-mute">Evidência: {p.verification_evidence}</p>}
          {p.rejected_reason && <p className="mt-3 text-sm text-danger">Motivo: {p.rejected_reason}</p>}
        </section>

        <div className="space-y-5">
          {p.status === "pending" && (
            <>
              <section className="glass p-6">
                <h2 className="font-serif text-2xl text-paper">Confirmar pagamento</h2>
                <p className="mt-1 text-sm text-mute">Só confirme depois de verificar a receção de {formatKz(p.amount_minor)} na conta Multicaixa Express. A ação fica registada na auditoria.</p>
                <ActionForm action={confirmPaymentAction} className="mt-5 space-y-4">
                  <input type="hidden" name="paymentId" value={p.id} />
                  <Field label="Identificador da transação verificado" name="transactionId">
                    <Input name="transactionId" defaultValue={p.customer_reported_transaction_id ?? ""} maxLength={64} required />
                  </Field>
                  <Field label="Evidência verificada" name="evidence" hint="Ex.: “Recebido no extrato MCX em 10/10 às 14:32, de 923 xxx xxx, descrição AUR-…”.">
                    <Textarea name="evidence" rows={3} maxLength={1000} required />
                  </Field>
                  <Checkbox name="confirmReceived" label={`Confirmo que verifiquei a receção de ${formatKz(p.amount_minor)}.`} />
                  <SubmitButton pendingLabel="A confirmar…">Confirmar e ativar assinatura</SubmitButton>
                </ActionForm>
              </section>
              <section className="glass p-6">
                <h2 className="font-serif text-2xl text-paper">Rejeitar</h2>
                <ActionForm action={rejectPaymentAction} className="mt-4 space-y-4">
                  <input type="hidden" name="paymentId" value={p.id} />
                  <Field label="Motivo (visível para o cliente)" name="reason">
                    <Input name="reason" maxLength={500} required />
                  </Field>
                  <SubmitButton variant="danger" pendingLabel="A rejeitar…">Rejeitar pagamento</SubmitButton>
                </ActionForm>
              </section>
            </>
          )}
          {p.status === "confirmed" && (
            <section className="glass p-6">
              <h2 className="font-serif text-2xl text-paper">Recibo de pagamento</h2>
              <p className="mt-1 text-sm text-mute">PDF gerado no momento, igual ao que o cliente recebe em anexo. Comprovativo de pagamento; não substitui fatura fiscal.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href={`/admin/pagamentos/${p.id}/recibo`} target="_blank" rel="noopener noreferrer" className="press glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-paper">
                  <FileText className="h-4 w-4 text-gold" /> Ver recibo
                </a>
                <a href={`/admin/pagamentos/${p.id}/recibo?download=1`} className="press glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-paper">
                  Descarregar PDF
                </a>
                <Link href={`/admin/notificacoes/historico?pagamento=${p.id}`} className="inline-flex h-10 items-center text-sm text-gold-light hover:underline">
                  E-mails deste pagamento
                </Link>
              </div>
            </section>
          )}
          {p.status === "confirmed" && (
            <section className="glass p-6">
              <h2 className="font-serif text-2xl text-paper">Correção (reversão)</h2>
              <p className="mt-1 text-sm text-mute">Para estornos ou confirmações feitas por engano. O histórico é mantido e o período concedido é removido.</p>
              <ActionForm action={reversePaymentAction} className="mt-4 space-y-4">
                <input type="hidden" name="paymentId" value={p.id} />
                <Field label="Motivo da correção" name="reason">
                  <Textarea name="reason" rows={2} maxLength={500} required />
                </Field>
                <Field label='Escreva "REVERTER" para confirmar' name="confirmReverse">
                  <Input name="confirmReverse" autoComplete="off" />
                </Field>
                <SubmitButton variant="danger" pendingLabel="A reverter…">Reverter pagamento</SubmitButton>
              </ActionForm>
            </section>
          )}
          <section className="glass p-6">
            <h2 className="text-sm font-medium text-paper">Histórico do pedido</h2>
            <ol className="mt-4 space-y-3 border-l border-white/10 pl-4 text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id}>
                  <p className="text-paper/85">{e.type} <span className="text-mute">· {e.source}</span></p>
                  <p className="text-xs text-mute">{formatDateTime(e.created_at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

function Dt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mute">{label}</dt>
      <dd className="mt-1 text-paper/90">{children}</dd>
    </div>
  );
}
