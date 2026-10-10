import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/catalog";
import { PageHeader } from "@/components/ui/Glass";
import { formatDate } from "@/lib/format";
import { AccountForms } from "./AccountForms";

export const metadata: Metadata = { title: "Conta e privacidade" };

export default async function AccountPage() {
  const user = await requireUser("/app/conta");
  const supabase = await createClient();
  const [{ data: prefs }, categories] = await Promise.all([
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    listCategories(),
  ]);
  return (
    <>
      <PageHeader eyebrow="Definições" title="Conta e privacidade">
        {user.email}
        {prefs?.terms_accepted_at ? ` · termos aceites em ${formatDate(prefs.terms_accepted_at)}` : ""}
      </PageHeader>
      <AccountForms
        fullName={user.fullName}
        isOwner={user.isSuperAdmin}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        prefs={{
          preferredCategories: (prefs?.preferred_categories as string[]) ?? [],
          marketingConsent: Boolean(prefs?.marketing_consent),
          analyticsConsent: Boolean(prefs?.analytics_consent),
          reminderEmails: prefs?.reminder_emails !== false,
        }}
      />
    </>
  );
}
