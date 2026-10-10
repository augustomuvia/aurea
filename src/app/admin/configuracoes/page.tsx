import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { ActionForm } from "@/components/admin/ActionForm";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatDateTime } from "@/lib/format";
import { serverEnv } from "@/lib/env";
import { saveCategoryAction, setSupportStatusAction, updateSettingsAction } from "../actions";

export const metadata = { title: "Configurações" };

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="glass p-6">
      <h2 className="font-serif text-2xl text-paper">{title}</h2>
      {description && <p className="mt-1 text-sm text-mute">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function AdminSettings() {
  await requireSuperAdmin();
  const s = await getSettings();
  const svc = createServiceClient();
  const [{ data: categories }, { data: support }] = await Promise.all([
    svc.from("categories").select("*").order("sort_order"),
    svc.from("support_requests").select("*").order("created_at", { ascending: false }).limit(30),
  ]);
  const id = (k: string, f: string) => `${k}-${f}`;

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Configurações" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Pagamentos · Multicaixa Express" description="Modo provisório de verificação manual. Os clientes pagam para este número e o admin confirma com evidência.">
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone="warn">Modo: verificação manual</Badge>
            <Badge tone={serverEnv.paymentMode === "partner" ? "ok" : "neutral"}>Integração parceiro: {serverEnv.paymentMode === "partner" ? "ativa" : "não configurada"}</Badge>
          </div>
          <ActionForm action={updateSettingsAction}>
            <input type="hidden" name="key" value="payment" />
            <Field label="Número Multicaixa Express do destinatário" name={id("payment", "phone")}>
              <Input name="mcx_recipient_phone" id={id("payment", "phone")} defaultValue={s.payment.mcx_recipient_phone ?? ""} placeholder="+244 9xx xxx xxx" />
            </Field>
            <Field label="Titular" name={id("payment", "name")}>
              <Input name="mcx_recipient_name" id={id("payment", "name")} defaultValue={s.payment.mcx_recipient_name ?? ""} />
            </Field>
            <Field label="Instruções adicionais" name={id("payment", "instr")}>
              <Textarea name="instructions" id={id("payment", "instr")} rows={3} defaultValue={s.payment.instructions ?? ""} />
            </Field>
            <SubmitButton variant="glass">Guardar</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Marca">
          <ActionForm action={updateSettingsAction}>
            <input type="hidden" name="key" value="brand" />
            <Field label="Nome da plataforma" name={id("brand", "name")}><Input name="name" id={id("brand", "name")} defaultValue={s.brand.name} /></Field>
            <Field label="Slogan" name={id("brand", "slogan")}><Input name="slogan" id={id("brand", "slogan")} defaultValue={s.brand.slogan} /></Field>
            <Field label="URL do logótipo (https, opcional)" name={id("brand", "logo")}><Input name="logo_url" id={id("brand", "logo")} defaultValue={s.brand.logo_url ?? ""} /></Field>
            <SubmitButton variant="glass">Guardar</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Contactos de suporte">
          <ActionForm action={updateSettingsAction}>
            <input type="hidden" name="key" value="support" />
            <Field label="E-mail" name={id("support", "email")}><Input name="email" id={id("support", "email")} type="email" defaultValue={s.support.email ?? ""} /></Field>
            <Field label="Telefone" name={id("support", "phone")}><Input name="phone" id={id("support", "phone")} defaultValue={s.support.phone ?? ""} /></Field>
            <Field label="WhatsApp" name={id("support", "wa")}><Input name="whatsapp" id={id("support", "wa")} defaultValue={s.support.whatsapp ?? ""} /></Field>
            <Field label="Horário" name={id("support", "hours")}><Input name="hours" id={id("support", "hours")} defaultValue={s.support.hours ?? ""} placeholder="Seg–Sex, 9h–18h" /></Field>
            <SubmitButton variant="glass">Guardar</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Avisos e manutenção">
          <ActionForm action={updateSettingsAction}>
            <input type="hidden" name="key" value="announcement" />
            <Checkbox name="active" defaultChecked={s.announcement.active} label="Mostrar aviso no topo" />
            <Field label="Mensagem" name={id("ann", "msg")}><Input name="message" id={id("ann", "msg")} defaultValue={s.announcement.message} maxLength={200} /></Field>
            <SubmitButton variant="glass">Guardar aviso</SubmitButton>
          </ActionForm>
          <ActionForm action={updateSettingsAction} className="mt-6 space-y-4 border-t border-white/[0.07] pt-6">
            <input type="hidden" name="key" value="maintenance" />
            <Checkbox name="enabled" defaultChecked={s.maintenance.enabled} label="Modo de manutenção (só o super admin acede)" />
            <Field label="Mensagem" name={id("mnt", "msg")}><Input name="message" id={id("mnt", "msg")} defaultValue={s.maintenance.message} maxLength={300} /></Field>
            <SubmitButton variant="glass">Guardar manutenção</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="E-mail" description="A chave do serviço de e-mail é configurada como variável de ambiente (RESEND_API_KEY), nunca aqui.">
          <div className="mb-4"><Badge tone={serverEnv.resendApiKey ? "ok" : "neutral"}>{serverEnv.resendApiKey ? "Serviço configurado" : "Serviço não configurado"}</Badge></div>
          <ActionForm action={updateSettingsAction}>
            <input type="hidden" name="key" value="email" />
            <Field label="Nome do remetente" name={id("email", "name")}><Input name="from_name" id={id("email", "name")} defaultValue={s.email.from_name} /></Field>
            <Field label="E-mail de resposta" name={id("email", "from")}><Input name="from_email" id={id("email", "from")} type="email" defaultValue={s.email.from_email ?? ""} /></Field>
            <Checkbox name="send_payment_emails" defaultChecked={s.email.send_payment_emails} label="Enviar e-mail quando um pagamento é confirmado" />
            <SubmitButton variant="glass">Guardar</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Informação legal" description="Usada nos termos, na privacidade e no rodapé.">
          <ActionForm action={updateSettingsAction}>
            <input type="hidden" name="key" value="legal" />
            <Field label="Entidade" name={id("legal", "co")}><Input name="company_name" id={id("legal", "co")} defaultValue={s.legal.company_name ?? ""} /></Field>
            <Field label="NIF" name={id("legal", "nif")}><Input name="nif" id={id("legal", "nif")} defaultValue={s.legal.nif ?? ""} /></Field>
            <Field label="Morada" name={id("legal", "addr")}><Input name="address" id={id("legal", "addr")} defaultValue={s.legal.address ?? ""} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Termos atualizados" name={id("legal", "t")}><Input name="terms_updated_at" id={id("legal", "t")} type="date" defaultValue={s.legal.terms_updated_at} /></Field>
              <Field label="Privacidade atualizada" name={id("legal", "p")}><Input name="privacy_updated_at" id={id("legal", "p")} type="date" defaultValue={s.legal.privacy_updated_at} /></Field>
            </div>
            <SubmitButton variant="glass">Guardar</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 font-serif text-3xl text-paper">Categorias</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {[...(categories ?? []), null].map((c) => (
            <div key={c?.id ?? "new"} className="glass p-5">
              <ActionForm action={saveCategoryAction} className="grid grid-cols-2 gap-3">
                <input type="hidden" name="id" value={c?.id ?? ""} />
                <div className="col-span-2 text-xs uppercase tracking-[0.16em] text-mute">{c ? c.slug : "Nova categoria"}</div>
                <Field label="Nome" name={`cn-${c?.id ?? "new"}`}><Input name="name" id={`cn-${c?.id ?? "new"}`} defaultValue={c?.name ?? ""} /></Field>
                <Field label="Tipo" name={`ck-${c?.id ?? "new"}`}>
                  <Select name="kind" id={`ck-${c?.id ?? "new"}`} defaultValue={c?.kind ?? "purpose"}>
                    <option value="purpose">Finalidade</option>
                    <option value="ambient">Ambiente</option>
                    <option value="frequency">Frequência</option>
                  </Select>
                </Field>
                <div className="col-span-2"><Field label="Descrição" name={`cd-${c?.id ?? "new"}`}><Input name="description" id={`cd-${c?.id ?? "new"}`} defaultValue={c?.description ?? ""} maxLength={200} /></Field></div>
                <Field label="Ordem" name={`co-${c?.id ?? "new"}`}><Input name="sortOrder" id={`co-${c?.id ?? "new"}`} type="number" defaultValue={c?.sort_order ?? 0} /></Field>
                <div className="flex items-end pb-3"><Checkbox name="isVisible" defaultChecked={c?.is_visible ?? true} label="Visível" /></div>
                <div className="col-span-2"><SubmitButton variant="glass" size="sm">{c ? "Guardar" : "Criar categoria"}</SubmitButton></div>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 font-serif text-3xl text-paper">Pedidos de suporte</h2>
        <ul className="glass divide-y divide-white/[0.06]">
          {(support ?? []).map((r) => (
            <li key={r.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-paper">{r.subject}</p>
                <Badge tone={r.status === "open" ? "warn" : "neutral"}>{r.status === "open" ? "Aberto" : r.status === "answered" ? "Respondido" : "Fechado"}</Badge>
              </div>
              <p className="mt-1 text-xs text-mute">
                {r.name} · <a className="hover:text-paper" href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject}`)}`}>{r.email}</a> · {formatDateTime(r.created_at)}
              </p>
              <p className="mt-3 whitespace-pre-line text-sm text-paper/75">{r.message}</p>
              <div className="mt-3 flex gap-3">
                {(["answered", "closed"] as const).filter((st) => st !== r.status).map((st) => (
                  <form key={st} action={setSupportStatusAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={st} />
                    <button className="text-xs text-gold-light hover:underline">Marcar como {st === "answered" ? "respondido" : "fechado"}</button>
                  </form>
                ))}
              </div>
            </li>
          ))}
          {!support?.length && <li className="p-6 text-sm text-mute">Sem pedidos.</li>}
        </ul>
      </section>
    </>
  );
}
