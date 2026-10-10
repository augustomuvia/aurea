import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Reproduz o mínimo do ambiente Supabase (papéis, schema auth, privilégios por omissão)
// para executar as migrações reais contra um PostgreSQL em memória.
const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export type Db = PGlite & {
  as: <T>(role: "anon" | "authenticated" | "service_role", userId: string | null, fn: () => Promise<T>) => Promise<T>;
  createUser: (email: string, meta?: Record<string, unknown>) => Promise<string>;
};

export async function createDb(): Promise<Db> {
  const db = new PGlite() as Db;
  await db.exec(SUPABASE_STUB);
  const dir = join(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(readFileSync(join(__dirname, "../../supabase/seed.sql"), "utf8"));

  db.as = async (role, userId, fn) => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false); set role ${role};`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  };
  db.createUser = async (email, meta = {}) => {
    const r = await db.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, JSON.stringify(meta)],
    );
    return r.rows[0].id;
  };
  return db;
}
