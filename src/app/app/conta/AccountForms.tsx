"use client";
import { useActionState } from "react";
import { Download } from "lucide-react";
import { changePassword, closeAccount, updateNotificationPreferences, updatePreferences, updateProfile } from "../actions";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="glass grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_1.4fr]">
      <div>
        <h2 className="font-serif text-2xl text-paper">{title}</h2>
        {description && <p className="mt-2 text-sm leading-relaxed text-mute">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function AccountForms({
  fullName,
  isOwner,
  categories,
  prefs,
}: {
  fullName: string;
  isOwner: boolean;
  categories: { slug: string; name: string }[];
  prefs: { preferredCategories: string[]; marketingConsent: boolean; analyticsConsent: boolean; reminderEmails: boolean };
}) {
  const [profileState, profileAction] = useActionState(updateProfile, null);
  const [prefState, prefAction] = useActionState(updatePreferences, null);
  const [pwState, pwAction] = useActionState(changePassword, null);
  const [notifState, notifAction] = useActionState(updateNotificationPreferences, null);
  const [closeState, closeAction] = useActionState(closeAccount, null);
  const pwFe = pwState && !pwState.ok ? pwState.fieldErrors : undefined;

  return (
    <div className="space-y-5">
      <Section title="Dados pessoais">
        <form action={profileAction} className="space-y-4">
          <FormMessage state={profileState} />
          <Field label="Nome" name="fullName" error={profileState && !profileState.ok ? profileState.fieldErrors?.fullName : undefined}>
            <Input name="fullName" defaultValue={fullName} maxLength={120} autoComplete="name" />
          </Field>
          <SubmitButton variant="glass" pendingLabel="A guardar…">Guardar</SubmitButton>
        </form>
      </Section>

      <Section title="Preferências" description="Usamos as categorias escolhidas apenas para sugerir conteúdos na sua página inicial.">
        <form action={prefAction} className="space-y-5">
          <FormMessage state={prefState} />
          <fieldset>
            <legend className="mb-3 text-[0.8rem] font-medium text-paper/70">Categorias preferidas</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <label key={c.slug} className="press inline-flex h-9 cursor-pointer items-center rounded-full border border-white/10 px-4 text-sm text-paper/70 has-[:checked]:border-gold/50 has-[:checked]:bg-gold/[0.1] has-[:checked]:text-gold-light">
                  <input type="checkbox" name="preferredCategories" value={c.slug} defaultChecked={prefs.preferredCategories.includes(c.slug)} className="sr-only" />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-[0.8rem] font-medium text-paper/70">Consentimentos</legend>
            <Checkbox name="marketingConsent" defaultChecked={prefs.marketingConsent} label="Aceito receber novidades da AUREA por e-mail." />
            <Checkbox name="analyticsConsent" defaultChecked={prefs.analyticsConsent} label="Aceito a utilização de estatísticas anónimas para melhorar o serviço." />
          </fieldset>
          <SubmitButton variant="glass" pendingLabel="A guardar…">Guardar preferências</SubmitButton>
        </form>
      </Section>

      <Section
        title="Notificações"
        description="As mensagens necessárias à gestão da conta, dos pagamentos e da assinatura são sempre enviadas. As novidades da AUREA dependem do consentimento acima."
      >
        <form action={notifAction} className="space-y-5">
          <FormMessage state={notifState} />
          <fieldset className="space-y-3">
            <legend className="mb-3 text-[0.8rem] font-medium text-paper/70">Sempre ativas (essenciais)</legend>
            <ul className="space-y-1.5 text-sm text-paper/70">
              <li>Boas-vindas e segurança da conta</li>
              <li>Pedidos de pagamento e verificação do pagamento</li>
              <li>Ativação do plano</li>
            </ul>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-[0.8rem] font-medium text-paper/70">Opcionais</legend>
            <Checkbox
              name="reminderEmails"
              defaultChecked={prefs.reminderEmails}
              label="Receber por e-mail os avisos antes de a assinatura terminar (10, 5, 3 e 1 dia). Os avisos aparecem sempre no sino da conta."
            />
          </fieldset>
          <SubmitButton variant="glass" pendingLabel="A guardar…">Guardar notificações</SubmitButton>
        </form>
      </Section>

      <Section title="Palavra-passe">
        <form action={pwAction} className="space-y-4" noValidate>
          <FormMessage state={pwState} />
          <Field label="Palavra-passe atual" name="currentPassword" error={pwFe?.currentPassword}>
            <Input name="currentPassword" type="password" autoComplete="current-password" error={pwFe?.currentPassword} />
          </Field>
          <Field label="Nova palavra-passe" name="password" error={pwFe?.password} hint="Mínimo de 10 caracteres, com letras e números.">
            <Input name="password" type="password" autoComplete="new-password" error={pwFe?.password} />
          </Field>
          <Field label="Confirmar nova palavra-passe" name="confirm" error={pwFe?.confirm}>
            <Input name="confirm" type="password" autoComplete="new-password" error={pwFe?.confirm} />
          </Field>
          <SubmitButton variant="glass" pendingLabel="A alterar…">Alterar palavra-passe</SubmitButton>
        </form>
      </Section>

      <Section title="Os seus dados" description="Pode descarregar uma cópia dos dados pessoais associados à sua conta.">
        <a href="/api/me/export" className="press glass inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm text-paper hover:border-white/20">
          <Download className="h-4 w-4" /> Exportar dados (JSON)
        </a>
      </Section>

      {!isOwner && (
        <Section
          title="Encerrar conta"
          description="Elimina o perfil, favoritos, histórico e preferências. Os registos de pagamento são conservados sem ligação ao perfil, conforme obrigações legais. Esta ação é irreversível."
        >
          <form action={closeAction} className="space-y-4">
            <FormMessage state={closeState} />
            <Field label="Palavra-passe" name="closePassword">
              <Input name="password" id="closePassword" type="password" autoComplete="current-password" />
            </Field>
            <Field label='Escreva "ENCERRAR" para confirmar' name="confirm">
              <Input name="confirm" autoComplete="off" />
            </Field>
            <SubmitButton variant="danger" pendingLabel="A encerrar…">Encerrar conta</SubmitButton>
          </form>
        </Section>
      )}
    </div>
  );
}
