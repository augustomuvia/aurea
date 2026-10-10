import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { getIntegration } from "@/lib/notifications/server";
import { TEMPLATES } from "@/lib/notifications/templates";
import { Badge, PageHeader, StatTile } from "@/components/ui/Glass";
import { ActionForm } from "@/components/admin/ActionForm";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatDateTime } from "@/lib/format";
import { NotificationTabs } from "./Tabs";
import { confirmVerificationAction, markAdminNotificationsReadAction, runNowAction, saveNotificationSettingsAction, sendVerificationAction } from "./actions";

export const metadata = { title: "Notificações" };

const FLAG_LABELS: [flag: string, label: string, essential: boolean][] = [
  ["welcome", "Boas-vindas (após confirmação do e-mail)", false],
  ["payment_requested", "Pedido de pagamento (cliente)", true],
  ["payment_under_review", "Pagamento pendente de validação (cliente)", true],
  ["plan_activated", "Plano ativado (cliente)", true],
  ["admin_payment_requested", "Novo pedido pendente (administração)", false],
  ["admin_payment_confirmed", "Pagamento confirmado (administração)", true],
  ["expiring", "Avisos de expiração: 10, 5, 3 e 1 dia", true],
  ["expired", "Plano expirado (opcional, e-mail e notificação)", false],
];

const SEVERITY = { info: "neutral", success: "ok", warning: "warn", error: "danger" } as const;

function Card({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass p-6">
      <h2 className="font-serif text-2xl text-paper">{title}</h2>
      {description && <p className="mt-1 text-sm text-mute">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function NotificationsAdmin() {
  const admin = await requireSuperAdmin();
  const svc = createServiceClient();
  const { settings: s, state, provider, status } = await getIntegration(svc);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: runs }, { data: scans }, { data: alerts }, queued, retrying, failed] = await Promise.all([
    svc.from("notification_schedule_logs").select("*").order("started_at", { ascending: false }).limit(1),
    svc.from("notification_schedule_logs").select("*").contains("details", { scanned: true }).order("started_at", { ascending: false }).limit(1),
    svc.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(20),
    svc.from("email_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
    svc.from("email_jobs").select("id", { count: "exact", head: true }).eq("status", "retry_scheduled"),
    svc.from("email_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
  ]);
  const run = runs?.[0];
  const scan = scans?.[0];
  const reminders = (scan?.details as { reminders?: { eligible: number; created: number } } | undefined)?.reminders;
  const statusTone = status.code === "active" ? "ok" : status.code === "pending_verification" ? "warn" : "neutral";
  const unread = (alerts ?? []).filter((a) => !a.read_at).length;

  return (
    <>
      <PageHeader eyebrow="Comunicação" title="Notificações">
        E-mails automáticos via Google Workspace, avisos de expiração e notificações internas.
      </PageHeader>
      <NotificationTabs current="/admin/notificacoes" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={statusTone}>{status.label}</Badge>
        {s.test_mode && <Badge tone="warn">Modo de teste: só endereços autorizados</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Serviço" value={<span className="text-xl">Google Workspace</span>} hint={provider.id === "gmail" ? "Gmail API · OAuth 2.0" : "EMAIL_PROVIDER por definir"} />
        <StatTile label="Remetente" value={<span className="break-all text-lg">{s.from_email}</span>} hint={s.from_name} />
        <StatTile
          label="Autenticação"
          value={<span className="text-xl">{status.code === "not_configured" ? "Por configurar" : "Configurada"}</span>}
          hint={status.code === "not_configured" ? `Em falta: ${status.missing.join(", ")}` : state?.verified_at ? `Validada em ${formatDateTime(state.verified_at)}` : "Envio de teste por validar"}
        />
        <StatTile label="Integração" value={<span className="text-xl">{status.code === "active" ? "Ativa" : "Inativa"}</span>} hint={status.code === "active" ? `Validada para ${state?.verified_from}` : "Nada é enviado nem simulado até ser validada"} />
        <StatTile label="Último e-mail enviado" value={<span className="text-xl">{state?.last_sent_at ? formatDateTime(state.last_sent_at) : "—"}</span>} />
        <StatTile
          label="Último erro"
          value={<span className="text-xl">{state?.last_error_at ? formatDateTime(state.last_error_at) : "—"}</span>}
          hint={state?.last_error ? <span className="line-clamp-2">{state.last_error}</span> : undefined}
        />
        <StatTile
          label="Agendador"
          value={<span className="text-xl">{run ? (run.ok ? "Operacional" : run.ok === false ? "Com erro" : "Em execução") : "Sem execuções"}</span>}
          hint={run ? `${run.kind === "daily" ? "Diário (Vercel Cron)" : run.kind === "tick" ? "Frequente" : "Manual"} · ${formatDateTime(run.started_at)}` : "O cron diário corre às 08:00 (Luanda)"}
        />
        <StatTile
          label="Último processamento de expirações"
          value={<span className="text-xl">{scan ? formatDateTime(scan.started_at) : "—"}</span>}
          hint={reminders ? `${reminders.eligible} assinatura(s) em marco · ${reminders.created} aviso(s) novo(s)` : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-mute">
        <span>Fila: {queued.count ?? 0} na fila · {retrying.count ?? 0} a repetir · {failed.count ?? 0} falhados (7 dias)</span>
        <Link href="/admin/notificacoes/historico?estado=failed" className="text-gold-light hover:underline">Ver falhas</Link>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card
          title="Validar a integração"
          description="A integração só fica ativa depois de um e-mail de teste chegar e o código ser confirmado aqui. Até lá, os e-mails ficam guardados na fila."
        >
          <ActionForm action={sendVerificationAction}>
            <Field label="Enviar código para" name="verify-to" hint="O seu e-mail, o e-mail administrativo ou um endereço de teste autorizado.">
              <Input name="to" id="verify-to" type="email" defaultValue={s.admin_email || admin.email} required />
            </Field>
            <SubmitButton variant="glass" pendingLabel="A enviar…" disabled={status.code === "not_configured"}>Enviar e-mail de verificação</SubmitButton>
          </ActionForm>
          <ActionForm action={confirmVerificationAction} className="mt-6 space-y-4 border-t border-white/[0.07] pt-6">
            <Field label="Código recebido" name="verify-code">
              <Input name="code" id="verify-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" />
            </Field>
            <SubmitButton variant="glass" pendingLabel="A validar…">Confirmar e ativar</SubmitButton>
          </ActionForm>
          {status.code === "not_configured" && (
            <p className="mt-5 text-sm text-mute">
              Configure as variáveis {status.missing.join(", ")} na Vercel (ver docs/NOTIFICACOES.md) e faça um novo deploy.
            </p>
          )}
        </Card>

        <Card title="Processar agora" description="Executa já o que o agendador diário faz: sincroniza expirações, cria os avisos do dia e envia a fila. É seguro repetir: nada é duplicado.">
          <ActionForm action={runNowAction}>
            <SubmitButton variant="glass" pendingLabel="A processar…">Processar agora</SubmitButton>
          </ActionForm>
          <p className="mt-5 text-sm text-mute">
            O processamento automático corre todos os dias na Vercel, sem depender de visitas ao site. Opcionalmente, um agendador a cada 15 minutos (GitHub Actions) repete tentativas falhadas mais cedo.
          </p>
        </Card>
      </div>

      <section className="glass mt-5 p-6">
        <h2 className="font-serif text-2xl text-paper">Configurações</h2>
        <p className="mt-1 text-sm text-mute">As credenciais Google nunca aparecem aqui: ficam só nas variáveis de ambiente da Vercel.</p>
        <ActionForm action={saveNotificationSettingsAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="E-mail remetente" name="from_email" hint="Tem de ser a conta autenticada ou um alias “Enviar como” dela.">
            <Input name="from_email" type="email" defaultValue={s.from_email} required />
          </Field>
          <Field label="Nome de apresentação" name="from_name">
            <Input name="from_name" defaultValue={s.from_name} maxLength={60} required />
          </Field>
          <Field label="Endereço de resposta" name="reply_to">
            <Input name="reply_to" type="email" defaultValue={s.reply_to} required />
          </Field>
          <Field label="E-mail das notificações administrativas" name="admin_email">
            <Input name="admin_email" type="email" defaultValue={s.admin_email} required />
          </Field>
          <Field label="Endereço da plataforma (ligações nos e-mails)" name="site_url">
            <Input name="site_url" type="url" defaultValue={s.site_url} required />
          </Field>
          <Field label="Hora diária dos avisos (Luanda)" name="daily_hour" hint="O cron da Vercel (plano Hobby) corre às 08:00; outras horas aplicam-se com o agendador frequente.">
            <Input name="daily_hour" type="number" min={0} max={23} defaultValue={s.daily_hour} />
          </Field>

          <fieldset className="space-y-3 md:col-span-2">
            <legend className="mb-3 text-[0.8rem] font-medium text-paper/70">Tipos de e-mail</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {FLAG_LABELS.map(([flag, label, essential]) => (
                <Checkbox key={flag} name={`email_${flag}`} defaultChecked={s.emails[flag] !== false} label={<>{label}{essential && <span className="ml-1 text-xs text-gold/80">· importante</span>}</>} />
              ))}
            </div>
            <p className="rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">
              Os e-mails marcados como importantes informam o cliente sobre pagamentos e acesso. Se os desativar, os clientes deixam de os receber. Para confirmar, marque também:
            </p>
            <Checkbox name="confirm_disable" label="Confirmo que quero desativar e-mails importantes." />
          </fieldset>

          <fieldset className="space-y-3 md:col-span-2">
            <legend className="mb-3 text-[0.8rem] font-medium text-paper/70">Modo de teste</legend>
            <Checkbox name="test_mode" defaultChecked={s.test_mode} label="Enviar apenas para os endereços autorizados abaixo e para o e-mail administrativo (os restantes ficam registados como não enviados)." />
            <Field label="Endereços de teste autorizados" name="test_recipients" hint="Separados por vírgulas ou linhas. Máximo 10.">
              <Textarea name="test_recipients" rows={2} defaultValue={s.test_recipients.join(", ")} />
            </Field>
          </fieldset>

          <fieldset className="grid gap-4 md:col-span-2 md:grid-cols-2">
            <legend className="mb-3 text-[0.8rem] font-medium text-paper/70">Aspeto dos e-mails</legend>
            <Field label="Botões" name="button">
              <Select name="button" defaultValue={s.design.button}>
                <option value="dark">Preto com texto branco</option>
                <option value="gold">Dourado com texto preto</option>
              </Select>
            </Field>
            <Field label="Nota no rodapé (opcional)" name="footer_note">
              <Input name="footer_note" defaultValue={s.design.footer_note} maxLength={200} />
            </Field>
          </fieldset>

          <div className="md:col-span-2">
            <SubmitButton variant="glass" pendingLabel="A guardar…">Guardar configurações</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-3xl text-paper">Alertas da administração</h2>
          {unread > 0 && (
            <form action={markAdminNotificationsReadAction}>
              <button className="text-xs text-gold-light hover:underline">Marcar todos como lidos</button>
            </form>
          )}
        </div>
        <ul className="glass divide-y divide-white/[0.06]">
          {(alerts ?? []).map((a) => (
            <li key={a.id} className={`flex flex-wrap items-start justify-between gap-3 p-4 ${a.read_at ? "opacity-70" : ""}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY[a.severity as keyof typeof SEVERITY] ?? "neutral"}>{a.read_at ? "Lido" : "Novo"}</Badge>
                  {a.link ? <Link href={a.link} className="font-medium text-paper hover:underline">{a.title}</Link> : <span className="font-medium text-paper">{a.title}</span>}
                </div>
                {a.body && <p className="mt-1 text-sm text-mute">{a.body}</p>}
                <p className="mt-1 text-xs text-mute">{formatDateTime(a.created_at)}</p>
              </div>
              {!a.read_at && (
                <form action={markAdminNotificationsReadAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs text-paper/60 hover:text-paper hover:underline">Marcar como lido</button>
                </form>
              )}
            </li>
          ))}
          {!alerts?.length && <li className="p-6 text-sm text-mute">Sem alertas.</li>}
        </ul>
        <p className="mt-3 text-xs text-mute">Estes alertas são internos: só os administradores os veem. Modelos disponíveis: {Object.keys(TEMPLATES).length}.</p>
      </section>
    </>
  );
}
