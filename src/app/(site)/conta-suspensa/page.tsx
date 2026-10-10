import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/site/AuthShell";
import { logoutAction } from "../(auth)/actions";

export const metadata: Metadata = { title: "Conta suspensa" };

export default function SuspendedPage() {
  return (
    <AuthShell title="Conta suspensa" subtitle="O acesso a esta conta está temporariamente indisponível.">
      <p className="text-sm leading-relaxed text-paper/75">
        Se considera que se trata de um erro, contacte-nos através da{" "}
        <Link href="/suporte" className="text-gold-light underline underline-offset-4">página de suporte</Link>.
      </p>
      <form action={logoutAction} className="mt-6">
        <button className="press text-sm text-paper/60 underline-offset-4 hover:text-paper hover:underline">Terminar sessão</button>
      </form>
    </AuthShell>
  );
}
