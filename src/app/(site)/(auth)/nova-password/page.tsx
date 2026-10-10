import type { Metadata } from "next";
import { AuthShell } from "@/components/site/AuthShell";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Nova palavra-passe" };

export default function NewPasswordPage() {
  return (
    <AuthShell title="Nova palavra-passe" subtitle="Escolha uma palavra-passe segura que não use noutros serviços.">
      <NewPasswordForm />
    </AuthShell>
  );
}
