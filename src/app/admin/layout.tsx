import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Painel AUREA" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();
  const { count } = await createServiceClient().from("payments").select("id", { count: "exact", head: true }).eq("status", "pending");
  return (
    <div className="min-h-dvh">
      <AdminNav email={admin.email} pending={count ?? 0} />
      <main id="conteudo" className="px-4 pb-16 pt-6 sm:px-8 lg:ml-64 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
