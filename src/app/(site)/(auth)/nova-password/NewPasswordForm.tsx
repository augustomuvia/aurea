"use client";
import { useActionState } from "react";
import { newPasswordAction } from "../actions";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

export function NewPasswordForm() {
  const [state, action] = useActionState(newPasswordAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Nova palavra-passe" name="password" error={fe?.password} hint="Mínimo de 10 caracteres, com letras e números.">
        <Input name="password" type="password" autoComplete="new-password" required error={fe?.password} />
      </Field>
      <Field label="Confirmar palavra-passe" name="confirm" error={fe?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required error={fe?.confirm} />
      </Field>
      <SubmitButton className="w-full" pendingLabel="A guardar…">
        Guardar
      </SubmitButton>
    </form>
  );
}
