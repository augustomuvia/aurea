"use client";
import { useEffect } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Monitorização: os erros do servidor ficam nos registos da Vercel com este digest.
    console.error("[aurea] erro", error.digest);
  }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="animate-rise">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-6 font-serif text-4xl text-paper">Algo correu mal.</h1>
        <p className="mx-auto mt-3 max-w-sm text-mute">Ocorreu um erro inesperado. Tente novamente; se persistir, contacte o suporte.</p>
        {error.digest && <p className="mt-2 text-xs text-mute">Código: {error.digest}</p>}
        <Button onClick={reset} variant="glass" className="mt-8">Tentar novamente</Button>
      </div>
    </main>
  );
}
