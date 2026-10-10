import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { contentByIds, getHistory, listContent, recommendations } from "@/lib/catalog";
import { getSubscriptionView } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { Shelf } from "@/components/catalog/Shelf";
import { SubscriptionBanner } from "@/components/app/SubscriptionBanner";
import { QuickSearch } from "@/components/catalog/QuickSearch";
import { EmptyState } from "@/components/ui/Glass";
import { ButtonLink } from "@/components/ui/Button";
import { Library } from "lucide-react";
import { formatDate, SUBSCRIPTION_STATUS_LABEL } from "@/lib/format";
import { markNotificationsRead } from "./actions";

export const metadata: Metadata = { title: "Início" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("pt-PT", { hour: "numeric", hour12: false, timeZone: "Africa/Luanda" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 19 ? "Boa tarde" : "Boa noite";
}

export default async function AppHome() {
  const user = await requireUser("/app");
  const supabase = await createClient();
  const [view, history, latest, featured, recs, { data: notifications }] = await Promise.all([
    getSubscriptionView(user.id),
    getHistory(user.id, 12),
    listContent({ limit: 12 }),
    listContent({ featured: true, limit: 12 }),
    recommendations(user.id, 12),
    supabase.from("notifications").select("id, title, body, created_at").eq("user_id", user.id).is("read_at", null).order("created_at", { ascending: false }).limit(3),
  ]);
  const resumeItems = await contentByIds(history.filter((h) => h.duration_seconds && h.position_seconds > 10 && h.position_seconds < h.duration_seconds - 15).map((h) => h.content_id));
  const resume = new Map(history.map((h) => [h.content_id, { position: h.position_seconds, duration: h.duration_seconds }]));
  const firstName = (user.fullName || "").split(" ")[0];
  const empty = !latest.length;

  return (
    <>
      <header className="mb-10 animate-rise">
        <p className="text-[0.72rem] uppercase tracking-[0.22em] text-gold/90">
          {SUBSCRIPTION_STATUS_LABEL[view.effective]}
          {view.hasAccess && view.sub?.expires_at ? ` · até ${formatDate(view.sub.expires_at)}` : ""}
        </p>
        <h1 className="mt-2 font-serif text-4xl text-paper sm:text-5xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
      </header>

      {!empty && <QuickSearch />}

      {notifications && notifications.length > 0 && (
        <section aria-label="Notificações" className="glass mb-8 p-5 animate-rise">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-4 w-4 text-gold" />
              <ul className="space-y-2">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <p className="text-sm font-medium text-paper">{n.title}</p>
                    <p className="text-sm text-mute">{n.body}</p>
                  </li>
                ))}
              </ul>
            </div>
            <form action={markNotificationsRead}>
              <button className="press text-xs text-paper/60 underline-offset-4 hover:text-paper hover:underline">Marcar como lidas</button>
            </form>
          </div>
        </section>
      )}

      <SubscriptionBanner view={view} />

      {empty ? (
        <EmptyState icon={Library} title="A biblioteca está a ser preparada" action={<ButtonLink href="/planos" variant="glass">Conhecer os planos</ButtonLink>}>
          Os primeiros conteúdos serão publicados em breve.
        </EmptyState>
      ) : (
        <>
          <Shelf title="Retomar reprodução" items={resumeItems} href="/app/historico" resume={resume} />
          <Shelf title="Seleção AUREA" items={featured} />
          <Shelf title="Recomendados para si" items={recs} />
          <Shelf title="Mais recentes" items={latest} href="/app/biblioteca" />
        </>
      )}
    </>
  );
}
