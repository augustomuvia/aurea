"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Spinner } from "@/components/ui/Spinner";

type Stage = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "verify"; factorId: string } | { kind: "error"; message: string };

/** Ativação e verificação TOTP através do Supabase Auth MFA. */
export function MfaFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setStage({ kind: "error", message: "Não foi possível carregar a configuração de segurança." });
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setStage({ kind: "verify", factorId: verified.id });
      // Remove fatores incompletos de tentativas anteriores.
      for (const f of data.all.filter((f) => f.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error: enErr } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "AUREA Admin" });
      if (enErr || !en) return setStage({ kind: "error", message: "Não foi possível iniciar a ativação. Confirme que o MFA (TOTP) está ativo no Supabase." });
      setStage({ kind: "enroll", factorId: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "enroll" && stage.kind !== "verify") return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: stage.factorId });
    if (chErr || !ch) {
      setBusy(false);
      return setError("Não foi possível criar o desafio. Tente novamente.");
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId: stage.factorId, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (vErr) return setError("Código inválido ou expirado.");
    router.replace("/admin");
    router.refresh();
  }

  if (stage.kind === "loading") return <div className="flex justify-center py-6"><Spinner className="h-6 w-6 text-gold" /></div>;
  if (stage.kind === "error") return <FormMessage state={{ ok: false, error: stage.message }} />;

  return (
    <form onSubmit={submit} className="space-y-5">
      {stage.kind === "enroll" && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-paper/75">Leia o código QR com uma aplicação autenticadora (por exemplo, Google Authenticator ou 1Password).</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.qr} alt="Código QR para ativar a verificação em dois passos" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
          <p className="break-all text-xs text-mute">Chave manual: <code className="text-paper/80">{stage.secret}</code></p>
        </div>
      )}
      {error && <FormMessage state={{ ok: false, error }} />}
      <Field label="Código de 6 dígitos" name="code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
        {busy ? <Spinner /> : stage.kind === "enroll" ? "Ativar e entrar" : "Verificar"}
      </Button>
    </form>
  );
}
