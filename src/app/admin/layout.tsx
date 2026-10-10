import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Painel AUREA" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();
  const svc = createServiceClient();
  const [{ count }, { count: alerts }] = await Promise.all([
    svc.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // Alertas internos por ler (falhas de envio, agendador, comprovativos, etc.).
    svc.from("admin_notifications").select("id", { count: "exact", head: true }).is("read_at", null).in("severity", ["warning", "error"]),
  ]);
  return (
    <div className="min-h-dvh">
      <AdminNav email={admin.email} pending={count ?? 0} alerts={alerts ?? 0} />
      <main id="conteudo" className="px-4 pb-16 pt-6 sm:px-8 lg:ml-64 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
