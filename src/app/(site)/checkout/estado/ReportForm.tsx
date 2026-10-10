"use client";
import { useActionState } from "react";
import { reportPaymentAction } from "../actions";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

export function ReportForm({ reference }: { reference: string }) {
  const [state, action] = useActionState(reportPaymentAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <p className="font-medium text-paper">Já pagou?</p>
      <FormMessage state={state} />
      <input type="hidden" name="reference" value={reference} />
      <Field label="Identificador da transação (do comprovativo)" name="transactionId" error={fe?.transactionId}>
        <Input name="transactionId" required maxLength={64} autoComplete="off" error={fe?.transactionId} />
      </Field>
      <Field label="Observação (opcional)" name="note" error={fe?.note}>
        <Textarea name="note" maxLength={500} rows={2} />
      </Field>
      <SubmitButton variant="glass" className="w-full" pendingLabel="A enviar…">
        Enviar dados do comprovativo
      </SubmitButton>
    </form>
  );
}
