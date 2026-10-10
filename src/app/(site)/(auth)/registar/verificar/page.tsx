import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/site/AuthShell";
import { ResendForm } from "./ResendForm";

export const metadata: Metadata = { title: "Verifique o seu e-mail" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return (
    <AuthShell title="Verifique o seu e-mail">
      <div className="text-center">
        <MailCheck className="mx-auto h-8 w-8 text-gold" strokeWidth={1.4} />
        <p className="mt-4 text-sm leading-relaxed text-paper/75">
          Se o endereço for válido, enviámos uma ligação de confirmação{email ? <> para <strong className="text-paper">{email}</strong></> : null}. Abra-a para ativar a sua conta.
        </p>
        <p className="mt-3 text-xs text-mute">Não recebeu? Verifique a pasta de spam ou peça um novo envio.</p>
      </div>
      <div className="mt-6">
        <ResendForm email={email} />
      </div>
    </AuthShell>
  );
}
