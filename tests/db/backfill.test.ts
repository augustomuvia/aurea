import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { processQueue, mergeNotificationSettings, type EmailJob, type QueueRepo } from "@/lib/notifications/engine";
import type { EmailProvider } from "@/lib/notifications/providers";
import { buildMime, type MimeMessage } from "@/lib/notifications/mime";
import { buildReceiptPdf, receiptFilename, receiptFromPayload } from "@/lib/receipts/receipt";
import type { TemplateKey } from "@/lib/notifications/templates";

/**
 * Envio aos clientes atuais (boas-vindas e pagamento confirmado com recibo).
 * Os "clientes atuais" são simulados criando contas e pagamentos com os e-mails
 * automáticos desligados, como antes de existirem.
 */

let db: Db;
let admin: string;
type Row = Record<string, unknown>;
const svc = <T = Row>(sql: string, params: unknown[] = []) => db.as("service_role", null, async () => (await db.query<T>(sql, params)).rows);

async function setEmails(flags: Record<string, boolean>) {
  await svc("update public.platform_settings set value = jsonb_set(value, '{emails}', (value -> 'emails') || $1::jsonb) where key = 'notifications'", [JSON.stringify(flags)]);
}
async function setTestMode(on: boolean) {
  await svc("update public.platform_settings set value = value || $1::jsonb where key = 'notifications'", [JSON.stringify({ test_mode: on })]);
}
async function user(email: string, name: string, confirmed = true) {
  const id = await db.createUser(email, { full_name: name });
  if (confirmed) await db.query("update auth.users set email_confirmed_at = now() where id = $1", [id]);
  return id;
}
let txn = 0;
async function paid(u: string, plan = "mensal") {
  const [p] = await svc<{ id: string; reference: string; amount_minor: number }>("select * from public.create_payment_order($1,$2)", [u, plan]);
  await svc("select public.confirm_payment($1,$2,$3,'admin',$4,'Extrato MCX verificado',null)", [p.reference, p.amount_minor, `TX-BF-${++txn}`, admin]);
  return p;
}
async function preview() {
  const [r] = await svc<{ r: { ok: boolean; welcome: { count: number; sample: string[]; enabled: boolean }; payment: { count: number; sample: string[]; enabled: boolean } } }>(
    "select public.notif_backfill_preview($1) r",
    [admin],
  );
  return r.r;
}
async function enqueue(kind: string, expected: number, actor = admin) {
  const [r] = await svc<{ r: { ok: boolean; error?: string; eligible?: number; enqueued?: number } }>("select public.notif_backfill_enqueue($1,$2,$3) r", [actor, kind, expected]);
  return r.r;
}
async function jobs(where: string, params: unknown[] = []) {
  return svc<{ id: string; template_key: string; status: string; to_email: string; payload: Row; idempotency_key: string; event_type: string; payment_id: string | null; last_error: string | null }>(
    `select * from public.email_jobs where ${where} order by created_at`,
    params,
  );
}

const repo: QueueRepo = {
  async claim(limit, worker, jobId) {
    return svc<EmailJob>("select * from public.claim_email_jobs($1,$2,$3)", [limit, worker, jobId ?? null]);
  },
  async staleReason(id) {
    const [r] = await svc<{ r: string | null }>("select public.email_job_stale_reason($1) r", [id]);
    return r.r;
  },
  async complete(id, outcome, r) {
    const [x] = await svc<{ r: string | null }>("select public.complete_email_job($1,$2,$3,$4,$5,$6,$7) r", [
      id, outcome, r.provider ?? null, r.messageId ?? null, r.error ?? null, r.permanent ?? false, r.durationMs ?? null,
    ]);
    return x.r;
  },
  async templates() {
    return {} as Partial<Record<TemplateKey, never>>;
  },
  async alert() {},
};
function fakeProvider(): EmailProvider & { sent: MimeMessage[] } {
  const sent: MimeMessage[] = [];
  return {
    id: "fake",
    label: "Fornecedor de teste",
    sent,
    missing: () => [],
    async send(m) {
      buildMime(m); // a mensagem tem de ser montável, com anexos
      sent.push(m);
      return { ok: true, messageId: `msg-${sent.length}` };
    },
  };
}
const settings = mergeNotificationSettings({});
/** Mesmo comportamento do servidor, com o recibo montado a partir dos dados do trabalho. */
const attachments = async (job: EmailJob) =>
  ["plan_activated", "payment_receipt"].includes(job.template_key)
    ? [{ filename: receiptFilename(String(job.payload.reference)), contentType: "application/pdf", content: buildReceiptPdf(receiptFromPayload(job.payload, { siteUrl: settings.site_url, supportEmail: settings.reply_to })) }]
    : [];

let ana: string, bruno: string, carla: string, pendente: string, suspenso: string, novo: string;
let payAna: { id: string; reference: string }, payBruno: { id: string; reference: string }, payReverted: { id: string };

beforeAll(async () => {
  db = await createDb();
  admin = await db.createUser("owner@aurea.test", { full_name: "Owner" });
  await svc("insert into public.roles (user_id, role) values ($1, 'super_admin')", [admin]);
  await db.query("update auth.users set email_confirmed_at = now() where id = $1", [admin]);

  // Antes dos e-mails automáticos: contas e pagamentos sem nenhum e-mail.
  await setEmails({ welcome: false, plan_activated: false });
  ana = await user("ana@cliente.ao", "Ana Paula");
  bruno = await user("bruno@cliente.ao", "Bruno Sá");
  carla = await user("carla@cliente.ao", "Carla Mendes");
  pendente = await user("pendente@cliente.ao", "Sem Confirmar", false);
  suspenso = await user("suspenso@cliente.ao", "Conta Suspensa");
  await svc("update public.profiles set status = 'suspended' where id = $1", [suspenso]);
  payAna = await paid(ana, "trimestral");
  payBruno = await paid(bruno);
  const rev = await paid(carla);
  await svc("select public.reverse_payment($1,$2,$3)", [rev.id, admin, "Estorno pedido pelo banco"]);
  payReverted = rev;
  // Pedido ainda pendente (não confirmado).
  await svc("select * from public.create_payment_order($1,'anual')", [carla]);
  // Pagamento de um admin (conta de teste/administração).
  await svc("select * from public.create_payment_order($1,'mensal')", [admin]).then(async ([p]) => {
    await svc("select public.confirm_payment($1,$2,$3,'admin',$4,'Teste do proprietário',null)", [(p as { reference: string }).reference, (p as { amount_minor: number }).amount_minor, "TX-ADMIN", admin]);
  });
  await setEmails({ welcome: true, plan_activated: true });

  // Cliente recente: já recebeu boas-vindas e "plano ativado" pelo fluxo normal.
  novo = await user("novo@cliente.ao", "Novo Cliente");
  await paid(novo);
  // Envio de teste para um cliente nunca conta como "já recebeu".
  await svc(
    "insert into public.email_jobs (idempotency_key, event_type, template_key, audience, to_email, user_id, is_test) values ('test:x', 'test', 'welcome', 'admin', 'ana@cliente.ao', $1, true)",
    [ana],
  );
});

describe("pré-visualização", () => {
  it("conta exatamente quem ainda não recebeu cada e-mail", async () => {
    const p = await preview();
    expect(p.ok).toBe(true);
    // Ana, Bruno, Carla. Fora: não confirmado, suspenso, administrador, cliente recente.
    expect(p.welcome.count).toBe(3);
    expect(p.welcome.sample.sort()).toEqual(["ana@cliente.ao", "bruno@cliente.ao", "carla@cliente.ao"]);
    // Ana e Bruno. Fora: revertido, pendente, pagamento do admin, cliente recente.
    expect(p.payment.count).toBe(2);
    expect(p.payment.sample.sort()).toEqual(["ana@cliente.ao", "bruno@cliente.ao"]);
    expect(p.welcome.enabled && p.payment.enabled).toBe(true);
  });

  it("só para administradores", async () => {
    const [r] = await svc<{ r: { ok: boolean; error: string } }>("select public.notif_backfill_preview($1) r", [ana]);
    expect(r.r).toEqual({ ok: false, error: "forbidden" });
    expect((await enqueue("welcome", 3, ana)).error).toBe("forbidden");
    await expect(db.as("authenticated", admin, () => db.query("select public.notif_backfill_preview($1)", [admin]))).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", admin, () => db.query("select public.notif_backfill_enqueue($1,'welcome',3)", [admin]))).rejects.toThrow(/permission denied/);
  });
});

describe("colocar na fila", () => {
  it("recusa se o total confirmado mudou, se o tipo está desligado ou em modo de teste", async () => {
    expect(await enqueue("welcome", 2)).toEqual({ ok: false, error: "count_changed", eligible: 3 });
    expect((await enqueue("outro", 0)).error).toBe("invalid_kind");
    await setEmails({ plan_activated: false });
    expect((await enqueue("payment", 2)).error).toBe("disabled");
    await setEmails({ plan_activated: true });
    await setTestMode(true);
    expect((await enqueue("welcome", 3)).error).toBe("test_mode");
    await setTestMode(false);
    expect(await jobs("event_type like 'backfill.%'")).toHaveLength(0);
  });

  it("boas-vindas: uma por cliente; repetir não acrescenta nada", async () => {
    expect(await enqueue("welcome", 3)).toEqual({ ok: true, eligible: 3, enqueued: 3 });
    const w = await jobs("event_type = 'backfill.welcome'");
    expect(w.map((j) => j.to_email).sort()).toEqual(["ana@cliente.ao", "bruno@cliente.ao", "carla@cliente.ao"]);
    expect(w.every((j) => j.template_key === "welcome" && j.status === "queued" && j.idempotency_key.startsWith("backfill:welcome:"))).toBe(true);
    expect(w.find((j) => j.to_email === "ana@cliente.ao")?.payload).toMatchObject({ nome: "Ana Paula", email: "ana@cliente.ao" });

    expect((await preview()).welcome.count).toBe(0);
    expect(await enqueue("welcome", 0)).toEqual({ ok: true, eligible: 0, enqueued: 0 });
    // Mesmo a pedir com o total antigo (duplo clique), nada é duplicado.
    expect((await enqueue("welcome", 3)).ok).toBe(false);
    expect(await jobs("event_type = 'backfill.welcome'")).toHaveLength(3);
    // Ninguém recebe duas boas-vindas.
    const dup = await svc<{ n: number }>("select count(*)::int n from public.email_jobs where template_key = 'welcome' and not is_test group by user_id having count(*) > 1");
    expect(dup).toHaveLength(0);
  });

  it("pagamentos: só confirmados e ainda sem e-mail, com os dados do recibo", async () => {
    expect(await enqueue("payment", 2)).toEqual({ ok: true, eligible: 2, enqueued: 2 });
    const pj = await jobs("event_type = 'backfill.payment_receipt'");
    expect(pj.map((j) => j.payment_id).sort()).toEqual([payAna.id, payBruno.id].sort());
    expect(pj.some((j) => j.payment_id === payReverted.id)).toBe(false);
    const a = pj.find((j) => j.payment_id === payAna.id)!;
    expect(a.template_key).toBe("payment_receipt");
    expect(a.idempotency_key).toBe(`backfill:payment:${payAna.id}`);
    expect(a.payload).toMatchObject({ reference: payAna.reference, plan: "Trimestral", duration_months: 3, amount_minor: 1200000, method: "multicaixa_express", status: "confirmed" });
    expect(a.payload.transaction_id).toMatch(/^TX-BF-/);
    expect(a.payload.period_start).toBeTruthy();
    expect(a.payload.expires_at).toBeTruthy();

    expect(await enqueue("payment", 0)).toEqual({ ok: true, eligible: 0, enqueued: 0 });
    expect(await jobs("event_type = 'backfill.payment_receipt'")).toHaveLength(2);
  });

  it("um pagamento confirmado depois disto segue pelo fluxo normal e não volta a ser elegível", async () => {
    const p = await paid(bruno);
    expect(await jobs("payment_id = $1 and template_key = 'plan_activated'", [p.id])).toHaveLength(1);
    expect((await preview()).payment.count).toBe(0);
  });

  it("fica registado na auditoria", async () => {
    const a = await svc<{ details: Row }>("select details from public.admin_audit_logs where action = 'notifications.backfill' order by created_at");
    expect(a.map((x) => x.details)).toEqual(
      expect.arrayContaining([
        { kind: "welcome", eligible: 3, enqueued: 3 },
        { kind: "payment", eligible: 2, enqueued: 2 },
      ]),
    );
  });
});

describe("envio", () => {
  it("transacionais saem antes dos envios aos clientes atuais", async () => {
    // Mesmo com os envios aos clientes atuais mais antigos na fila.
    await svc("update public.email_jobs set next_attempt_at = now() - interval '1 hour' where event_type like 'backfill.%'");
    const claimed = (await repo.claim(1, "teste")) as (EmailJob & { event_type: string })[];
    expect(claimed[0].event_type).not.toMatch(/^backfill\./);
    await repo.complete(claimed[0].id, "skipped", { error: "teste" });
  });

  it("envia com o recibo em PDF em anexo e descarta o de um pagamento entretanto revertido", async () => {
    await svc("select public.reverse_payment($1,$2,$3)", [payBruno.id, admin, "Estorno pedido pelo banco"]);
    const provider = fakeProvider();
    const r = await processQueue({ repo, provider, settings, active: true, limit: 100, attachments });
    expect(r.failed).toBe(0);

    const anaMail = provider.sent.find((m) => m.to === "ana@cliente.ao" && m.subject.includes(payAna.reference));
    expect(anaMail?.subject).toBe(`Pagamento confirmado — recibo ${payAna.reference}`);
    expect(anaMail?.attachments?.[0].filename).toBe(`Recibo-${payAna.reference}.pdf`);
    expect(Buffer.from(anaMail!.attachments![0].content).subarray(0, 5).toString()).toBe("%PDF-");
    const raw = buildMime(anaMail!);
    expect(raw).toMatch(/Content-Type: multipart\/mixed; boundary="aurea_mx_[0-9a-f]+"/);
    expect(raw).toContain(`Content-Disposition: attachment; filename="Recibo-${payAna.reference}.pdf"`);

    // O "plano ativado" do fluxo normal também leva o recibo.
    const activated = provider.sent.filter((m) => m.subject === "O seu plano AUREA está ativo!");
    expect(activated.length).toBeGreaterThan(0);
    expect(activated.every((m) => m.attachments?.[0]?.contentType === "application/pdf")).toBe(true);
    // Boas-vindas sem anexo.
    expect(provider.sent.filter((m) => m.subject.startsWith("Bem-vindo")).every((m) => !m.attachments)).toBe(true);

    const [b] = await jobs("payment_id = $1 and event_type = 'backfill.payment_receipt'", [payBruno.id]);
    expect(b.status).toBe("skipped");
    expect(b.last_error).toBe("O pagamento já não está confirmado");
  });

  it("falha ao gerar o anexo: não envia sem recibo e tenta de novo mais tarde", async () => {
    const p = await paid(ana);
    const provider = fakeProvider();
    const r = await processQueue({
      repo, provider, settings, active: true, limit: 100,
      attachments: async () => {
        throw new Error("base de dados indisponível");
      },
    });
    expect(r.retry).toBeGreaterThan(0);
    expect(provider.sent.some((m) => m.subject === "O seu plano AUREA está ativo!")).toBe(false);
    const [j] = await jobs("payment_id = $1 and template_key = 'plan_activated'", [p.id]);
    expect(j.status).toBe("retry_scheduled");
    expect(j.last_error).toMatch(/Erro ao gerar o anexo/);
  });
});
