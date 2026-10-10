"use client";
import { useActionState, useState } from "react";
import { FileUp } from "lucide-react";
import { uploadProofAction } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";
import { formatBytes, PROOF_MAX_BYTES } from "@/lib/payments/proof";

const ACCEPT = ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf";

export function ProofForm({ reference, replacing }: { reference: string; replacing: boolean }) {
  const [state, action] = useActionState(uploadProofAction, null);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const fieldError = localError ?? (state && !state.ok ? state.fieldErrors?.proof?.[0] : undefined);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <p className="font-medium text-paper">{replacing ? "Substituir comprovativo" : "Enviar comprovativo"}</p>
        <p className="mt-1 text-sm text-mute">Depois de pagar, anexe a captura de ecrã ou o PDF do comprovativo Multicaixa Express.</p>
      </div>
      <FormMessage state={state} />
      <input type="hidden" name="reference" value={reference} />
      <label
        htmlFor="proof"
        className="press flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-gold/35 bg-gold/[0.03] px-4 py-7 text-center transition-colors hover:border-gold/60 hover:bg-gold/[0.06]"
      >
        <FileUp className="h-6 w-6 text-gold" strokeWidth={1.5} />
        {picked ? (
          <span className="text-sm text-paper">
            {picked.name} <span className="text-mute">· {formatBytes(picked.size)}</span>
          </span>
        ) : (
          <span className="text-sm text-paper/80">Toque para escolher o ficheiro</span>
        )}
        <span className="text-xs text-mute">PNG, JPG ou PDF · máximo 4 MB</span>
        <input
          id="proof"
          name="proof"
          type="file"
          accept={ACCEPT}
          required
          className="sr-only"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "proof-error" : undefined}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setPicked(f ? { name: f.name, size: f.size } : null);
            setLocalError(f && f.size > PROOF_MAX_BYTES ? "O ficheiro tem mais de 4 MB." : null);
          }}
        />
      </label>
      {fieldError && (
        <p id="proof-error" role="alert" className="text-[0.8rem] text-danger">
          {fieldError}
        </p>
      )}
      <SubmitButton variant="glass" className="w-full" pendingLabel="A enviar comprovativo…" disabled={!picked || !!localError}>
        {replacing ? "Enviar novo comprovativo" : "Enviar comprovativo"}
      </SubmitButton>
    </form>
  );
}
