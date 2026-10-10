"use client";
import { useActionState } from "react";
import { createOrderAction } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";

export function CreateOrderForm({ plan }: { plan: string }) {
  const [state, action] = useActionState(createOrderAction, null);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton className="w-full" size="lg" pendingLabel="A criar pedido…">
        Continuar para pagamento
      </SubmitButton>
    </form>
  );
}
