"use client";
import { useActionState } from "react";
import { supportAction } from "./actions";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

export function SupportForm({ name, email }: { name?: string; email?: string }) {
  const [state, action] = useActionState(supportAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome" name="name" error={fe?.name}>
          <Input name="name" defaultValue={name} autoComplete="name" error={fe?.name} />
        </Field>
        <Field label="E-mail" name="email" error={fe?.email}>
          <Input name="email" type="email" defaultValue={email} autoComplete="email" error={fe?.email} />
        </Field>
      </div>
      <Field label="Assunto" name="subject" error={fe?.subject}>
        <Input name="subject" maxLength={160} error={fe?.subject} />
      </Field>
      <Field label="Mensagem" name="message" error={fe?.message}>
        <Textarea name="message" rows={6} maxLength={4000} error={fe?.message} />
      </Field>
      <SubmitButton pendingLabel="A enviar…">Enviar mensagem</SubmitButton>
    </form>
  );
}
