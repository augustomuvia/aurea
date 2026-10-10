import { LogoMark } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="animate-rise">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-6 font-serif text-5xl text-paper">Silêncio.</h1>
        <p className="mx-auto mt-3 max-w-sm text-mute">A página que procura não existe ou foi movida.</p>
        <ButtonLink href="/" variant="glass" className="mt-8">Voltar ao início</ButtonLink>
      </div>
    </main>
  );
}
