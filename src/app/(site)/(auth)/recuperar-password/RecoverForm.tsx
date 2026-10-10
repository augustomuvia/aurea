"use client";
import { useActionState } from "react";
import { recoverAction } from "../actions";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

export function RecoverForm() {
  const [state, action] = useActionState(recoverAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="E-mail" name="email" error={fe?.email}>
        <Input name="email" type="email" autoComplete="email" required error={fe?.email} />
      </Field>
      <SubmitButton className="w-full" pendingLabel="A enviar…">
        Enviar instruções
      </SubmitButton>
    </form>
  );
}
