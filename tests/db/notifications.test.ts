import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";
import { processQueue, mergeNotificationSettings, type EmailJob, type QueueRepo } from "@/lib/notifications/engine";
import type { EmailProvider, SendResult } from "@/lib/notifications/providers";
import type { MimeMessage } from "@/lib/notifications/mime";
import { renderEmail } from "@/lib/notifications/render";
import { buildVars } from "@/lib/notifications/vars";
import { TEMPLATES, type TemplateKey } from "@/lib/notifications/templates";

let db: Db;
let admin: string;

type Row = Record<string, unknown>;
const svc = <T = Row>(sql: string, params: unknown[] = []) => db.as("service_role", null, async () => (await db.query<T>(sql, params)).rows);
const DAY = 86_400_000;

async function jobs(where = "true", params: unknown[] = []) {
  return svc<{ id: string; template_key: string; status: string; to_email: string; payload: Row; attempts: number; last_error: string | null; audience: string; idempotency_key: string }>(
    `select * from public.email_jobs where ${where} order by created_at`,
    params,
  );
}
async function newUser(email: string, name = "Ana Teste") {
  return db.createUser(email, { full_name: name });
}
async function order(user: string, plan = "mensal") {
  const [p] = await svc<{ id: string; reference: string; amount_minor: number }>("select * from public.create_payment_order($1,$2)", [user, plan]);
  return p;
}
let txn = 0;
async function confirm(ref: string, amount: number, t = `TX-${++txn}-${Date.now()}`) {
  const [r] = await svc<{ r: Row }>("select public.confirm_payment($1,$2,$3,'admin',$4,'Extrato MCX verificado hoje',null) r", [ref, amount, t, admin]);
  return { ...r.r, txn: t };
}
async function activeUser(email: string, expiresAt: Date) {
  const u = await newUser(email);
  const p = await order(u);
  await confirm(p.reference, Number(p.amount_minor));
  await svc("update public.subscriptions set starts_at = least(starts_at, $2::timestamptz - interval '30 days'), expires_at = $2 where user_id = $1", [u, expiresAt.toISOString()]);
  const [s] = await svc<{ id: string }>("select id from public.subscriptions where user_id = $1", [u]);
  return { user: u, sub: s.id };
}
async function scan(now: Date) {
  const [r] = await svc<{ r: { eligible: number; created: number } }>("select public.enqueue_expiry_reminders($1) r", [now.toISOString()]);
  return r.r;
}
async function setNotifSettings(patch: Row) {
  await svc("update public.platform_settings set value = value || $1::jsonb where key = 'notifications'", [JSON.stringify(patch)]);
}

/** Repositório da fila sobre a base de dados de teste (as mesmas funções SQL que em produção). */
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
    const rows = await svc<{ key: TemplateKey; subject: string; heading: string; body: string; cta_label: string }>("select * from public.email_templates");
    return Object.fromEntries(rows.map((t) => [t.key, t]));
  },
  async alert(kind, title, body, dedupe) {
    await svc("select public.notify_admin($1,'error',$2,$3,'/admin/notificacoes',$4)", [kind, title, body, dedupe]);
  },
};

function fakeProvider(behaviour: (m: MimeMessage) => SendResult = () => ({ ok: true, messageId: `msg-${Math.random().toString(36).slice(2)}` })): EmailProvider & { sent: MimeMessage[] } {
  const sent: MimeMessage[] = [];
  return {
    id: "fake",
    label: "Fornecedor de teste",
    sent,
    missing: () => [],
    async send(m) {
      const r = behaviour(m);
      if (r.ok) sent.push(m);
      return r;
    },
  };
}
const settings = () => mergeNotificationSettings({});
async function drain(provider: EmailProvider, opts: { active?: boolean; settings?: ReturnType<typeof settings> } = {}) {
  return processQueue({ repo, provider, settings: opts.settings ?? settings(), active: opts.active ?? true, limit: 100 });
}
async function markAllDone() {
  // Isola os testes de envio: tudo o que já está na fila fica fora do caminho.
  await svc("update public.email_jobs set status = 'skipped', completed_at = now() where status in ('queued','retry_scheduled')");
}

beforeAll(async () => {
  db = await createDb();
  admin = await db.createUser("owner@aurea.test", { full_name: "Owner" });
  await svc("insert into public.roles (user_id, role) values ($1, 'super_admin')", [admin]);
  await svc(
    `update public.platform_settings set value = value || '{"mcx_recipient_phone": "+244 923 000 111", "mcx_recipient_name": "AUREA Lda", "instructions": "Indique a referência na descrição."}'::jsonb where key = 'payment'`,
  );
});

describe("1. boas-vindas", () => {
  it("só depois de confirmar o e-mail, e uma única vez", async () => {
    const u = await newUser("novo@aurea.test", "Joana Silva");
    expect(await jobs("user_id = $1", [u])).toHaveLength(0);

    // auth.users é gerido pelo Supabase Auth (aqui, pelo superutilizador de teste).
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [u]);
    // Reprocessamentos: nova confirmação, atualização de perfil, callback repetido.
    await db.query("update auth.users set email_confirmed_at = now() + interval '1 second' where id = $1", [u]);
    await svc("update public.profiles set full_name = 'Joana S.' where id = $1", [u]);
    await svc("select public.emit_event('user.registered', 'welcome:' || $1, $1::uuid, null, null, '{}'::jsonb)", [u]);

    const w = await jobs("user_id = $1 and template_key = 'welcome'", [u]);
    expect(w).toHaveLength(1);
    expect(w[0].to_email).toBe("novo@aurea.test");
    const n = await svc("select * from public.notifications where user_id = $1 and kind = 'account_created'", [u]);
    expect(n).toHaveLength(1);
  });

  it("conta criada já confirmada também recebe (uma vez)", async () => {
    const r = await db.query<{ id: string }>("insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ('confirmado@aurea.test', now(), '{}') returning id");
    expect(await jobs("user_id = $1 and template_key = 'welcome'", [r.rows[0].id])).toHaveLength(1);
  });

  it("o texto não promete assinatura ativa", async () => {
    const [j] = await jobs("template_key = 'welcome'");
    const vars = buildVars("welcome", j.payload, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
    const r = renderEmail("welcome", TEMPLATES.welcome.defaults, vars, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
    expect(r.subject).toBe("Bem-vindo à AUREA — a sua experiência começa aqui");
    expect(r.text).toContain("Olá, Joana");
    expect(r.text).toMatch(/assinatura ativa/);
    expect(r.text).not.toMatch(/assinatura (está|foi) ativ/);
    expect(r.text).toMatch(/Se não criou esta conta/);
  });
});

describe("2–3. pedido de pagamento", () => {
  let user: string;
  let pay: { id: string; reference: string; amount_minor: number };

  it("gera e-mail ao cliente, notificação interna e aviso à administração", async () => {
    user = await newUser("cliente@aurea.test", "Carlos Mendes");
    pay = await order(user);
    const j = await jobs("payment_id = $1", [pay.id]);
    expect(j.map((x) => x.template_key).sort()).toEqual(["admin_payment_requested", "payment_requested"]);
    const toClient = j.find((x) => x.template_key === "payment_requested")!;
    expect(toClient.to_email).toBe("cliente@aurea.test");
    expect(toClient.payload).toMatchObject({ reference: pay.reference, amount_minor: 500000, plan: "Mensal", mcx_recipient_phone: "+244 923 000 111" });
    expect(j.find((x) => x.template_key === "admin_payment_requested")!.to_email).toBe("suporte@aurea-som.site");

    const [n] = await svc<{ link: string; category: string }>("select * from public.notifications where user_id = $1 and kind = 'payment_requested'", [user]);
    expect(n).toMatchObject({ category: "pagamento", link: `/checkout/estado?ref=${pay.reference}` });
    const a = await svc("select * from public.admin_notifications where dedupe_key = $1", [`payment.requested:${pay.id}`]);
    expect(a).toHaveLength(1);
  });

  it("um pedido reutilizado não gera e-mails repetidos", async () => {
    const again = await order(user);
    expect(again.id).toBe(pay.id);
    expect(await jobs("payment_id = $1", [pay.id])).toHaveLength(2);
  });

  it("o e-mail mostra os dados do pedido e as instruções configuradas, sem declarar pagamento concluído", async () => {
    const [j] = await jobs("payment_id = $1 and template_key = 'payment_requested'", [pay.id]);
    const vars = buildVars("payment_requested", j.payload, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
    const r = renderEmail("payment_requested", TEMPLATES.payment_requested.defaults, vars, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
    expect(r.subject).toBe("Pedido de pagamento recebido — AUREA");
    for (const s of [pay.reference, "5.000 Kz", "Mensal", "Pagamento pendente", "Multicaixa Express", "+244 923 000 111", "AUREA Lda", "Indique a referência", "Olá, Carlos", `https://www.aurea-som.site/checkout/estado?ref=${pay.reference}`]) {
      expect(r.text).toContain(s);
    }
    expect(r.text).toMatch(/Aguarde a nossa confirmação/);
    expect(r.text).not.toMatch(/pagamento (foi )?confirmado|está ativ|foi ativad/i);
    expect(r.html).toContain(pay.reference);
  });

  it("comprovativo enviado gera 'em validação' e alerta, mas nenhuma confirmação", async () => {
    await svc("select public.report_payment($1,$2,'MCX-998877','Paguei agora')", [user, pay.reference]);
    await svc("select public.report_payment($1,$2,'MCX-998877','De novo')", [user, pay.reference]);
    const j = await jobs("payment_id = $1", [pay.id]);
    expect(j.filter((x) => x.template_key === "payment_under_review")).toHaveLength(1);
    expect(j.some((x) => ["plan_activated", "admin_payment_confirmed"].includes(x.template_key))).toBe(false);
    const [prem] = await svc<{ ok: boolean }>("select public.has_premium_access($1) ok", [user]);
    expect(prem.ok).toBe(false);
    const [a] = await svc<{ title: string; severity: string }>("select * from public.admin_notifications where dedupe_key = $1", [`payment.proof:${pay.id}`]);
    expect(a.title).toMatch(/Comprovativo recebido/);
  });

  it("4. a aprovação gera e-mail ao admin, ativação ao cliente, notificações e auditoria", async () => {
    const r = await confirm(pay.reference, 500000, "MCX-998877");
    expect(r).toMatchObject({ ok: true, status: "confirmed" });
    const j = await jobs("payment_id = $1 and template_key in ('admin_payment_confirmed','plan_activated')", [pay.id]);
    expect(j.map((x) => x.template_key).sort()).toEqual(["admin_payment_confirmed", "plan_activated"]);
    const adminJob = j.find((x) => x.template_key === "admin_payment_confirmed")!;
    expect(adminJob.to_email).toBe("suporte@aurea-som.site");
    const [sub] = await svc<{ id: string; status: string; expires_at: Date }>("select * from public.subscriptions where user_id = $1", [user]);
    expect(sub.status).toBe("active");
    expect(adminJob.payload).toMatchObject({ previous_status: "pending", status: "confirmed", transaction_id: "MCX-998877", subscription_id: sub.id });
    expect(new Date(adminJob.payload.expires_at as string).getTime()).toBe(new Date(sub.expires_at).getTime());

    const notes = await svc<{ kind: string; category: string; link: string }>("select kind, category, link from public.notifications where user_id = $1 order by created_at", [user]);
    expect(notes.find((n) => n.kind === "payment_confirmed")).toMatchObject({ category: "pagamento", link: "/app/pagamentos" });
    expect(notes.find((n) => n.kind === "plan_activated")).toMatchObject({ category: "biblioteca", link: "/app/biblioteca" });
    const audit = await svc("select * from public.admin_audit_logs where action = 'payment.confirm' and target_id = $1", [pay.id]);
    expect(audit).toHaveLength(1);

    const vars = buildVars("admin_payment_confirmed", adminJob.payload, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
    const mail = renderEmail("admin_payment_confirmed", TEMPLATES.admin_payment_confirmed.defaults, vars, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
    expect(mail.subject).toBe(`[AUREA] Pagamento confirmado — ${pay.reference}`);
    for (const s of ["Carlos Mendes", "cliente@aurea.test", user, "MCX-998877", pay.id, "5.000 Kz", "Multicaixa Express", "Pagamento pendente", "Pagamento confirmado", sub.id, `/admin/pagamentos/${pay.id}`]) {
      expect(mail.text).toContain(s);
    }
    const act = j.find((x) => x.template_key === "plan_activated")!;
    const av = buildVars("plan_activated", act.payload, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
    const am = renderEmail("plan_activated", TEMPLATES.plan_activated.defaults, av, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
    expect(am.subject).toBe("O seu plano AUREA está ativo!");
    expect(am.text).toContain(av.data_expiracao!);
    expect(am.text).toContain("1 mês");
    expect(am.text).toMatch(/renovação da AUREA é manual/);
  });

  it("5. repetir a aprovação não reenvia nem prolonga", async () => {
    const before = await svc<{ expires_at: Date }>("select expires_at from public.subscriptions where user_id = $1", [user]);
    const count = (await jobs()).length;
    const r = await confirm(pay.reference, 500000, "MCX-998877");
    expect(r).toMatchObject({ ok: true, status: "already_confirmed" });
    expect((await jobs()).length).toBe(count);
    const after = await svc<{ expires_at: Date }>("select expires_at from public.subscriptions where user_id = $1", [user]);
    expect(after[0].expires_at).toEqual(before[0].expires_at);
    const act = await svc("select * from public.notifications where user_id = $1 and kind = 'plan_activated'", [user]);
    expect(act).toHaveLength(1);
  });
});

describe("6–11. avisos de expiração", () => {
  // Expira dia 20 às 15:00 em Luanda (14:00 UTC).
  const E = new Date("2026-11-20T14:00:00Z");
  const at = (days: number, hourUtc = 7) => new Date(Date.UTC(2026, 10, 20 - days, hourUtc, 0, 0));
  let sub: string;
  let user: string;

  beforeAll(async () => {
    ({ user, sub } = await activeUser("expira@aurea.test", E));
  });

  for (const m of [10, 5, 3, 1] as const) {
    it(`aviso a ${m} ${m === 1 ? "dia" : "dias"} (dia ${20 - m})`, async () => {
      const r = await scan(at(m));
      expect(r.created).toBeGreaterThanOrEqual(1);
      const j = await jobs("subscription_id = $1 and template_key = $2", [sub, `expiring_${m}`]);
      expect(j).toHaveLength(1);
      expect(j[0].payload).toMatchObject({ milestone: m, days_left: m });
      const vars = buildVars(`expiring_${m}`, j[0].payload, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site", now: at(m) });
      expect(vars.dias_restantes).toBe(String(m));
      expect(vars.data_expiracao).toBe("20 de novembro de 2026");
      const mail = renderEmail(`expiring_${m}`, TEMPLATES[`expiring_${m}`].defaults, vars, { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site" });
      const subjects = {
        10: "A sua assinatura AUREA termina daqui a 10 dias",
        5: "Faltam 5 dias para terminar a sua assinatura AUREA",
        3: "A sua assinatura AUREA está perto de expirar",
        1: "Último dia da sua assinatura AUREA",
      };
      expect(mail.subject).toBe(subjects[m]);
      expect(mail.text).toContain("20 de novembro de 2026");
      expect(mail.text).toContain("https://www.aurea-som.site/app/assinatura");
      expect(mail.text).toMatch(/renovação da AUREA é manual/);
      expect(mail.text).not.toMatch(/renovad[ao] automaticamente/i);
      const n = await svc("select * from public.notifications where user_id = $1 and kind = 'subscription_expiring' and dedupe_key like $2", [user, `expiring:${sub}:${m}:%`]);
      expect(n).toHaveLength(1);
    });
  }

  it("dias fora dos marcos não geram avisos", async () => {
    const before = (await jobs("subscription_id = $1", [sub])).length;
    for (const d of [8, 7, 6, 12]) await scan(at(d));
    expect((await jobs("subscription_id = $1", [sub])).length).toBe(before);
  });

  it("10. cada marco só uma vez, mesmo com processamentos repetidos ou simultâneos", async () => {
    await Promise.all([scan(at(10)), scan(at(10)), scan(at(9)), scan(at(5)), scan(at(4)), scan(at(1)), scan(at(0, 8))]);
    for (const m of [10, 5, 3, 1]) {
      expect(await jobs("subscription_id = $1 and template_key = $2", [sub, `expiring_${m}`])).toHaveLength(1);
    }
    const dup = await svc<{ n: number }>("select count(*)::int n from public.notifications where user_id = $1 and kind = 'subscription_expiring'", [user]);
    expect(dup[0].n).toBe(4);
  });

  it("não avisa assinaturas expiradas, suspensas, canceladas ou de contas suspensas", async () => {
    const a = await activeUser("suspensa@aurea.test", E);
    await svc("select public.admin_set_subscription_status($1,'suspended','Teste de suspensão',$2)", [a.user, admin]);
    const b = await activeUser("cancelada@aurea.test", E);
    await svc("select public.admin_set_subscription_status($1,'cancelled','Teste de cancelamento',$2)", [b.user, admin]);
    const c = await activeUser("contasuspensa@aurea.test", E);
    await svc("update public.profiles set status = 'suspended' where id = $1", [c.user]);
    const d = await activeUser("jaexpirou@aurea.test", new Date(at(5).getTime() - 60_000));
    await scan(at(5));
    for (const x of [a, b, c, d]) expect(await jobs("subscription_id = $1 and template_key like 'expiring%'", [x.sub])).toHaveLength(0);
  });

  it("respeita a preferência de lembretes por e-mail (a notificação interna mantém-se)", async () => {
    const x = await activeUser("semlembretes@aurea.test", E);
    await svc("update public.user_preferences set reminder_emails = false where user_id = $1", [x.user]);
    await scan(at(3));
    expect(await jobs("subscription_id = $1 and template_key like 'expiring%'", [x.sub])).toHaveLength(0);
    expect(await svc("select * from public.notifications where user_id = $1 and kind = 'subscription_expiring'", [x.user])).toHaveLength(1);
  });

  it("11. renovar invalida os avisos antigos e recalcula pela nova data", async () => {
    const now = new Date();
    const exp = new Date(now.getTime() + 5 * DAY);
    const x = await activeUser("renova@aurea.test", exp);
    await scan(now);
    const [old] = await jobs("subscription_id = $1 and template_key = 'expiring_5'", [x.sub]);
    expect(old.status).toBe("queued");

    const p = await order(x.user, "trimestral");
    await confirm(p.reference, Number(p.amount_minor));
    const [o2] = await jobs("id = $1", [old.id]);
    expect(o2.status).toBe("skipped");
    expect(o2.last_error).toMatch(/renovada/);

    const [s] = await svc<{ expires_at: Date }>("select expires_at from public.subscriptions where id = $1", [x.sub]);
    expect(new Date(s.expires_at).getTime()).toBeGreaterThan(exp.getTime() + 80 * DAY);
    await scan(now);
    expect(await jobs("subscription_id = $1 and template_key like 'expiring%' and status <> 'skipped'", [x.sub])).toHaveLength(0);
    // Novo ciclo: os avisos voltam a sair para a nova data.
    await scan(new Date(new Date(s.expires_at).getTime() - 10 * DAY));
    const fresh = await jobs("subscription_id = $1 and template_key = 'expiring_10'", [x.sub]);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].idempotency_key).not.toBe(old.idempotency_key);
  });

  it("um aviso cuja data foi alterada (prolongamento manual) é descartado no envio", async () => {
    await markAllDone();
    const now = new Date();
    const x = await activeUser("prolonga@aurea.test", new Date(now.getTime() + 3 * DAY));
    await scan(now);
    await svc("update public.subscriptions set expires_at = expires_at + interval '30 days' where id = $1", [x.sub]);
    const provider = fakeProvider();
    const r = await drain(provider);
    expect(provider.sent.filter((m) => m.to === "prolonga@aurea.test" && /expirar/.test(m.subject))).toHaveLength(0);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    const [j] = await jobs("subscription_id = $1 and template_key = 'expiring_3'", [x.sub]);
    expect(j.status).toBe("skipped");
    expect(j.last_error).toMatch(/renovada|alterada/);
  });

  it("plano expirado: opcional (desligado por omissão), só depois de expirar de facto", async () => {
    const off = await activeUser("expirado1@aurea.test", new Date(Date.now() - 60_000));
    await svc("select public.expire_stale_records()");
    expect(await jobs("subscription_id = $1 and template_key = 'expired'", [off.sub])).toHaveLength(0);

    await setNotifSettings({ emails: { ...settings().emails, expired: true } });
    const on = await activeUser("expirado2@aurea.test", new Date(Date.now() - 60_000));
    await svc("select public.expire_stale_records()");
    await svc("select public.expire_stale_records()");
    expect(await jobs("subscription_id = $1 and template_key = 'expired'", [on.sub])).toHaveLength(1);
    expect(await svc("select * from public.notifications where user_id = $1 and kind = 'subscription_expired'", [on.user])).toHaveLength(1);
    await setNotifSettings({ emails: settings().emails });
  });
});

describe("fila: envio, tentativas e falhas", () => {
  it("sem integração ativa nada é enviado nem marcado como enviado", async () => {
    await markAllDone();
    const u = await newUser("fila1@aurea.test");
    await order(u);
    const provider = fakeProvider();
    const r = await drain(provider, { active: false });
    expect(r.claimed).toBe(0);
    expect(provider.sent).toHaveLength(0);
    expect((await jobs("user_id = $1", [u])).every((j) => j.status === "queued")).toBe(true);
  });

  it("envia com o remetente configurado e regista o identificador do fornecedor", async () => {
    const provider = fakeProvider(() => ({ ok: true, messageId: "gmail-abc123" }));
    const r = await drain(provider);
    expect(r.sent).toBeGreaterThanOrEqual(2);
    expect(provider.sent[0].from).toEqual({ name: "AUREA | Suporte", email: "suporte@aurea-som.site" });
    expect(provider.sent[0].replyTo).toBe("suporte@aurea-som.site");
    const sent = await jobs("status = 'sent' and provider_message_id = 'gmail-abc123'");
    expect(sent.length).toBe(r.sent);
    const logs = await svc("select * from public.email_logs where job_id = $1", [sent[0].id]);
    expect(logs).toMatchObject([{ status: "sent", provider: "fake", provider_message_id: "gmail-abc123" }]);
    const [st] = await svc<{ last_sent_at: Date | null }>("select * from public.email_integration_state");
    expect(st.last_sent_at).not.toBeNull();
    // Nada fica para enviar duas vezes.
    const again = await drain(fakeProvider());
    expect(again.claimed).toBe(0);
  });

  it("12–13. falha do fornecedor: fica registado, é repetido com atraso e não mexe no pagamento", async () => {
    await markAllDone();
    const u = await newUser("falha@aurea.test");
    const p = await order(u);
    await confirm(p.reference, Number(p.amount_minor));
    const down = fakeProvider(() => ({ ok: false, error: "Gmail API 503 UNAVAILABLE", permanent: false }));
    const r = await drain(down);
    // Os e-mails de "pedido pendente" já não se aplicam (pagamento confirmado) e são descartados.
    expect(r.retry).toBe(2);
    expect(r.skipped).toBe(r.claimed - 2);
    const failed = await jobs("user_id = $1 and template_key = 'plan_activated'", [u]);
    expect(failed[0]).toMatchObject({ status: "retry_scheduled", attempts: 1, last_error: "Gmail API 503 UNAVAILABLE" });
    const [due] = await svc<{ next_attempt_at: Date }>("select next_attempt_at from public.email_jobs where id = $1", [failed[0].id]);
    expect(new Date(due.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
    expect(await svc("select * from public.email_logs where job_id = $1 and status = 'retry_scheduled'", [failed[0].id])).toHaveLength(1);

    // O pagamento e a assinatura continuam confirmados.
    const [pay] = await svc<{ status: string }>("select status from public.payments where id = $1", [p.id]);
    expect(pay.status).toBe("confirmed");
    const [prem] = await svc<{ ok: boolean }>("select public.has_premium_access($1) ok", [u]);
    expect(prem.ok).toBe(true);

    // Ainda não está na hora: não é reenviado.
    expect((await drain(fakeProvider())).claimed).toBe(0);
    // Chegada a hora, sai com sucesso.
    await svc("update public.email_jobs set next_attempt_at = now() - interval '1 second' where user_id = $1", [u]);
    const ok = fakeProvider();
    await drain(ok);
    expect((await jobs("id = $1", [failed[0].id]))[0].status).toBe("sent");
  });

  it("esgotadas as tentativas: falha definitiva, alerta ao admin e o admin pode voltar a pôr na fila", async () => {
    await markAllDone();
    const u = await newUser("esgota@aurea.test");
    await order(u);
    await svc("update public.email_jobs set max_attempts = 2 where user_id = $1", [u]);
    const down = fakeProvider(() => ({ ok: false, error: "timeout", permanent: false }));
    await drain(down);
    await svc("update public.email_jobs set next_attempt_at = now() where user_id = $1", [u]);
    await drain(down);
    const [j] = await jobs("user_id = $1 and template_key = 'payment_requested'", [u]);
    expect(j).toMatchObject({ status: "failed", attempts: 2 });
    expect(await svc("select * from public.admin_notifications where dedupe_key = $1", [`email_failed:${j.id}`])).toHaveLength(1);

    const [denied] = await svc<{ r: Row }>("select public.requeue_email_job($1,$2) r", [j.id, u]);
    expect(denied.r).toMatchObject({ ok: false, error: "forbidden" });
    const [r] = await svc<{ r: Row }>("select public.requeue_email_job($1,$2) r", [j.id, admin]);
    expect(r.r).toMatchObject({ ok: true });
    await drain(fakeProvider());
    expect((await jobs("id = $1", [j.id]))[0].status).toBe("sent");
    expect(await svc("select * from public.admin_audit_logs where action = 'email.requeue' and target_id = $1", [j.id])).toHaveLength(1);
  });

  it("erro permanente (mensagem recusada) não é repetido", async () => {
    await markAllDone();
    const u = await newUser("perm@aurea.test");
    await order(u);
    await drain(fakeProvider(() => ({ ok: false, error: "Gmail API 400: Invalid To header", permanent: true })));
    const j = await jobs("user_id = $1", [u]);
    expect(j.every((x) => x.status === "failed" && x.attempts === 1)).toBe(true);
  });

  it("dois processos simultâneos nunca reclamam o mesmo trabalho", async () => {
    await markAllDone();
    for (let i = 0; i < 4; i++) await order(await newUser(`conc${i}@aurea.test`));
    const [a, b] = await Promise.all([repo.claim(5, "w1"), repo.claim(5, "w2")]);
    const ids = [...a, ...b].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(8);
    for (const id of ids) await repo.complete(id, "skipped", { error: "teste" });
  });

  it("modo de teste: só endereços autorizados recebem", async () => {
    await markAllDone();
    await order(await newUser("real@cliente.test"));
    const provider = fakeProvider();
    const s = mergeNotificationSettings({ test_mode: true, test_recipients: ["qa@aurea.test"] });
    await drain(provider, { settings: s });
    expect(provider.sent.map((m) => m.to)).toEqual(["suporte@aurea-som.site"]);
    const [j] = await jobs("to_email = 'real@cliente.test'");
    expect(j).toMatchObject({ status: "skipped" });
    expect(j.last_error).toMatch(/Modo de teste/);
  });

  it("um pedido já confirmado não recebe o e-mail de 'pagamento pendente' atrasado", async () => {
    await markAllDone();
    const u = await newUser("atrasado@aurea.test");
    const p = await order(u);
    await confirm(p.reference, Number(p.amount_minor));
    const provider = fakeProvider();
    await drain(provider);
    const subjects = provider.sent.filter((m) => m.to === "atrasado@aurea.test").map((m) => m.subject);
    expect(subjects).toEqual(["O seu plano AUREA está ativo!"]);
    const [j] = await jobs("payment_id = $1 and template_key = 'payment_requested'", [p.id]);
    expect(j.status).toBe("skipped");
  });
});

describe("14–16. notificações internas e permissões", () => {
  let a: string;
  let b: string;
  beforeAll(async () => {
    a = await newUser("leitora@aurea.test");
    b = await newUser("outra@aurea.test");
    await order(a);
    await order(b);
  });

  it("o cliente vê e marca como lidas as suas notificações", async () => {
    const mine = await db.as("authenticated", a, async () => (await db.query<{ id: string; read_at: Date | null; title: string }>("select * from public.notifications")).rows);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((n) => n.read_at === null)).toBe(true);
    await db.as("authenticated", a, () => db.query("update public.notifications set read_at = now() where id = $1", [mine[0].id]));
    const [n] = await svc<{ read_at: Date | null }>("select read_at from public.notifications where id = $1", [mine[0].id]);
    expect(n.read_at).not.toBeNull();
    await db.as("authenticated", a, () => db.query("update public.notifications set read_at = now() where read_at is null"));
    const unread = await svc("select * from public.notifications where user_id = $1 and read_at is null", [a]);
    expect(unread).toHaveLength(0);
    // Só a data de leitura é alterável.
    await expect(db.as("authenticated", a, () => db.query("update public.notifications set title = 'x' where id = $1", [mine[0].id]))).rejects.toThrow(/permission denied/);
  });

  it("um cliente não vê nem altera notificações de outro cliente", async () => {
    const seen = await db.as("authenticated", b, async () => (await db.query<{ user_id: string }>("select * from public.notifications")).rows);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((n) => n.user_id === b)).toBe(true);
    await db.as("authenticated", b, () => db.query("update public.notifications set read_at = null where user_id = $1", [a]));
    const unread = await svc("select * from public.notifications where user_id = $1 and read_at is null", [a]);
    expect(unread).toHaveLength(0);
  });

  it("clientes e visitantes não acedem a dados administrativos nem à fila", async () => {
    for (const table of ["admin_notifications", "email_jobs", "email_logs", "email_templates", "notification_events", "notification_schedule_logs", "email_integration_state"]) {
      await expect(db.as("authenticated", a, () => db.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
      await expect(db.as("anon", null, () => db.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
    }
    await expect(db.as("authenticated", a, () => db.query("select * from public.claim_email_jobs(10,'x',null)"))).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", a, () => db.query("select public.enqueue_expiry_reminders(now())"))).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", a, () => db.query("select public.emit_event('user.registered','x',null,null,null,'{}')"))).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", a, () => db.query("select * from public.platform_settings where key = 'notifications'"))).resolves.toMatchObject({ rows: [] });
  });

  it("links das notificações são sempre internos", async () => {
    await expect(svc("insert into public.notifications (user_id, kind, title, link) values ($1, 'x', 'x', 'https://evil.test')", [a])).rejects.toThrow(/notifications_link_check/);
    await expect(svc("insert into public.notifications (user_id, kind, title, link) values ($1, 'x', 'x', '//evil.test')", [a])).rejects.toThrow(/notifications_link_check/);
  });
});
