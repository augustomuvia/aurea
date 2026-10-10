import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getSubscriptionView } from "@/lib/subscription";
import { getActivePlans } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { PlansGrid } from "@/components/plans/PlansGrid";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { ButtonLink } from "@/components/ui/Button";
import { formatDate, SUBSCRIPTION_STATUS_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "Assinatura" };

const TONE = { active: "ok", pending_payment: "warn", expired: "neutral", suspended: "danger", cancelled: "neutral", none: "neutral" } as const;

export default async function SubscriptionPage() {
  const user = await requireUser("/app/assinatura");
  const supabase = await createClient();
  const [view, plans, { data: periods }] = await Promise.all([
    getSubscriptionView(user.id),
    getActivePlans(),
    supabase.from("subscription_periods").select("id, period_start, period_end, source, reversed_at, plans(name)").eq("user_id", user.id).order("period_start", { ascending: false }).limit(20),
  ]);
  const sub = view.sub;
  return (
    <>
      <PageHeader eyebrow="A sua assinatura" title="Assinatura" />
      <div className="glass glass-sheen mb-12 grid gap-6 p-6 sm:grid-cols-4 sm:p-8 animate-rise">
        <Item label="Estado">
          <Badge tone={TONE[view.effective]}>{SUBSCRIPTION_STATUS_LABEL[view.effective]}</Badge>
        </Item>
        <Item label="Plano">{sub?.payment_method === "manual_grant" ? "Acesso concedido" : (sub?.plans?.name ?? "—")}</Item>
        <Item label={view.hasAccess ? "Válida até" : "Expirou em"}>{sub?.expires_at ? formatDate(sub.expires_at) : "—"}</Item>
        <Item label="Dias restantes">{view.daysLeft ?? "—"}</Item>
        {sub?.status_reason && view.effective !== "active" && <p className="text-sm text-mute sm:col-span-4">{sub.status_reason}</p>}
        {view.effective === "pending_payment" && (
          <div className="sm:col-span-4">
            <ButtonLink href="/app/pagamentos" variant="glass" size="sm">Ver pagamento pendente</ButtonLink>
          </div>
        )}
      </div>

      <h2 className="mb-6 font-serif text-3xl text-paper">{view.hasAccess ? "Renovar ou mudar de plano" : "Escolher um plano"}</h2>
      <p className="-mt-3 mb-8 max-w-xl text-sm text-mute">A renovação é sempre manual. Se renovar antes do fim, o novo período soma-se ao atual.</p>
      <PlansGrid plans={plans} currentPlanCode={view.hasAccess ? sub?.plans?.code : null} />

      {periods && periods.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 font-serif text-2xl text-paper">Histórico de renovações</h2>
          <ul className="glass divide-y divide-white/[0.06]">
            {(periods as unknown as { id: string; period_start: string; period_end: string; source: string; reversed_at: string | null; plans: { name: string } | null }[]).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm">
                <span className="text-paper/85">{p.source === "manual_grant" ? "Acesso concedido" : `Plano ${p.plans?.name ?? ""}`}</span>
                <span className="text-mute">
                  {formatDate(p.period_start)} → {formatDate(p.period_end)} {p.reversed_at && <Badge tone="danger">Revertido</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.72rem] uppercase tracking-[0.18em] text-mute">{label}</p>
      <div className="mt-2 text-lg text-paper">{children}</div>
    </div>
  );
}
