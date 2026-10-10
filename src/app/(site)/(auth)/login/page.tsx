import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/site/AuthShell";
import { getSessionUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Iniciar sessão" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSessionUser()) redirect(next);
  return (
    <AuthShell
      title="Bem-vindo de volta"
      subtitle="Entre para continuar a sua escuta."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link href="/registar" className="text-gold-light underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={sp.erro === "ligacao-invalida" ? "A ligação é inválida ou expirou. Tente novamente." : undefined} />
    </AuthShell>
  );
}
