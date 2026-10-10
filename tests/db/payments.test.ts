import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
let admin: string;
let user: string;

type Json = Record<string, unknown>;
const svc = <T = Json>(sql: string, params: unknown[] = []) =>
  db.as("service_role", null, async () => (await db.query<T>(sql, params)).rows);

async function order(userId: string, plan: string) {
  const [p] = await svc<{ reference: string; amount_minor: number; id: string }>(
    "select * from public.create_payment_order($1, $2)",
    [userId, plan],
  );
  return p;
}
async function confirm(ref: string, amount: number, txn: string | null, source = "admin", actor: string | null = admin, evidence: string | null = "Extrato MCX verificado às 10h", eventId: string | null = null) {
  const [r] = await svc<{ r: Json }>("select public.confirm_payment($1,$2,$3,$4,$5,$6,$7) r", [ref, amount, txn, source, actor, evidence, eventId]);
  return r.r;
}
async function sub(userId: string) {
  const [s] = await svc<{ status: string; expires_at: Date; starts_at: Date }>("select * from public.subscriptions where user_id = $1", [userId]);
  return s;
}
async function premium(userId: string) {
  const [r] = await svc<{ ok: boolean }>("select public.has_premium_access($1) ok", [userId]);
  return r.ok;
}

beforeAll(async () => {
  db = await createDb();
  admin = await db.createUser("owner@aurea.test", { full_name: "Owner" });
  await db.query("insert into public.roles (user_id, role) values ($1, 'super_admin')", [admin]);
  user = await db.createUser("cliente@aurea.test", { full_name: "Cliente" });
});

describe("pedido de pagamento", () => {
  it("cria pedido pendente com o valor do plano (servidor) e assinatura pendente", async () => {
    const p = await order(user, "mensal");
    expect(p.reference).toMatch(/^AUR-[A-Z0-9]{8}$/);
    expect(Number(p.amount_minor)).toBe(500000);
    expect((await sub(user)).status).toBe("pending_payment");
    expect(await premium(user)).toBe(false);
  });

  it("reutiliza o pedido pendente em vez de duplicar", async () => {
    const a = await order(user, "mensal");
    const b = await order(user, "mensal");
    expect(a.id).toBe(b.id);
  });

  it("recusa plano inexistente", async () => {
    await expect(order(user, "vitalicio")).rejects.toThrow(/plan_not_available/);
  });

  it("o cliente indicar a transação NÃO ativa a assinatura", async () => {
    const p = await order(user, "mensal");
    await svc("select public.report_payment($1,$2,$3,$4)", [user, p.reference, "MCX123456", "Paguei agora"]);
    expect(await premium(user)).toBe(false);
    const [row] = await svc<{ status: string }>("select status from public.payments where id = $1", [p.id]);
    expect(row.status).toBe("pending");
  });
});

describe("confirmação", () => {
  it("rejeita referência inválida e regista o evento", async () => {
    const r = await confirm("AUR-XXXXXXXX", 500000, "TX-NOPE");
    expect(r).toMatchObject({ ok: false, error: "payment_not_found" });
    const [e] = await svc<{ n: number }>("select count(*)::int n from public.payment_events where type = 'rejected_unknown_reference'");
    expect(e.n).toBe(1);
  });

  it("rejeita valor incorreto (adulteração) e regista", async () => {
    const p = await order(user, "mensal");
    const r = await confirm(p.reference, 100, "TX-1");
    expect(r).toMatchObject({ ok: false, error: "amount_mismatch" });
    expect(await premium(user)).toBe(false);
  });

  it("exige evidência e papel super_admin no modo provisório", async () => {
    const p = await order(user, "mensal");
    expect(await confirm(p.reference, 500000, "TX-1", "admin", admin, "curto")).toMatchObject({ error: "evidence_required" });
    expect(await confirm(p.reference, 500000, "TX-1", "admin", user)).toMatchObject({ error: "forbidden" });
    expect(await confirm(p.reference, 500000, "TX-1", "admin", null)).toMatchObject({ error: "forbidden" });
    expect(await confirm(p.reference, 500000, null)).toMatchObject({ error: "transaction_id_required" });
  });

  it("confirma, ativa por 1 mês e é idempotente", async () => {
    const p = await order(user, "mensal");
    const r = await confirm(p.reference, 500000, "TX-1");
    expect(r).toMatchObject({ ok: true, status: "confirmed" });
    expect(await premium(user)).toBe(true);
    const s = await sub(user);
    expect(s.status).toBe("active");
    const days = (s.expires_at.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);

    expect(await confirm(p.reference, 500000, "TX-1")).toMatchObject({ ok: true, status: "already_confirmed" });
    expect(await confirm(p.reference, 500000, "TX-OTHER")).toMatchObject({ ok: false, error: "already_confirmed_other_txn" });
    const [periods] = await svc<{ n: number }>("select count(*)::int n from public.subscription_periods where user_id = $1", [user]);
    expect(periods.n).toBe(1);
  });

  it("impede reutilização de identificador de transação noutro pedido", async () => {
    const other = await db.createUser("outro@aurea.test");
    const p = await order(other, "mensal");
    expect(await confirm(p.reference, 500000, "TX-1")).toMatchObject({ ok: false, error: "transaction_reused" });
    expect(await premium(other)).toBe(false);
  });

  it("notificação duplicada do parceiro (mesmo event id) é ignorada", async () => {
    const u = await db.createUser("webhook@aurea.test");
    const p = await order(u, "trimestral");
    const a = await confirm(p.reference, 1200000, "PARTNER-9", "webhook", null, null, "evt_1");
    const b = await confirm(p.reference, 1200000, "PARTNER-9", "webhook", null, null, "evt_1");
    expect(a).toMatchObject({ ok: true, status: "confirmed" });
    expect(b).toMatchObject({ ok: true, status: "duplicate_event" });
    const s = await sub(u);
    const months = (s.expires_at.getTime() - Date.now()) / (30.4 * 86_400_000);
    expect(months).toBeGreaterThan(2.8);
    expect(months).toBeLessThan(3.2);
  });

  it("renovação manual soma o novo período à expiração atual", async () => {
    const before = (await sub(user)).expires_at.getTime();
    const p = await order(user, "anual");
    expect(Number(p.amount_minor)).toBe(3000000);
    expect(await confirm(p.reference, 3000000, "TX-RENEW")).toMatchObject({ ok: true });
    const after = (await sub(user)).expires_at.getTime();
    const days = (after - before) / 86_400_000;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(367);
  });

  it("pagamento rejeitado não dá acesso e exige motivo", async () => {
    const u = await db.createUser("rejeitado@aurea.test");
    const p = await order(u, "mensal");
    const [bad] = await svc<{ r: Json }>("select public.reject_payment($1,$2,$3) r", [p.id, admin, "x"]);
    expect(bad.r).toMatchObject({ error: "reason_required" });
    const [ok] = await svc<{ r: Json }>("select public.reject_payment($1,$2,$3) r", [p.id, admin, "Sem registo no extrato"]);
    expect(ok.r).toMatchObject({ ok: true });
    expect(await premium(u)).toBe(false);
    expect((await sub(u)).status).toBe("cancelled");
    expect(await confirm(p.reference, 500000, "TX-LATE")).toMatchObject({ error: "payment_not_pending" });
  });
});

describe("expiração e estados", () => {
  it("assinatura expirada perde o acesso imediatamente e o cron sincroniza o estado", async () => {
    const u = await db.createUser("expira@aurea.test");
    const p = await order(u, "mensal");
    await confirm(p.reference, 500000, "TX-EXP");
    expect(await premium(u)).toBe(true);
    await svc("update public.subscriptions set starts_at = now() - interval '40 days', expires_at = now() - interval '1 second' where user_id = $1", [u]);
    expect(await premium(u)).toBe(false);
    await svc("select public.expire_stale_records()");
    expect((await sub(u)).status).toBe("expired");
  });

  it("transições impossíveis são rejeitadas pela base de dados", async () => {
    const u = await db.createUser("estado@aurea.test");
    await order(u, "mensal");
    await expect(svc("update public.subscriptions set status = 'expired' where user_id = $1", [u])).rejects.toThrow();
    const [p] = await svc<{ id: string }>("select id from public.payments where user_id = $1", [u]);
    await expect(svc("update public.payments set status = 'reversed' where id = $1", [p.id])).rejects.toThrow(/invalid_payment_transition/);
    await expect(svc("update public.payments set amount_minor = 1 where id = $1", [p.id])).rejects.toThrow(/payment_immutable_fields/);
  });

  it("histórico financeiro não pode ser apagado; reversão é auditável", async () => {
    const u = await db.createUser("reverte@aurea.test");
    const p = await order(u, "mensal");
    await confirm(p.reference, 500000, "TX-REV");
    await expect(svc("delete from public.payments where id = $1", [p.id])).rejects.toThrow(/delete_forbidden/);
    const [r] = await svc<{ r: Json }>("select public.reverse_payment($1,$2,$3) r", [p.id, admin, "Estorno solicitado pelo banco"]);
    expect(r.r).toMatchObject({ ok: true });
    expect(await premium(u)).toBe(false);
    const [log] = await svc<{ n: number }>("select count(*)::int n from public.admin_audit_logs where action = 'payment.reverse'");
    expect(log.n).toBe(1);
    await expect(svc("delete from public.admin_audit_logs")).rejects.toThrow(/delete_forbidden/);
  });

  it("acesso manual exige motivo e expiração e fica auditado", async () => {
    const u = await db.createUser("cortesia@aurea.test");
    const [bad] = await svc<{ r: Json }>("select public.grant_manual_access($1, now() + interval '30 days', '', $2) r", [u, admin]);
    expect(bad.r).toMatchObject({ error: "reason_required" });
    const [notAdmin] = await svc<{ r: Json }>("select public.grant_manual_access($1, now() + interval '30 days', 'Parceria', $2) r", [u, user]);
    expect(notAdmin.r).toMatchObject({ error: "forbidden" });
    const [ok] = await svc<{ r: Json }>("select public.grant_manual_access($1, now() + interval '30 days', 'Parceria de conteúdo', $2) r", [u, admin]);
    expect(ok.r).toMatchObject({ ok: true });
    expect(await premium(u)).toBe(true);
    const [log] = await svc<{ n: number }>("select count(*)::int n from public.admin_audit_logs where action = 'subscription.manual_grant' and target_id = $1", [u]);
    expect(log.n).toBe(1);
  });

  it("conta suspensa perde o acesso premium", async () => {
    const u = await db.createUser("suspensa@aurea.test");
    await svc("select public.grant_manual_access($1, now() + interval '30 days', 'Teste suspensão', $2)", [u, admin]);
    const [r] = await svc<{ r: Json }>("select public.admin_set_account_status($1, 'suspended', 'Fraude suspeita', $2) r", [u, admin]);
    expect(r.r).toMatchObject({ ok: true });
    expect(await premium(u)).toBe(false);
  });
});
