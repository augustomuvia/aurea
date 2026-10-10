"use client";
import { useActionState } from "react";
import { resendVerificationAction } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

export function ResendForm({ email }: { email: string }) {
  const [state, action] = useActionState(resendVerificationAction, null);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="email" value={email} />
      <SubmitButton variant="glass" className="w-full" pendingLabel="A enviar…" disabled={!email}>
        Reenviar e-mail
      </SubmitButton>
    </form>
  );
}
