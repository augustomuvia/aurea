import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/site/AuthShell";
import { getSessionUser } from "@/lib/auth";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/app");
  return (
    <AuthShell
      title="Criar conta"
      subtitle="O primeiro passo para o seu espaço de equilíbrio."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="text-gold-light underline-offset-4 hover:underline">
            Iniciar sessão
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
