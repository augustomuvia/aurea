import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthShell } from "@/components/site/AuthShell";
import { MfaFlow } from "./MfaFlow";

export const metadata: Metadata = { title: "Verificação em dois passos", robots: { index: false } };

export default async function AdminMfaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.isSuperAdmin) notFound();
  return (
    <AuthShell title="Verificação em dois passos" subtitle="O painel administrativo exige um código da sua aplicação autenticadora.">
      <MfaFlow />
    </AuthShell>
  );
}
