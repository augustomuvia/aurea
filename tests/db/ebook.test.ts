import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
let alice: string;

beforeAll(async () => {
  db = await createDb();
  alice = await db.createUser("alice@aurea.test");
});

describe("configuração do e-book na base de dados", () => {
  it("visitantes e clientes não leem nem alteram a configuração", async () => {
    await db.as("service_role", null, () => db.query("insert into public.ebook_page (id, draft) values (1, '{\"priceMinor\": 250000}')"));
    await expect(db.as("anon", null, () => db.query("select * from public.ebook_page"))).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", alice, () => db.query("select * from public.ebook_page"))).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", alice, () => db.query("update public.ebook_page set enabled = true"))).rejects.toThrow(/permission denied/);
    await expect(db.as("anon", null, () => db.query("delete from public.ebook_page"))).rejects.toThrow(/permission denied/);
  });

  it("só existe uma linha e não pode ficar ativa sem versão publicada", async () => {
    await expect(db.as("service_role", null, () => db.query("insert into public.ebook_page (id) values (2)"))).rejects.toThrow(/check/);
    await expect(db.as("service_role", null, () => db.query("update public.ebook_page set enabled = true where id = 1"))).rejects.toThrow(/ebook_page_enabled_needs_published/);
    await db.as("service_role", null, () => db.query("update public.ebook_page set published = draft, published_at = now(), enabled = true where id = 1"));
    const r = await db.as("service_role", null, () => db.query<{ enabled: boolean }>("select enabled from public.ebook_page"));
    expect(r.rows[0].enabled).toBe(true);
  });

  it("eliminar a configuração remove a linha (página volta a fechada)", async () => {
    await db.as("service_role", null, () => db.query("delete from public.ebook_page where id = 1"));
    const r = await db.as("service_role", null, () => db.query("select * from public.ebook_page"));
    expect(r.rows).toHaveLength(0);
  });
});
