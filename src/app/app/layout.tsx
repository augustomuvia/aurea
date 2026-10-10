import { requireUser } from "@/lib/auth";
import { getFavoriteIds } from "@/lib/catalog";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { PlayerShell } from "@/components/player/PlayerShell";
import { AppNav } from "@/components/app/AppNav";
import { AnnouncementBar, MaintenanceGate } from "@/components/site/Notices";
import { createClient } from "@/lib/supabase/server";
import type { BellItem } from "@/components/app/NotificationBell";
import { OfflineSync } from "@/components/offline/OfflineSync";
import { getOwnAudioAccess } from "@/lib/audio-access";

// Sessão, permissões e configurações editáveis pelo admin: sempre renderizado por pedido.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/app");
  const supabase = await createClient();
  // RLS: cada utilizador só lê as suas notificações.
  const [favorites, { data: notes }, { count: unread }, ownAudio] = await Promise.all([
    getFavoriteIds(user.id),
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    getOwnAudioAccess(),
  ]);
  const items: BellItem[] = (notes ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body ?? "",
    category: n.category ?? "conta",
    link: n.link ?? null,
    read_at: n.read_at,
    created_at: n.created_at,
  }));
  return (
    <MaintenanceGate>
      <PlayerProvider initialFavorites={favorites}>
        <AnnouncementBar />
        <AppNav name={user.fullName || user.email} isAdmin={user.isSuperAdmin} notifications={{ items, unread: unread ?? 0 }} />
        <main id="conteudo" className="mx-auto max-w-6xl px-4 pb-[calc(26rem+env(safe-area-inset-bottom))] pt-24 sm:px-6 md:pb-40 md:pt-28">
          {!user.emailVerified && (
            <p role="status" className="mb-6 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">
              Confirme o seu endereço de e-mail para garantir a recuperação da conta.
            </p>
          )}
          {children}
        </main>
        <PlayerShell />
        <OfflineSync access={ownAudio} />
      </PlayerProvider>
    </MaintenanceGate>
  );
}
