import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { Table, td } from "@/components/admin/Table";
import { Badge, GlassCard, PageHeader } from "@/components/ui/Glass";
import { formatDateTime } from "@/lib/format";
import { formatKz } from "@/lib/pricing";
import { ActionForm } from "@/components/admin/ActionForm";
import { inputClass } from "@/components/ui/Field";
import { assignKursinhaSaleAction, retryKursinhaSaleAction } from "./actions";

export const metadata = { title: "Kursinha" };

const OUTCOME: Record<string, { label: string; tone: "neutral" | "gold" | "ok" | "danger" | "warn" }> = {
  received: { label: "Recebida", tone: "neutral" },
  pending: { label: "Pagamento pendente", tone: "neutral" },
  activated: { label: "Plano ativado", tone: "ok" },
  awaiting_account: { label: "À espera de conta", tone: "warn" },
  no_matching_plan: { label: "Sem plano com este preço", tone: "danger" },
  ignored_product: { label: "Outro produto", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  reversed: { label: "Revertida", tone: "danger" },
  error: { label: "Erro", tone: "danger" },
};

export default async function AdminKursinha() {
  await requireSuperAdmin();
  const { data } = await createServiceClient()
    .from("kursinha_sales")
    .select("sale_id, status, status_at, product_name, amount_minor, buyer_email, buyer_name, payment_method, user_id, payment_id, outcome, outcome_detail, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  type Row = {
    sale_id: string; status: string; status_at: string; product_name: string | null; amount_minor: number | null; buyer_email: string;
    buyer_name: string | null; payment_method: string | null; user_id: string | null; payment_id: string | null; outcome: string; outcome_detail: string | null; created_at: string;
  };
  const rows = (data ?? []) as Row[];
  const auth = serverEnv.kursinhaWebhookSecret ? "Segredo HMAC" : serverEnv.kursinhaWebhookToken ? "Token no URL" : null;
  const products = serverEnv.kursinhaProductIds;

  return (
    <>
      <PageHeader eyebrow="Pagamentos" title="Vendas Kursinha">
        Cada venda aprovada na Kursinha ativa ou estende o plano cujo preço é igual ao valor da venda, na conta com o mesmo e-mail confirmado.
      </PageHeader>
      <GlassCard className="mb-6 flex flex-wrap items-center gap-3 p-4 text-sm">
        <Badge tone={auth ? "ok" : "danger"}>Webhook: {auth ?? "não configurado"}</Badge>
        <Badge tone="neutral">Produtos: {products.length ? `${products.length} ID(s) autorizados` : "todos (decide o preço)"}</Badge>
        <span className="text-mute">URL: <code className="text-paper/80">{serverEnv.siteUrl}/api/payments/webhook/kursinha{auth === "Token no URL" ? "?token=…" : ""}</code></span>
      </GlassCard>
      <Table head={["Recebida", "Comprador", "Produto", "Valor", "Estado", "Resultado", ""]} empty={!rows.length}>
        {rows.map((r) => {
          const o = OUTCOME[r.outcome] ?? { label: r.outcome, tone: "neutral" as const };
          return (
            <tr key={r.sale_id} className="hover:bg-white/[0.02]">
              <td className={`${td} text-mute`}>{formatDateTime(r.created_at)}</td>
              <td className={td}>
                {r.user_id ? <Link href={`/admin/utilizadores/${r.user_id}`} className="text-paper hover:text-gold-light">{r.buyer_email}</Link> : r.buyer_email}
                {r.buyer_name && <span className="block text-xs text-mute">{r.buyer_name}</span>}
              </td>
              <td className={td}>{r.product_name ?? "—"}<span className="block text-xs text-mute">{r.sale_id}</span></td>
              <td className={`${td} tabular-nums`}>{r.amount_minor != null ? formatKz(r.amount_minor) : "—"}</td>
              <td className={`${td} text-mute`}>{r.status}{r.payment_method ? ` · ${r.payment_method}` : ""}</td>
              <td className={td}>
                <Badge tone={o.tone}>{o.label}</Badge>
                {r.outcome_detail && <span className="mt-1 block max-w-xs text-xs text-mute">{r.outcome_detail}</span>}
              </td>
              <td className={td}>
                {r.payment_id && <Link href={`/admin/pagamentos/${r.payment_id}`} className="text-xs text-gold-light hover:underline">Pagamento</Link>}
                {r.outcome === "awaiting_account" && (
                  <details className="mb-2">
                    <summary className="cursor-pointer text-xs text-gold-light hover:underline">Associar a uma conta</summary>
                    <ActionForm action={assignKursinhaSaleAction} className="mt-2 w-64 space-y-2">
                      <input type="hidden" name="saleId" value={r.sale_id} />
                      <input name="email" type="email" required placeholder="E-mail da conta AUREA" aria-label="E-mail da conta AUREA" className={`${inputClass} h-9 text-xs`} />
                      <input name="reason" required minLength={5} placeholder="Motivo (ex.: confirmado por WhatsApp)" aria-label="Motivo" className={`${inputClass} h-9 text-xs`} />
                      <button className="press rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-ink">Associar e ativar</button>
                    </ActionForm>
                  </details>
                )}
                {(r.outcome === "awaiting_account" || r.outcome === "no_matching_plan") && (
                  <form action={retryKursinhaSaleAction}>
                    <input type="hidden" name="saleId" value={r.sale_id} />
                    <button className="press text-xs text-gold-light hover:underline">Tentar de novo</button>
                  </form>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
