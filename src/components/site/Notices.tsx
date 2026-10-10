import { getSettings } from "@/lib/settings";
import { getSessionUser } from "@/lib/auth";
import { LogoMark } from "@/components/brand/Logo";

export async function AnnouncementBar() {
  const s = await getSettings();
  if (!s.announcement.active || !s.announcement.message) return null;
  return (
    <div role="status" className="relative z-40 border-b border-gold/20 bg-gold/[0.07] px-4 py-2 text-center text-xs text-gold-light">
      {s.announcement.message}
    </div>
  );
}

/** Modo de manutenção: bloqueia a plataforma para todos exceto o super admin. */
export async function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  if (!s.maintenance.enabled) return <>{children}</>;
  const user = await getSessionUser();
  if (user?.isSuperAdmin) return <>{children}</>;
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="animate-rise">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-6 font-serif text-4xl">Em manutenção</h1>
        <p className="mx-auto mt-3 max-w-sm text-mute">{s.maintenance.message}</p>
      </div>
    </main>
  );
}
