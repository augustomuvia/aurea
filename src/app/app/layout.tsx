import { requireUser } from "@/lib/auth";
import { getFavoriteIds } from "@/lib/catalog";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { PlayerShell } from "@/components/player/PlayerShell";
import { AppNav } from "@/components/app/AppNav";
import { AnnouncementBar, MaintenanceGate } from "@/components/site/Notices";

// Sessão, permissões e configurações editáveis pelo admin: sempre renderizado por pedido.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/app");
  const favorites = await getFavoriteIds(user.id);
  return (
    <MaintenanceGate>
      <PlayerProvider initialFavorites={favorites}>
        <AnnouncementBar />
        <AppNav name={user.fullName || user.email} isAdmin={user.isSuperAdmin} />
        <main id="conteudo" className="mx-auto max-w-6xl px-4 pb-[calc(26rem+env(safe-area-inset-bottom))] pt-24 sm:px-6 md:pb-40 md:pt-28">
          {!user.emailVerified && (
            <p role="status" className="mb-6 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">
              Confirme o seu endereço de e-mail para garantir a recuperação da conta.
            </p>
          )}
          {children}
        </main>
        <PlayerShell />
      </PlayerProvider>
    </MaintenanceGate>
  );
}
