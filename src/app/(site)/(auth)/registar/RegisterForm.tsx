"use client";
import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "../actions";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Nome" name="fullName" error={fe?.fullName}>
        <Input name="fullName" autoComplete="name" required maxLength={120} error={fe?.fullName} />
      </Field>
      <Field label="E-mail" name="email" error={fe?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required error={fe?.email} />
      </Field>
      <Field label="Palavra-passe" name="password" error={fe?.password} hint="Mínimo de 10 caracteres, com letras e números.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} error={fe?.password} />
      </Field>
      <div>
        <Checkbox
          name="acceptTerms"
          required
          label={
            <>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="text-gold-light underline underline-offset-4">
                Termos
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="text-gold-light underline underline-offset-4">
                Política de Privacidade
              </Link>
              .
            </>
          }
        />
        {fe?.acceptTerms && (
          <p role="alert" className="mt-2 text-[0.8rem] text-danger">
            {fe.acceptTerms[0]}
          </p>
        )}
      </div>
      <SubmitButton className="w-full" pendingLabel="A criar conta…">
        Criar conta
      </SubmitButton>
    </form>
  );
}
