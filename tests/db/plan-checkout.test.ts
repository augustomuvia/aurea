import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
beforeAll(async () => {
  db = await createDb();
});

describe("link de checkout por plano", () => {
  it("aceita https e vazio, recusa outros esquemas", async () => {
    await db.query("update public.plans set checkout_url = 'https://app.kursinha.com/checkout/abc' where code = 'mensal'");
    await db.query("update public.plans set checkout_url = null where code = 'mensal'");
    await expect(db.query("update public.plans set checkout_url = 'http://kursinha.com/x' where code = 'mensal'")).rejects.toThrow(/plans_checkout_url_https/);
    await expect(db.query("update public.plans set checkout_url = 'javascript:alert(1)' where code = 'mensal'")).rejects.toThrow(/plans_checkout_url_https/);
  });
});
