import { formatKz } from "@/lib/pricing";
import type { TemplateKey, Vars } from "./templates";

/** Dados gravados no trabalho de e-mail (instantâneo do evento). */
export interface JobPayload {
  nome?: string | null;
  email?: string | null;
  user_id?: string | null;
  subscription_id?: string | null;
  payment_id?: string | null;
  reference?: string | null;
  amount_minor?: number | string | null;
  plan?: string | null;
  plan_code?: string | null;
  duration_months?: number | null;
  created_at?: string | null;
  confirmed_at?: string | null;
  status?: string | null;
  previous_status?: string | null;
  method?: string | null;
  provider?: string | null;
  transaction_id?: string | null;
  starts_at?: string | null;
  period_start?: string | null;
  expires_at?: string | null;
  milestone?: number | null;
  days_left?: number | null;
  mcx_recipient_phone?: string | null;
  mcx_recipient_name?: string | null;
  payment_instructions?: string | null;
}

const TZ = "Africa/Luanda";
const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });

export const fmtDate = (d: string | null | undefined) => (d ? dateFmt.format(new Date(d)) : "");
export const fmtDateTime = (d: string | null | undefined) => (d ? `${dateTimeFmt.format(new Date(d))} (Luanda)` : "");

/** Dias de calendário em Africa/Luanda entre hoje e a data de expiração. */
export function luandaDaysUntil(expiresAt: string | Date, now: Date = new Date()): number {
  const day = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    return Date.parse(`${p}T00:00:00Z`);
  };
  return Math.round((day(new Date(expiresAt)) - day(now)) / 86_400_000);
}

/** Data de calendário em Luanda (AAAA-MM-DD). */
export function luandaDate(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function luandaHour(now: Date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
}

const STATUS: Record<string, string> = {
  pending: "Pagamento pendente",
  confirmed: "Pagamento confirmado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
  expired: "Expirado",
  reversed: "Revertido",
};
const METHOD: Record<string, string> = { multicaixa_express: "Multicaixa Express", manual_grant: "Acesso concedido manualmente" };

export function planDuration(months: number | null | undefined) {
  if (!months) return "";
  if (months % 12 === 0) return months === 12 ? "1 ano" : `${months / 12} anos`;
  return months === 1 ? "1 mês" : `${months} meses`;
}

function firstName(full: string | null | undefined) {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

export interface VarContext {
  siteUrl: string;
  supportEmail: string;
  now?: Date;
}

export function buildVars(key: TemplateKey, p: JobPayload, ctx: VarContext): Vars {
  const site = ctx.siteUrl.replace(/\/$/, "");
  const nome = firstName(p.nome);
  const ref = p.reference ?? "";
  const days = p.expires_at ? Math.max(0, luandaDaysUntil(p.expires_at, ctx.now)) : null;
  const v: Vars = {
    saudacao: nome ? `Olá, ${nome}` : "Olá",
    nome,
    nome_completo: (p.nome ?? "").trim() || (p.email ?? ""),
    email: p.email ?? "",
    plano: p.plan ?? "",
    duracao: planDuration(p.duration_months),
    valor: p.amount_minor != null && p.amount_minor !== "" ? formatKz(BigInt(p.amount_minor)) : "",
    referencia_pagamento: ref,
    id_pedido: p.payment_id ?? "",
    data_pedido: fmtDateTime(p.created_at),
    estado: p.status ? (STATUS[p.status] ?? p.status) : "",
    estado_anterior: p.previous_status ? (STATUS[p.previous_status] ?? p.previous_status) : "",
    metodo: p.method ? (METHOD[p.method] ?? p.method) : "",
    mcx_numero: p.mcx_recipient_phone ?? "",
    mcx_titular: p.mcx_recipient_name ?? "",
    instrucoes_pagamento: p.payment_instructions ?? "",
    transacao: p.transaction_id ?? "",
    data_confirmacao: fmtDateTime(p.confirmed_at),
    data_ativacao: fmtDate(p.period_start ?? p.starts_at),
    data_expiracao: fmtDate(p.expires_at),
    // Calculado no momento do envio: um aviso atrasado mostra os dias reais.
    dias_restantes: days == null ? "" : String(days),
    id_utilizador: p.user_id ?? "",
    id_assinatura: p.subscription_id ?? "",
    link_conta: `${site}/app`,
    link_biblioteca: `${site}/app/biblioteca`,
    link_assinatura: `${site}/app/assinatura`,
    link_pagamento: ref ? `${site}/checkout/estado?ref=${encodeURIComponent(ref)}` : `${site}/app/pagamentos`,
    link_planos: `${site}/planos`,
    link_suporte: `${site}/suporte`,
    link_admin: p.payment_id ? `${site}/admin/pagamentos/${p.payment_id}` : `${site}/admin`,
    email_suporte: ctx.supportEmail,
  };
  if (key === "expired") v.dias_restantes = "0";
  return v;
}

/** Dados de demonstração para pré-visualização e envio de teste. Claramente fictícios. */
export function samplePayload(key: TemplateKey, now: Date = new Date()): JobPayload {
  const days = key.startsWith("expiring_") ? Number(key.split("_")[1]) : 30;
  const exp = new Date(now.getTime() + days * 86_400_000 + 3_600_000).toISOString();
  return {
    nome: "Cliente Demonstração",
    email: "cliente.demo@exemplo.invalid",
    user_id: "00000000-0000-4000-8000-000000000001",
    subscription_id: "00000000-0000-4000-8000-000000000002",
    payment_id: "00000000-0000-4000-8000-000000000003",
    reference: "AUR-DEMO0000",
    amount_minor: 500000,
    plan: "Mensal (demonstração)",
    plan_code: "mensal",
    duration_months: 1,
    created_at: now.toISOString(),
    confirmed_at: now.toISOString(),
    status: key === "admin_payment_confirmed" || key === "plan_activated" || key === "payment_receipt" ? "confirmed" : "pending",
    previous_status: "pending",
    method: "multicaixa_express",
    transaction_id: "DEMO-TRANSACAO",
    starts_at: now.toISOString(),
    period_start: now.toISOString(),
    expires_at: key === "expired" ? now.toISOString() : exp,
    milestone: key.startsWith("expiring_") ? days : null,
    mcx_recipient_phone: "+244 900 000 000 (demonstração)",
    mcx_recipient_name: "Titular de demonstração",
    payment_instructions: "Instruções de demonstração configuradas no painel.",
  };
}
