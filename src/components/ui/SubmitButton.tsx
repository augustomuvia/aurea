"use client";
import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./Button";
import { Spinner } from "./Spinner";

export function SubmitButton({ children, pendingLabel, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? (
        <>
          <Spinner /> {pendingLabel ?? "A processar…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
