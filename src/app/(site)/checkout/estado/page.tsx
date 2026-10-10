import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { formatKz } from "@/lib/pricing";
import { formatDateTime, PAYMENT_STATUS_LABEL } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import { ReportForm } from "./ReportForm";
import { AutoRefresh } from "./AutoRefresh";
import { CopyButton } from "./CopyButton";
import { cancelOrderAction } from "../actions";

export const metadata: Metadata = { title: "Estado do pagamento" };

export default async function PaymentStatusPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref = "" } = await searchParams;
  const user = await requireUser(`/checkout/estado?ref=${encodeURIComponent(ref)}`);
  if (!/^AUR-[A-Z0-9]{8}$/.test(ref)) notFound();
  const supabase = await createClient();
  // RLS garante que só o próprio utilizador vê o seu pedido.
  const { data } = await supabase.from("payments").select("*, plans(name, code, duration_months)").eq("reference", ref).eq("user_id", user.id).maybeSingle();
  const payment = data as Payment | null;
  if (!payment) notFound();
  const s = await getSettings();
  const pending = payment.status === "pending";
  const Icon = payment.status === "confirmed" ? CheckCircle2 : pending ? Clock : XCircle;

  return (
    <section className="mx-auto max-w-2xl px-4 pb-16 pt-32 sm:px-6">
      {pending && <AutoRefresh seconds={20} />}
      <div className="text-center animate-rise">
        <Icon className={`mx-auto h-10 w-10 ${payment.status === "confirmed" ? "text-ok" : pending ? "text-gold" : "text-danger"}`} strokeWidth={1.4} />
        <h1 className="mt-4 font-serif text-4xl text-paper">
          {payment.status === "confirmed" ? "Pagamento confirmado" : pending ? "A aguardar pagamento" : `Pedido ${PAYMENT_STATUS_LABEL[payment.status].toLowerCase()}`}
        </h1>
        <p className="mt-2 text-sm text-mute" aria-live="polite">
          Plano {payment.plans?.name} · {formatKz(payment.amount_minor)} · criado em {formatDateTime(payment.created_at)}
        </p>
      </div>

      {payment.status === "confirmed" && (
        <div className="mt-8 text-center">
          <ButtonLink href="/app/biblioteca">Ir para a biblioteca</ButtonLink>
        </div>
      )}

      {payment.status === "rejected" && payment.rejected_reason && (
        <p className="glass mt-8 p-5 text-sm text-paper/80">Motivo: {payment.rejected_reason}</p>
      )}

      {pending && (
        <>
          <div className="glass glass-sheen mt-8 p-6 sm:p-8 animate-rise">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-gold" />
              <p className="font-medium text-paper">Pagar com Multicaixa Express</p>
            </div>
            <dl className="mt-6 grid gap-4 text-sm">
              <Row label="Referência AUREA" value={payment.reference} copy />
              <Row label="Valor exato" value={formatKz(payment.amount_minor)} />
              {s.payment.mcx_recipient_phone ? (
                <>
                  <Row label="Destinatário (número Multicaixa Express)" value={s.payment.mcx_recipient_phone} copy />
                  {s.payment.mcx_recipient_name && <Row label="Titular" value={s.payment.mcx_recipient_name} />}
                </>
              ) : (
                <p className="rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3 text-amber-100">Os dados de pagamento ainda não foram configurados. Contacte o suporte.</p>
              )}
            </dl>
            <ol className="mt-6 list-decimal space-y-2 border-t border-white/[0.07] pt-6 pl-5 text-sm leading-relaxed text-paper/75">
              <li>Abra a aplicação Multicaixa Express.</li>
              <li>Envie exatamente {formatKz(payment.amount_minor)} para o número indicado.</li>
              <li>Na descrição/mensagem, escreva a referência <strong className="text-paper">{payment.reference}</strong>.</li>
              <li>Guarde o comprovativo e indique abaixo o identificador da transação.</li>
            </ol>
            {s.payment.instructions && <p className="mt-4 whitespace-pre-line text-sm text-mute">{s.payment.instructions}</p>}
          </div>

          <div className="glass mt-5 p-6 sm:p-8">
            {payment.customer_reported_at ? (
              <p className="text-sm text-paper/80">
                Recebemos o identificador <strong className="text-paper">{payment.customer_reported_transaction_id}</strong> em {formatDateTime(payment.customer_reported_at)}. A verificação está em curso e esta página atualiza
                automaticamente.
              </p>
            ) : (
              <ReportForm reference={payment.reference} />
            )}
            <p className="mt-4 text-xs leading-relaxed text-mute">
              Modo de verificação manual: o acesso é ativado apenas quando a equipa AUREA confirmar a receção do valor. Indicar os dados do comprovativo não ativa a assinatura por si só.
            </p>
          </div>

          <form action={cancelOrderAction} className="mt-6 text-center">
            <input type="hidden" name="reference" value={payment.reference} />
            <button className="press text-sm text-paper/55 underline-offset-4 hover:text-paper hover:underline">Cancelar este pedido</button>
          </form>
        </>
      )}

      <p className="mt-10 text-center text-sm text-mute">
        <Link href="/app/pagamentos" className="underline-offset-4 hover:text-paper hover:underline">Ver todos os pagamentos</Link>
      </p>
    </section>
  );
}

function Row({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-mute">{label}</dt>
      <dd className="flex items-center gap-2 font-medium tabular-nums text-paper">
        {value}
        {copy && <CopyButton value={value} />}
      </dd>
    </div>
  );
}
