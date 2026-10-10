import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
let admin: string;
let bob: string;
let premiumId: string;

const asUser = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) =>
  db.as("authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const svc = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.as("service_role", null, async () => (await db.query<T>(sql, params)).rows);

beforeAll(async () => {
  db = await createDb();
  admin = await db.createUser("owner-audio@aurea.test");
  await db.query("insert into public.roles (user_id, role) values ($1, 'super_admin')", [admin]);
  bob = await db.createUser("bob-audio@aurea.test");
  const [c] = await svc<{ id: string }>(
    `insert into public.content_items (slug, title, youtube_video_id, status, is_premium, published_at)
     values ('som-audio', 'Som com áudio', 'dQw4w9WgXcQ', 'published', true, now()) returning id`,
  );
  premiumId = c.id;
  await svc(
    "insert into public.content_media (content_id, youtube_url, youtube_video_id, audio_path) values ($1::uuid, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', $1::text || '/1700000000000.mp3')",
    [premiumId],
  );
});

describe("áudio próprio dos conteúdos", () => {
  it("o caminho do áudio só é visível a quem pode reproduzir", async () => {
    expect(await asUser(bob, "select audio_path from public.content_media")).toHaveLength(0);
    await svc("select public.grant_manual_access($1, now() + interval '30 days', 'Teste de áudio', $2)", [bob, admin]);
    const rows = await asUser<{ audio_path: string }>(bob, "select audio_path from public.content_media");
    expect(rows).toEqual([{ audio_path: `${premiumId}/1700000000000.mp3` }]);
  });

  it("utilizadores não alteram o áudio", async () => {
    await expect(asUser(bob, "update public.content_media set audio_path = null")).rejects.toThrow(/permission denied/);
  });

  it("caminhos fora da pasta do conteúdo ou com caracteres estranhos são recusados", async () => {
    await expect(svc("update public.content_media set audio_path = '../x.mp3' where content_id = $1", [premiumId])).rejects.toThrow(/check/);
    await expect(svc("update public.content_media set audio_path = $2 where content_id = $1", [premiumId, `${premiumId}/a b.mp3`])).rejects.toThrow(/check/);
  });

  it("conteúdo só com áudio (sem YouTube) é aceite e reproduzível por quem tem acesso", async () => {
    const [c] = await svc<{ id: string }>(
      "insert into public.content_items (slug, title, status, is_premium, published_at) values ('chuva-original', 'Chuva suave', 'published', true, now()) returning id",
    );
    await svc("insert into public.content_media (content_id, audio_path) values ($1::uuid, $1::text || '/1700000000001.mp3')", [c.id]);
    const rows = await asUser<{ content_id: string; youtube_video_id: string | null }>(bob, "select content_id, youtube_video_id from public.content_media where content_id = $1", [c.id]);
    expect(rows).toEqual([{ content_id: c.id, youtube_video_id: null }]);
  });

  it("um conteúdo precisa de pelo menos uma fonte (YouTube ou áudio)", async () => {
    const [c] = await svc<{ id: string }>("insert into public.content_items (slug, title) values ('sem-fonte', 'Sem fonte') returning id");
    await expect(svc("insert into public.content_media (content_id) values ($1)", [c.id])).rejects.toThrow(/content_media_has_source/);
    await expect(svc("update public.content_media set audio_path = null, youtube_video_id = null where content_id = $1", [premiumId])).rejects.toThrow(/content_media_has_source/);
  });
});

describe("áudio AUREA só nos planos Trimestral e Anual", () => {
  const subscribe = async (uid: string, code: string | null, expires = "now() + interval '30 days'") => {
    await svc(
      `insert into public.subscriptions (user_id, plan_id, status, starts_at, expires_at, payment_method, last_confirmed_at)
       values ($1::uuid, (select id from public.plans where code = $2::text), 'active', now() - interval '2 days', ${expires}, 'manual_grant', now())
       on conflict (user_id) do update set plan_id = excluded.plan_id, status = 'active', starts_at = excluded.starts_at, expires_at = excluded.expires_at`,
      [uid, code],
    );
  };
  const access = async (uid: string) =>
    (await asUser<{ ok: boolean; until: string | null }>(uid, "select public.has_own_audio_access($1) ok, public.own_audio_until($1) until", [uid]))[0];

  it("Trimestral e Anual incluem por omissão; Mensal não", async () => {
    const rows = await svc<{ code: string; includes_own_audio: boolean }>("select code, includes_own_audio from public.plans order by sort_order");
    expect(rows).toEqual([
      { code: "mensal", includes_own_audio: false },
      { code: "trimestral", includes_own_audio: true },
      { code: "anual", includes_own_audio: true },
    ]);
  });

  it("depende do plano ativo do utilizador", async () => {
    const u = await db.createUser("plano-audio@aurea.test");
    expect((await access(u)).ok).toBe(false);
    await subscribe(u, "mensal");
    expect(await access(u)).toEqual({ ok: false, until: null });
    await subscribe(u, "trimestral");
    const a = await access(u);
    expect(a.ok).toBe(true);
    expect(new Date(a.until!).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    await subscribe(u, "anual", "now() - interval '1 minute'");
    expect((await access(u)).ok).toBe(false);
  });

  it("acesso manual sem plano não inclui; super admin inclui", async () => {
    const u = await db.createUser("manual-audio@aurea.test");
    await subscribe(u, null);
    expect((await access(u)).ok).toBe(false);
    const a = await access(admin);
    expect(a.ok).toBe(true);
    expect(a.until).not.toBeNull();
  });

  it("um utilizador não consulta o acesso de outro", async () => {
    const u = await db.createUser("curioso-audio@aurea.test");
    const rows = await asUser<{ ok: boolean }>(u, "select public.has_own_audio_access($1) ok", [admin]);
    expect(rows[0].ok).toBe(false);
  });

  it("o admin pode ligar o áudio AUREA a outro plano", async () => {
    const u = await db.createUser("mensal-audio@aurea.test");
    await subscribe(u, "mensal");
    await svc("update public.plans set includes_own_audio = true where code = 'mensal'");
    expect((await access(u)).ok).toBe(true);
    await svc("update public.plans set includes_own_audio = false where code = 'mensal'");
  });

  it("a vantagem aparece nas características dos planos que a incluem", async () => {
    const rows = await svc<{ code: string; has: boolean }>(
      "select code, 'Áudios AUREA com o ecrã bloqueado e offline' = any (features) has from public.plans order by sort_order",
    );
    expect(rows.map((r) => r.has)).toEqual([false, true, true]);
  });
});
