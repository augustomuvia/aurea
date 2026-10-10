import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatKz } from "@/lib/pricing";
import { formatDateTime, PAYMENT_STATUS_LABEL } from "@/lib/format";
import { Badge, EmptyState, PageHeader } from "@/components/ui/Glass";
import { ButtonLink } from "@/components/ui/Button";
import type { Payment } from "@/lib/types";

export const metadata: Metadata = { title: "Pagamentos" };

const TONE = { pending: "warn", confirmed: "ok", rejected: "danger", cancelled: "neutral", expired: "neutral", reversed: "danger" } as const;

export default async function PaymentsPage() {
  const user = await requireUser("/app/pagamentos");
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("*, plans(name, code, duration_months)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  const payments = (data ?? []) as Payment[];
  return (
    <>
      <PageHeader eyebrow="Faturação" title="Pagamentos">Todos os pedidos feitos por Multicaixa Express.</PageHeader>
      {payments.length ? (
        <div className="glass overflow-hidden">
          <ul className="divide-y divide-white/[0.06]">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-paper">
                    Plano {p.plans?.name} · <span className="tabular-nums">{formatKz(p.amount_minor)}</span>
                  </p>
                  <p className="text-xs text-mute">
                    {p.reference} · {formatDateTime(p.created_at)}
                    {p.confirmed_at ? ` · confirmado ${formatDateTime(p.confirmed_at)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                  {p.status === "confirmed" && (
                    <a href={`/app/pagamentos/${p.id}/recibo`} target="_blank" rel="noopener noreferrer" className="text-sm text-gold-light underline-offset-4 hover:underline">
                      Recibo (PDF)
                    </a>
                  )}
                  {p.status === "pending" && (
                    <Link href={`/checkout/estado?ref=${p.reference}`} className="text-sm text-gold-light underline-offset-4 hover:underline">
                      Ver instruções
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState icon={Receipt} title="Sem pagamentos" action={<ButtonLink href="/planos">Ver planos</ButtonLink>}>
          Quando escolher um plano, o pedido aparece aqui.
        </EmptyState>
      )}
    </>
  );
}
