import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/Glass";
import { ActionForm } from "@/components/admin/ActionForm";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { basePlan, computeSavings, formatKz } from "@/lib/pricing";
import type { Plan } from "@/lib/types";
import { updatePlanAction } from "../actions";

export const metadata = { title: "Planos" };

export default async function AdminPlans() {
  await requireSuperAdmin();
  const { data } = await createServiceClient().from("plans").select("*").order("sort_order");
  const plans = (data ?? []).map((p) => ({ ...p, amount_minor: Number(p.amount_minor) })) as Plan[];
  const base = basePlan(plans.filter((p) => p.is_active));
  return (
    <>
      <PageHeader eyebrow="Comercial" title="Planos">
        Alterações de preço aplicam-se apenas a novos pedidos e ficam registadas na auditoria. A poupança é recalculada automaticamente.
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const s = base ? computeSavings(p, base) : null;
          return (
            <section key={p.id} className="glass p-6">
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-mute">{p.code} · {p.duration_months} {p.duration_months === 1 ? "mês" : "meses"}</p>
              <p className="mt-2 font-serif text-3xl text-paper">{formatKz(p.amount_minor)}</p>
              <p className="mt-1 h-5 text-xs text-gold-light">{s ? `Poupança ${formatKz(s.savingsMinor)} (${s.savingsPercent}%)` : ""}</p>
              <ActionForm action={updatePlanAction} className="mt-5 space-y-4">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Nome" name={`name-${p.id}`}><Input name="name" id={`name-${p.id}`} defaultValue={p.name} maxLength={60} /></Field>
                <Field label="Preço (Kz, inteiro)" name={`price-${p.id}`}><Input name="priceKz" id={`price-${p.id}`} type="number" min={100} step={1} defaultValue={p.amount_minor / 100} /></Field>
                <Field label="Descrição" name={`desc-${p.id}`}><Input name="description" id={`desc-${p.id}`} defaultValue={p.description} maxLength={300} /></Field>
                <Field label="Características (uma por linha)" name={`feat-${p.id}`}><Textarea name="features" id={`feat-${p.id}`} rows={6} defaultValue={p.features.join("\n")} /></Field>
                <Field label="Link de checkout Kursinha (opcional)" name={`checkout-${p.id}`} hint="Com link, o botão do plano abre a Kursinha e o acesso é ativado sozinho. Vazio: Multicaixa Express com verificação manual.">
                  <Input name="checkoutUrl" id={`checkout-${p.id}`} type="url" placeholder="https://app.kursinha.com/…" defaultValue={p.checkout_url ?? ""} />
                </Field>
                <Checkbox name="isActive" defaultChecked={p.is_active} label="Plano ativo" />
                <Checkbox name="isHighlighted" defaultChecked={p.is_highlighted} label="Destacar como melhor valor" />
                <Checkbox name="includesOwnAudio" defaultChecked={Boolean(p.includes_own_audio)} label="Inclui áudios AUREA (ecrã bloqueado e offline)" />
                <SubmitButton variant="glass" className="w-full">Guardar</SubmitButton>
              </ActionForm>
            </section>
          );
        })}
      </div>
    </>
  );
}
