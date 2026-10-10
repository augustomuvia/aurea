"use client";
import { useActionState } from "react";
import type { ActionResult } from "@/lib/types";
import { FormMessage } from "@/components/ui/FormMessage";

/** Formulário genérico para Server Actions administrativas com feedback. */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
}: {
  action: (state: unknown, formData: FormData) => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      <FormMessage state={state} />
      {children}
    </form>
  );
}
