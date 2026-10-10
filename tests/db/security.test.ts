import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
let admin: string;
let alice: string;
let bob: string;
let freeId: string;
let premiumId: string;

const asUser = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) =>
  db.as("authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const asAnon = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.as("anon", null, async () => (await db.query<T>(sql, params)).rows);
const svc = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.as("service_role", null, async () => (await db.query<T>(sql, params)).rows);

beforeAll(async () => {
  db = await createDb();
  admin = await db.createUser("owner@aurea.test");
  await db.query("insert into public.roles (user_id, role) values ($1, 'super_admin')", [admin]);
  // Tentativa de escalar privilégios no registo via metadados: deve ser ignorada.
  alice = await db.createUser("alice@aurea.test", { full_name: "Alice", role: "super_admin", is_admin: true });
  bob = await db.createUser("bob@aurea.test", { full_name: "Bob" });

  const ins = async (slug: string, premium: boolean) => {
    const [c] = await svc<{ id: string }>(
      `insert into public.content_items (slug, title, youtube_video_id, status, is_premium, published_at)
       values ($1, $1, 'dQw4w9WgXcQ', 'published', $2, now()) returning id`,
      [slug, premium],
    );
    await svc("insert into public.content_media (content_id, youtube_url, youtube_video_id) values ($1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ')", [c.id]);
    return c.id;
  };
  freeId = await ins("som-livre", false);
  premiumId = await ins("som-premium", true);
});

describe("papéis e privilégios", () => {
  it("o registo nunca atribui super_admin", async () => {
    const roles = await svc("select * from public.roles where user_id = $1", [alice]);
    expect(roles).toHaveLength(0);
    const [r] = await svc<{ ok: boolean }>("select public.is_super_admin($1) ok", [alice]);
    expect(r.ok).toBe(false);
  });

  it("um utilizador não consegue inserir um papel", async () => {
    await expect(asUser(alice, "insert into public.roles (user_id, role) values ($1, 'super_admin')", [alice])).rejects.toThrow(/permission denied/);
  });

  it("um utilizador só pode alterar o seu nome, não o estado da conta", async () => {
    await asUser(alice, "update public.profiles set full_name = 'Alice M' where id = $1", [alice]);
    await expect(asUser(alice, "update public.profiles set status = 'active' where id = $1", [alice])).rejects.toThrow(/permission denied/);
    const changed = await asUser(alice, "update public.profiles set full_name = 'hack' where id = $1 returning id", [bob]);
    expect(changed).toHaveLength(0);
  });

  it("um utilizador não consegue criar/alterar assinatura ou pagamento", async () => {
    await expect(
      asUser(alice, "insert into public.subscriptions (user_id, status, starts_at, expires_at) values ($1, 'active', now(), now() + interval '1 year')", [alice]),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, "update public.subscriptions set expires_at = now() + interval '9 years'")).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, "update public.payments set status = 'confirmed'")).rejects.toThrow(/permission denied/);
  });

  it("um utilizador não consegue chamar funções privilegiadas diretamente", async () => {
    await expect(asUser(alice, "select public.grant_manual_access($1, now() + interval '1 year', 'eu mesmo', $1)", [alice])).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, "select public.confirm_payment('AUR-AAAAAAAA', 1, 'x', 'webhook')")).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, "select public.create_payment_order($1, 'mensal')", [alice])).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, "select public.admin_metrics(now() - interval '1 day', now())")).rejects.toThrow(/permission denied/);
  });

  it("um utilizador não lê dados privados de outros", async () => {
    expect(await asUser(alice, "select * from public.profiles")).toHaveLength(1);
    expect(await asUser(alice, "select * from public.payments where user_id = $1", [bob])).toHaveLength(0);
    await expect(asUser(alice, "select * from public.admin_audit_logs")).rejects.toThrow(/permission denied/);
    const [r] = await asUser<{ ok: boolean }>(alice, "select public.is_super_admin($1) ok", [admin]);
    expect(r.ok).toBe(false);
  });
});

describe("acesso a conteúdos", () => {
  it("anónimo vê metadados publicados mas não o vídeo", async () => {
    expect((await asAnon("select id from public.content_items")).length).toBe(2);
    await expect(asAnon("select * from public.content_media")).rejects.toThrow(/permission denied/);
  });

  it("sem assinatura: só o vídeo gratuito", async () => {
    const rows = await asUser<{ content_id: string }>(bob, "select content_id from public.content_media");
    expect(rows.map((r) => r.content_id)).toEqual([freeId]);
  });

  it("com assinatura ativa: também o premium", async () => {
    await svc("select public.grant_manual_access($1, now() + interval '30 days', 'Teste de acesso', $2)", [bob, admin]);
    const rows = await asUser<{ content_id: string }>(bob, "select content_id from public.content_media order by content_id");
    expect(rows.map((r) => r.content_id).sort()).toEqual([freeId, premiumId].sort());
  });

  it("após expiração o premium volta a estar bloqueado", async () => {
    await svc("update public.subscriptions set starts_at = now() - interval '60 days', expires_at = now() - interval '1 minute' where user_id = $1", [bob]);
    const rows = await asUser<{ content_id: string }>(bob, "select content_id from public.content_media");
    expect(rows.map((r) => r.content_id)).toEqual([freeId]);
  });

  it("conteúdo despublicado deixa de ser visível", async () => {
    await svc("update public.content_items set status = 'unpublished' where id = $1", [freeId]);
    expect(await asUser(bob, "select * from public.content_media")).toHaveLength(0);
    expect(await asAnon("select * from public.content_items where id = $1", [freeId])).toHaveLength(0);
  });

  it("favoritos só do próprio", async () => {
    await asUser(alice, "insert into public.favorites (user_id, content_id) values ($1, $2)", [alice, premiumId]);
    await expect(asUser(alice, "insert into public.favorites (user_id, content_id) values ($1, $2)", [bob, premiumId])).rejects.toThrow(/row-level security/);
    expect(await asUser(bob, "select * from public.favorites")).toHaveLength(0);
  });

  it("histórico de reprodução premium é recusado sem direito", async () => {
    await expect(svc("select public.record_playback($1, $2, 10, 100, true)", [alice, premiumId])).rejects.toThrow(/forbidden/);
  });
});

describe("encerramento de conta", () => {
  it("apaga dados pessoais mas preserva o histórico financeiro", async () => {
    const u = await db.createUser("sair@aurea.test", { full_name: "Sair" });
    const [p] = await svc<{ id: string; reference: string }>("select * from public.create_payment_order($1, 'mensal')", [u]);
    await svc("select public.confirm_payment($1, 500000, 'TX-SAIR', 'admin', $2, 'Extrato verificado manualmente')", [p.reference, admin]);
    await db.query("delete from auth.users where id = $1", [u]); // como o serviço de autenticação
    expect(await svc("select * from public.profiles where id = $1", [u])).toHaveLength(0);
    const [pay] = await svc<{ user_id: string | null; status: string }>("select user_id, status from public.payments where id = $1", [p.id]);
    expect(pay).toEqual({ user_id: null, status: "confirmed" });
  });
});

describe("registos append-only", () => {
  it("eventos e auditoria não podem ser editados", async () => {
    await expect(svc("update public.payment_events set type = 'confirmed'")).rejects.toThrow(/update_forbidden/);
    await expect(svc("update public.admin_audit_logs set reason = 'apagado'")).rejects.toThrow(/update_forbidden/);
  });
});
