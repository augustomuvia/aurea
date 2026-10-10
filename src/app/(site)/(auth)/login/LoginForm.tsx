"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../actions";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action] = useActionState(loginAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-5" noValidate>
      {notice && <FormMessage state={{ ok: false, error: notice }} />}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <Field label="E-mail" name="email" error={fe?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required error={fe?.email} />
      </Field>
      <Field label="Palavra-passe" name="password" error={fe?.password}>
        <Input name="password" type="password" autoComplete="current-password" required error={fe?.password} />
      </Field>
      <div className="flex justify-end">
        <Link href="/recuperar-password" className="text-xs text-paper/60 underline-offset-4 hover:text-paper hover:underline">
          Esqueceu-se da palavra-passe?
        </Link>
      </div>
      <SubmitButton className="w-full" pendingLabel="A entrar…">
        Entrar
      </SubmitButton>
    </form>
  );
}
