import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { getSessionUser } from "@/lib/auth";
import { ButtonLink } from "@/components/ui/Button";
import { MobileMenu } from "./MobileMenu";

export async function SiteNav() {
  const user = await getSessionUser();
  const links = [
    { href: "/app/biblioteca", label: "Biblioteca" },
    { href: "/planos", label: "Planos" },
    { href: "/suporte", label: "Suporte" },
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <nav aria-label="Principal" className="glass mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pl-5 pr-2">
        <Link href="/" aria-label="AUREA — início" className="press">
          <Logo size="sm" />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="press rounded-full px-4 py-2 text-sm text-paper/70 hover:bg-white/[0.05] hover:text-paper">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5">
          {user ? (
            <ButtonLink href={user.isSuperAdmin ? "/admin" : "/app"} variant="glass" size="sm">
              {user.isSuperAdmin ? "Painel" : "A minha conta"}
            </ButtonLink>
          ) : (
            <>
              <Link href="/login" className="press hidden rounded-full px-4 py-2 text-sm text-paper/75 hover:text-paper sm:inline-flex">
                Entrar
              </Link>
              <ButtonLink href="/registar" size="sm">
                Criar conta
              </ButtonLink>
            </>
          )}
          <MobileMenu links={[...links, ...(user ? [] : [{ href: "/login", label: "Entrar" }])]} />
        </div>
      </nav>
    </header>
  );
}
