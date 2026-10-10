import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { AnnouncementBar, MaintenanceGate } from "@/components/site/Notices";

// Sessão, permissões e configurações editáveis pelo admin: sempre renderizado por pedido.
export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <MaintenanceGate>
      <AnnouncementBar />
      <SiteNav />
      <main id="conteudo">{children}</main>
      <SiteFooter />
    </MaintenanceGate>
  );
}
