import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { BarChart } from "@/components/admin/BarChart";
import { PageHeader, StatTile } from "@/components/ui/Glass";
import { formatKz } from "@/lib/pricing";
import { formatDateTime } from "@/lib/format";

const PERIODS = { "7": 7, "30": 30, "90": 90, "365": 365 } as const;

type Metrics = {
  users_total: number;
  users_new: number;
  subs_active: number;
  subs_expired: number;
  payments_pending: number;
  payments_confirmed: number;
  revenue_minor: number;
  revenue_by_plan: { plan: string; code: string; revenue_minor: number; count: number }[];
  signups_by_day: { day: string; count: number }[];
  revenue_by_day: { day: string; revenue_minor: number }[];
  top_content: { title: string; slug: string; plays: number }[];
  renewal: { eligible: number; renewed: number };
};

function fillDays(days: number, rows: { day: string; v: number }[]) {
  const map = new Map(rows.map((r) => [r.day, r.v]));
  const out: { label: string; value: number }[] = [];
  const fmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", timeZone: "Africa/Luanda" });
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda" });
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    out.push({ label: fmt.format(d), value: map.get(iso.format(d)) ?? 0 });
  }
  return out;
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireSuperAdmin();
  const { periodo = "30" } = await searchParams;
  const days = PERIODS[periodo as keyof typeof PERIODS] ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const svc = createServiceClient();
  const [{ data, error }, { data: logs }] = await Promise.all([
    svc.rpc("admin_metrics", { p_from: from.toISOString(), p_to: to.toISOString() }),
    svc.from("admin_audit_logs").select("id, action, actor_email, target_type, created_at, reason").order("created_at", { ascending: false }).limit(8),
  ]);
  if (error || !data) return <p className="text-danger">Não foi possível carregar as métricas.</p>;
  const m = data as Metrics;
  const renewalRate = m.renewal.eligible >= 5 ? Math.round((m.renewal.renewed / m.renewal.eligible) * 100) : null;

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard"
        action={
          <nav aria-label="Período" className="glass inline-flex rounded-full p-1">
            {Object.keys(PERIODS).map((p) => (
              <Link
                key={p}
                href={`/admin?periodo=${p}`}
                aria-current={String(days) === p ? "page" : undefined}
                className="press rounded-full px-3.5 py-1.5 text-xs text-paper/60 aria-[current=page]:bg-white/[0.1] aria-[current=page]:text-paper"
              >
                {p === "365" ? "12 meses" : `${p} dias`}
              </Link>
            ))}
          </nav>
        }
      >
        Valores financeiros consideram apenas pagamentos confirmados.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Receita confirmada" value={formatKz(m.revenue_minor)} hint={`${m.payments_confirmed} pagamentos no período`} />
        <StatTile label="Assinaturas ativas" value={m.subs_active} hint={`${m.subs_expired} expiradas`} />
        <StatTile label="Utilizadores" value={m.users_total} hint={`+${m.users_new} no período`} />
        <Link href="/admin/pagamentos?estado=pending" className="block">
          <StatTile label="Pagamentos pendentes" value={m.payments_pending} hint="Rever agora →" />
        </Link>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <BarChart title="Receita confirmada por dia" data={fillDays(Math.min(days, 90), m.revenue_by_day.map((r) => ({ day: r.day, v: Number(r.revenue_minor) })))} format={(v) => formatKz(v)} />
        <BarChart title="Novos registos por dia" data={fillDays(Math.min(days, 90), m.signups_by_day.map((r) => ({ day: r.day, v: r.count })))} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="glass p-5">
          <h2 className="text-sm font-medium text-paper">Receita por plano</h2>
          {m.revenue_by_plan.length ? (
            <ul className="mt-4 space-y-3">
              {m.revenue_by_plan.map((r) => {
                const pct = m.revenue_minor ? (Number(r.revenue_minor) / m.revenue_minor) * 100 : 0;
                return (
                  <li key={r.code}>
                    <div className="flex justify-between text-sm">
                      <span className="text-paper/80">{r.plan} <span className="text-mute">· {r.count}</span></span>
                      <span className="tabular-nums text-paper">{formatKz(r.revenue_minor)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-[#B08A35]" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-mute">Sem receita confirmada no período.</p>
          )}
          <p className="mt-6 border-t border-white/[0.07] pt-4 text-xs text-mute">
            Taxa de renovação: {renewalRate === null ? "dados insuficientes (mín. 5 períodos terminados)" : <strong className="text-paper">{renewalRate}%</strong>}
          </p>
        </section>

        <section className="glass p-5">
          <h2 className="text-sm font-medium text-paper">Conteúdos mais reproduzidos</h2>
          {m.top_content.length ? (
            <ol className="mt-4 space-y-2.5 text-sm">
              {m.top_content.map((c, i) => (
                <li key={c.slug} className="flex justify-between gap-3">
                  <span className="truncate text-paper/80"><span className="mr-2 tabular-nums text-mute">{i + 1}</span>{c.title}</span>
                  <span className="tabular-nums text-mute">{c.plays}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-mute">Sem reproduções no período.</p>
          )}
        </section>

        <section className="glass p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-paper">Atividade administrativa</h2>
            <Link href="/admin/auditoria" className="text-xs text-mute hover:text-paper">Ver tudo</Link>
          </div>
          {logs?.length ? (
            <ul className="mt-4 space-y-3 text-sm">
              {logs.map((l) => (
                <li key={l.id}>
                  <p className="text-paper/80">{l.action}</p>
                  <p className="text-xs text-mute">{formatDateTime(l.created_at)} · {l.actor_email ?? "sistema"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-mute">Sem atividade registada.</p>
          )}
        </section>
      </div>
    </>
  );
}
