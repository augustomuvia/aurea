import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/site/AuthShell";
import { RecoverForm } from "./RecoverForm";

export const metadata: Metadata = { title: "Recuperar palavra-passe" };

export default function RecoverPage() {
  return (
    <AuthShell
      title="Recuperar acesso"
      subtitle="Enviaremos uma ligação para definir uma nova palavra-passe."
      footer={
        <Link href="/login" className="text-gold-light underline-offset-4 hover:underline">
          Voltar ao início de sessão
        </Link>
      }
    >
      <RecoverForm />
    </AuthShell>
  );
}
