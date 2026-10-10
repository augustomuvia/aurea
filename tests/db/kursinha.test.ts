import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
type Json = Record<string, unknown>;
const svc = <T = Json>(sql: string, params: unknown[] = []) =>
  db.as("service_role", null, async () => (await db.query<T>(sql, params)).rows);

let n = 0;
function sale(over: Partial<Record<string, unknown>> = {}) {
  n += 1;
  return {
    event: "sale.approved",
    sale_id: `sale${n}`,
    order_id: `order${n}`,
    occurred_at: new Date(Date.UTC(2026, 9, 10, 10, 0, n)).toISOString(),
    product_id: "prod-aurea",
    product_name: "AUREA SOM",
    amount_minor: 500000,
    buyer_email: "comprador@aurea.test",
    buyer_name: "Comprador",
    payment_method: "reference",
    transaction_id: `TXN${n}`,
    raw: {},
    ...over,
  };
}
async function handle(p: Json, allowed = true) {
  const [r] = await svc<{ r: Json }>("select public.kursinha_handle_event($1::jsonb, $2) r", [JSON.stringify(p), allowed]);
  return r.r;
}
async function confirmedUser(email: string) {
  const r = await db.query<{ id: string }>(
    "insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id",
    [email],
  );
  return r.rows[0].id;
}
async function saleRow(id: string) {
  const [s] = await svc<{ outcome: string; status: string; user_id: string | null; payment_id: string | null }>(
    "select * from public.kursinha_sales where sale_id = $1",
    [id],
  );
  return s;
}
async function sub(userId: string) {
  const [s] = await svc<{ status: string; expires_at: Date }>("select * from public.subscriptions where user_id = $1", [userId]);
  return s;
}
async function premium(userId: string) {
  const [r] = await svc<{ ok: boolean }>("select public.has_premium_access($1) ok", [userId]);
  return r.ok;
}

beforeAll(async () => {
  db = await createDb();
});

describe("vendas Kursinha", () => {
  it("venda aprovada ativa o plano com o mesmo preço na conta com o e-mail confirmado", async () => {
    const user = await confirmedUser("comprador@aurea.test");
    const s = sale();
    expect(await handle(s)).toMatchObject({ ok: true, status: "activated" });
    const row = await saleRow(s.sale_id);
    expect(row.outcome).toBe("activated");
    expect(row.user_id).toBe(user);
    expect(await premium(user)).toBe(true);
    const [p] = await svc<{ provider: string; method: string; status: string; provider_transaction_id: string }>(
      "select * from public.payments where id = $1",
      [row.payment_id],
    );
    expect(p).toMatchObject({ provider: "kursinha", method: "kursinha", status: "confirmed", provider_transaction_id: `kursinha:${s.sale_id}` });
  });

  it("entrega repetida é ignorada e não estende o plano duas vezes", async () => {
    const user = await confirmedUser("repetida@aurea.test");
    const s = sale({ buyer_email: "repetida@aurea.test", amount_minor: 1200000 });
    await handle(s);
    const before = (await sub(user)).expires_at;
    expect(await handle(s)).toMatchObject({ ok: true, status: "duplicate" });
    expect((await sub(user)).expires_at).toEqual(before);
  });

  it("segunda venda aprovada estende a assinatura a partir da expiração atual", async () => {
    const user = await confirmedUser("renova@aurea.test");
    await handle(sale({ buyer_email: "renova@aurea.test" }));
    const first = new Date((await sub(user)).expires_at);
    await handle(sale({ buyer_email: "renova@aurea.test" }));
    const second = new Date((await sub(user)).expires_at);
    expect(second.getTime()).toBeGreaterThan(first.getTime() + 27 * 86_400_000);
  });

  it("valor que não corresponde a nenhum plano não ativa nada e alerta o admin", async () => {
    const user = await confirmedUser("ebook@aurea.test");
    const s = sale({ buyer_email: "ebook@aurea.test", amount_minor: 250000, product_name: "AUREA Guide" });
    expect(await handle(s)).toMatchObject({ ok: true, status: "no_matching_plan" });
    expect(await premium(user)).toBe(false);
    const [a] = await svc<{ c: number }>("select count(*)::int c from public.admin_notifications where kind = 'kursinha.no_plan'");
    expect(a.c).toBeGreaterThan(0);
  });

  it("produto fora da lista autorizada é só registado", async () => {
    const user = await confirmedUser("outro@aurea.test");
    const s = sale({ buyer_email: "outro@aurea.test" });
    expect(await handle(s, false)).toMatchObject({ ok: true, status: "ignored_product" });
    expect(await premium(user)).toBe(false);
  });

  it("sem conta: fica à espera e ativa quando o e-mail é confirmado", async () => {
    const s = sale({ buyer_email: "Nova@Aurea.test" });
    expect(await handle(s)).toMatchObject({ ok: true, status: "awaiting_account" });
    const {
      rows: [u],
    } = await db.query<{ id: string }>("insert into auth.users (email) values ('nova@aurea.test') returning id");
    expect(await premium(u.id)).toBe(false); // e-mail ainda por confirmar
    expect((await saleRow(s.sale_id)).outcome).toBe("awaiting_account");
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [u.id]);
    expect((await saleRow(s.sale_id)).outcome).toBe("activated");
    expect(await premium(u.id)).toBe(true);
  });

  it("conta com e-mail não confirmado não recebe a venda", async () => {
    await db.query("insert into auth.users (email) values ('naoconfirmado@aurea.test')");
    const s = sale({ buyer_email: "naoconfirmado@aurea.test" });
    expect(await handle(s)).toMatchObject({ ok: true, status: "awaiting_account" });
  });

  it("pendente depois de aprovada (fora de ordem) não altera nada", async () => {
    const user = await confirmedUser("ordem@aurea.test");
    const s = sale({ buyer_email: "ordem@aurea.test" });
    await handle(s);
    expect(await handle({ ...s, event: "sale.pending" })).toMatchObject({ ok: true, status: "ignored_out_of_order" });
    expect((await saleRow(s.sale_id)).status).toBe("approved");
    expect(await premium(user)).toBe(true);
  });

  it("pendente e depois aprovada ativa", async () => {
    const user = await confirmedUser("pend@aurea.test");
    const s = sale({ buyer_email: "pend@aurea.test", event: "sale.pending" });
    expect(await handle(s)).toMatchObject({ status: "pending" });
    expect(await premium(user)).toBe(false);
    expect(await handle({ ...s, event: "sale.approved" })).toMatchObject({ status: "activated" });
    expect(await premium(user)).toBe(true);
  });

  it("cancelada (reembolso) depois de ativada reverte o acesso", async () => {
    const user = await confirmedUser("reembolso@aurea.test");
    const s = sale({ buyer_email: "reembolso@aurea.test" });
    await handle(s);
    expect(await premium(user)).toBe(true);
    expect(await handle({ ...s, event: "sale.cancelled" })).toMatchObject({ ok: true, status: "reversed" });
    expect(await premium(user)).toBe(false);
    expect((await saleRow(s.sale_id)).outcome).toBe("reversed");
    // Uma aprovação atrasada da mesma venda já não reativa.
    expect(await handle({ ...s, event: "sale.approved", sale_id: s.sale_id })).toMatchObject({ status: "duplicate" });
  });

  it("cancelada antes de aprovada é final", async () => {
    const user = await confirmedUser("cancel@aurea.test");
    const s = sale({ buyer_email: "cancel@aurea.test", event: "sale.cancelled" });
    expect(await handle(s)).toMatchObject({ status: "cancelled" });
    expect(await handle({ ...s, event: "sale.approved" })).toMatchObject({ status: "ignored_out_of_order" });
    expect(await premium(user)).toBe(false);
  });

  it("clientes não podem chamar as funções nem ler as vendas", async () => {
    const user = await confirmedUser("intruso@aurea.test");
    await expect(
      db.as("authenticated", user, () => db.query("select public.kursinha_handle_event('{}'::jsonb, true)")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", user, () => db.query("select public.kursinha_apply_sale('x')")),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", user, () => db.query("select * from public.kursinha_sales"))).rejects.toThrow(/permission denied/);
  });

  it("admin associa venda de e-mail diferente à conta certa e ativa o plano", async () => {
    const admin = await confirmedUser("admin-k@aurea.test");
    await db.query("insert into public.roles (user_id, role) values ($1, 'super_admin')", [admin]);
    const user = await confirmedUser("conta-real@aurea.test");
    const s = sale({ buyer_email: "outro-email@gmail.test" });
    expect(await handle(s)).toMatchObject({ status: "awaiting_account" });
    const assign = async (u: string, actor: string, reason = "Confirmado por WhatsApp") => {
      const [r] = await svc<{ r: Json }>("select public.kursinha_assign_sale($1,$2,$3,$4) r", [s.sale_id, u, actor, reason]);
      return r.r;
    };
    expect(await assign(user, user)).toMatchObject({ ok: false, error: "forbidden" });
    expect(await assign(user, admin, "x")).toMatchObject({ ok: false, error: "reason_required" });
    expect(await premium(user)).toBe(false);
    expect(await assign(user, admin)).toMatchObject({ ok: true, status: "activated" });
    expect(await premium(user)).toBe(true);
    expect(await saleRow(s.sale_id)).toMatchObject({ outcome: "activated", user_id: user });
    // Não pode ser associada duas vezes.
    expect(await assign(user, admin)).toMatchObject({ ok: false, error: "sale_not_awaiting" });
    const [a] = await svc<{ c: number }>("select count(*)::int c from public.admin_audit_logs where action = 'kursinha.assign' and target_id = $1", [s.sale_id]);
    expect(a.c).toBe(1);
  });

  it("clientes não podem associar vendas", async () => {
    const user = await confirmedUser("intruso2@aurea.test");
    await expect(
      db.as("authenticated", user, () => db.query("select public.kursinha_assign_sale('x', $1, $1, 'motivo')", [user])),
    ).rejects.toThrow(/permission denied/);
  });
});
