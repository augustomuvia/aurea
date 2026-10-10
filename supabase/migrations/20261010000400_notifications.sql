-- =====================================================================
-- AUREA — e-mails automáticos e notificações
--
-- Camada de eventos (transactional outbox): cada alteração relevante grava um
-- evento em notification_events NA MESMA TRANSAÇÃO que a alteração de negócio.
-- O evento gera, também na mesma transação, as notificações internas e os
-- trabalhos de e-mail (email_jobs). O envio real é feito depois, pelo servidor,
-- a partir da fila. Uma falha de envio nunca desfaz um pagamento nem uma
-- assinatura: apenas fica registada e é tentada de novo.
--
-- Idempotente e não destrutivo: pode ser executado mais do que uma vez no
-- SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuração (sem segredos: as credenciais Google ficam só na Vercel)
-- ---------------------------------------------------------------------
insert into public.platform_settings (key, value, is_public) values (
  'notifications',
  '{
    "from_email": "suporte@aurea-som.site",
    "from_name": "AUREA | Suporte",
    "reply_to": "suporte@aurea-som.site",
    "admin_email": "suporte@aurea-som.site",
    "site_url": "https://www.aurea-som.site",
    "daily_hour": 8,
    "emails": {
      "welcome": true,
      "payment_requested": true,
      "payment_under_review": true,
      "admin_payment_requested": true,
      "admin_payment_confirmed": true,
      "plan_activated": true,
      "expiring": true,
      "expired": false
    },
    "test_mode": false,
    "test_recipients": [],
    "design": { "button": "dark", "footer_note": "" }
  }'::jsonb,
  false
) on conflict (key) do nothing;

create or replace function public.notif_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.platform_settings where key = 'notifications'), '{}'::jsonb);
$$;

-- Tipos de e-mail ativos por omissão: todos os transacionais. "expired" é opcional.
create or replace function public.notif_email_enabled(p_flag text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.notif_settings() -> 'emails' ->> p_flag)::boolean, p_flag <> 'expired');
$$;

create or replace function public.notif_admin_email()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(public.notif_settings() ->> 'admin_email'), ''), 'suporte@aurea-som.site');
$$;

-- ---------------------------------------------------------------------
-- Notificações internas do cliente (tabela existente, alargada)
-- ---------------------------------------------------------------------
alter table public.notifications
  add column if not exists category text not null default 'conta',
  add column if not exists link text,
  add column if not exists dedupe_key text;

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('conta', 'pagamento', 'assinatura', 'biblioteca'));
-- Só caminhos internos (evita redirecionamentos abertos).
alter table public.notifications drop constraint if exists notifications_link_check;
alter table public.notifications add constraint notifications_link_check
  check (link is null or link ~ '^/[A-Za-z0-9]');

create unique index if not exists notifications_dedupe_idx on public.notifications (dedupe_key) where dedupe_key is not null;
create index if not exists notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

-- As funções já existentes inserem notificações sem categoria nem ligação: completa-as.
create or replace function public.tg_notification_defaults()
returns trigger language plpgsql as $$
begin
  if new.link is null then
    new.link := case new.kind
      when 'payment_confirmed' then '/app/pagamentos'
      when 'payment_rejected' then '/app/pagamentos'
      when 'access_granted' then '/app/assinatura'
      else null end;
  end if;
  if new.kind in ('payment_confirmed', 'payment_rejected') and new.category = 'conta' then
    new.category := 'pagamento';
  elsif new.kind = 'access_granted' and new.category = 'conta' then
    new.category := 'assinatura';
  end if;
  return new;
end $$;

drop trigger if exists notifications_defaults on public.notifications;
create trigger notifications_defaults before insert on public.notifications
  for each row execute function public.tg_notification_defaults();

-- ---------------------------------------------------------------------
-- Notificações internas de administração (separadas das dos clientes)
-- ---------------------------------------------------------------------
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'error')),
  title text not null,
  body text not null default '',
  link text check (link is null or link ~ '^/admin'),
  dedupe_key text unique,
  read_at timestamptz,
  read_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists admin_notifications_created_idx on public.admin_notifications (created_at desc);
create index if not exists admin_notifications_unread_idx on public.admin_notifications (created_at desc) where read_at is null;

-- ---------------------------------------------------------------------
-- Preferências: lembretes de expiração por e-mail (mensagens essenciais
-- de pagamento e segurança não dependem desta opção)
-- ---------------------------------------------------------------------
alter table public.user_preferences add column if not exists reminder_emails boolean not null default true;
grant update (reminder_emails) on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------
-- Eventos, fila e histórico
-- ---------------------------------------------------------------------
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'user.registered', 'payment.requested', 'payment.proof_submitted', 'payment.confirmed',
    'subscription.activated', 'subscription.expiring', 'subscription.expired'
  )),
  dedupe_key text not null unique,
  user_id uuid references public.profiles (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  payload jsonb not null default '{}',
  emails_queued int not null default 0,
  notifications_created int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists notification_events_created_idx on public.notification_events (created_at desc);

-- Modelos editados pelo admin. Sem linha = modelo original (definido no código).
create table if not exists public.email_templates (
  key text primary key check (key ~ '^[a-z0-9_]{3,40}$'),
  subject text not null check (char_length(subject) between 3 and 200),
  heading text not null check (char_length(heading) between 2 and 160),
  body text not null check (char_length(body) between 10 and 6000),
  cta_label text not null default '' check (char_length(cta_label) <= 60),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  event_id uuid references public.notification_events (id) on delete set null,
  event_type text not null,
  template_key text not null,
  audience text not null check (audience in ('customer', 'admin')),
  to_email text not null check (char_length(to_email) between 3 and 320),
  user_id uuid references public.profiles (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed', 'retry_scheduled', 'skipped')),
  attempts int not null default 0,
  max_attempts int not null default 6 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  completed_at timestamptz,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_jobs_due_idx on public.email_jobs (next_attempt_at) where status in ('queued', 'retry_scheduled');
create index if not exists email_jobs_created_idx on public.email_jobs (created_at desc);
create index if not exists email_jobs_status_idx on public.email_jobs (status, created_at desc);
create index if not exists email_jobs_user_idx on public.email_jobs (user_id);
create index if not exists email_jobs_payment_idx on public.email_jobs (payment_id);
create index if not exists email_jobs_subscription_idx on public.email_jobs (subscription_id);
drop trigger if exists email_jobs_updated_at on public.email_jobs;
create trigger email_jobs_updated_at before update on public.email_jobs
  for each row execute function public.tg_set_updated_at();

-- Uma linha por tentativa (e por ação administrativa sobre o trabalho).
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.email_jobs (id) on delete cascade,
  attempt int not null default 0,
  status text not null check (status in ('sent', 'failed', 'retry_scheduled', 'skipped', 'requeued')),
  provider text,
  provider_message_id text,
  error text,
  duration_ms int,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists email_logs_job_idx on public.email_logs (job_id, created_at);

create table if not exists public.notification_schedule_logs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('daily', 'tick', 'manual')),
  luanda_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  details jsonb not null default '{}',
  error text
);
create index if not exists notification_schedule_logs_started_idx on public.notification_schedule_logs (started_at desc);

-- Estado da integração (uma linha). Nunca guarda tokens: só datas e resultados.
create table if not exists public.email_integration_state (
  id smallint primary key default 1 check (id = 1),
  verified_from text,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  verification_from text,
  verification_code_hash text,
  verification_sent_at timestamptz,
  last_sent_at timestamptz,
  last_error_at timestamptz,
  last_error text
);
insert into public.email_integration_state (id) values (1) on conflict (id) do nothing;

-- Tudo isto é só para o servidor (service_role). Os clientes não leem nada daqui.
alter table public.admin_notifications enable row level security;
alter table public.notification_events enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_jobs enable row level security;
alter table public.email_logs enable row level security;
alter table public.notification_schedule_logs enable row level security;
alter table public.email_integration_state enable row level security;
revoke all on public.admin_notifications from anon, authenticated;
revoke all on public.notification_events from anon, authenticated;
revoke all on public.email_templates from anon, authenticated;
revoke all on public.email_jobs from anon, authenticated;
revoke all on public.email_logs from anon, authenticated;
revoke all on public.notification_schedule_logs from anon, authenticated;
revoke all on public.email_integration_state from anon, authenticated;

-- ---------------------------------------------------------------------
-- Primitivas
-- ---------------------------------------------------------------------
create or replace function public.notify_user(
  p_user uuid, p_kind text, p_category text, p_title text, p_body text, p_link text, p_dedupe text
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then
    return false;
  end if;
  insert into public.notifications (user_id, kind, category, title, body, link, dedupe_key)
  values (p_user, p_kind, p_category, p_title, coalesce(p_body, ''), p_link, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return found;
end $$;

create or replace function public.notify_admin(
  p_kind text, p_severity text, p_title text, p_body text, p_link text, p_dedupe text
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_notifications (kind, severity, title, body, link, dedupe_key)
  values (p_kind, p_severity, p_title, coalesce(p_body, ''), p_link, p_dedupe)
  on conflict (dedupe_key) do nothing;
  return found;
end $$;

create or replace function public.enqueue_email(
  p_event public.notification_events, p_template text, p_audience text, p_to text, p_payload jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_to is null or position('@' in p_to) = 0 then
    return false;
  end if;
  insert into public.email_jobs (idempotency_key, event_id, event_type, template_key, audience, to_email,
                                 user_id, subscription_id, payment_id, payload)
  values (p_event.dedupe_key || ':' || p_template, p_event.id, p_event.type, p_template, p_audience, lower(trim(p_to)),
          p_event.user_id, p_event.subscription_id, p_event.payment_id, coalesce(p_payload, '{}'))
  on conflict (idempotency_key) do nothing;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- Encaminhamento: que notificações e e-mails cada evento gera
-- ---------------------------------------------------------------------
create or replace function public.route_event(p_event public.notification_events)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_p jsonb;
  v_mails int := 0;
  v_notes int := 0;
  v_m int;
  v_prefs_reminders boolean;
begin
  select * into v_profile from public.profiles where id = p_event.user_id;
  v_p := p_event.payload || jsonb_build_object(
    'nome', coalesce(v_profile.full_name, ''),
    'email', coalesce(v_profile.email, ''),
    'user_id', p_event.user_id,
    'subscription_id', p_event.subscription_id,
    'payment_id', p_event.payment_id
  );

  case p_event.type
  when 'user.registered' then
    if public.notify_user(p_event.user_id, 'account_created', 'conta', 'Conta criada',
         'Bem-vindo à AUREA. A biblioteca premium fica disponível com uma assinatura ativa.', '/planos',
         p_event.dedupe_key) then v_notes := v_notes + 1; end if;
    if public.notif_email_enabled('welcome')
       and public.enqueue_email(p_event, 'welcome', 'customer', v_profile.email, v_p) then v_mails := v_mails + 1; end if;

  when 'payment.requested' then
    if public.notify_user(p_event.user_id, 'payment_requested', 'pagamento', 'Pedido de pagamento criado',
         'Pedido ' || (v_p ->> 'reference') || ' a aguardar pagamento por Multicaixa Express.',
         '/checkout/estado?ref=' || (v_p ->> 'reference'), p_event.dedupe_key) then v_notes := v_notes + 1; end if;
    if public.notif_email_enabled('payment_requested')
       and public.enqueue_email(p_event, 'payment_requested', 'customer', v_profile.email, v_p) then v_mails := v_mails + 1; end if;
    perform public.notify_admin('payment_requested', 'info', 'Novo pedido pendente · ' || (v_p ->> 'reference'),
      coalesce(nullif(v_profile.full_name, ''), v_profile.email, 'Cliente') || ' · ' || coalesce(v_p ->> 'plan', ''),
      '/admin/pagamentos/' || p_event.payment_id, p_event.dedupe_key);
    if public.notif_email_enabled('admin_payment_requested')
       and public.enqueue_email(p_event, 'admin_payment_requested', 'admin', public.notif_admin_email(), v_p) then v_mails := v_mails + 1; end if;

  when 'payment.proof_submitted' then
    perform public.notify_admin('payment_proof', 'warning', 'Comprovativo recebido · ' || (v_p ->> 'reference'),
      'Pagamento por verificar. O cliente enviou dados ou comprovativo; isto não confirma o pagamento.',
      '/admin/pagamentos/' || p_event.payment_id, p_event.dedupe_key);
    if public.notif_email_enabled('payment_under_review')
       and public.enqueue_email(p_event, 'payment_under_review', 'customer', v_profile.email, v_p) then v_mails := v_mails + 1; end if;

  when 'payment.confirmed' then
    perform public.notify_admin('payment_confirmed', 'success', 'Pagamento confirmado · ' || (v_p ->> 'reference'),
      coalesce(nullif(v_profile.full_name, ''), v_profile.email, 'Cliente') || ' · ' || coalesce(v_p ->> 'plan', ''),
      '/admin/pagamentos/' || p_event.payment_id, p_event.dedupe_key);
    if public.notif_email_enabled('admin_payment_confirmed')
       and public.enqueue_email(p_event, 'admin_payment_confirmed', 'admin', public.notif_admin_email(), v_p) then v_mails := v_mails + 1; end if;

  when 'subscription.activated' then
    if public.notify_user(p_event.user_id, 'plan_activated', 'biblioteca', 'O seu plano está ativo',
         'Plano ' || coalesce(v_p ->> 'plan', '') || ' ativo até ' ||
         to_char((v_p ->> 'expires_at')::timestamptz at time zone 'Africa/Luanda', 'DD/MM/YYYY') || '. Boas escutas.',
         '/app/biblioteca', p_event.dedupe_key) then v_notes := v_notes + 1; end if;
    if public.notif_email_enabled('plan_activated')
       and public.enqueue_email(p_event, 'plan_activated', 'customer', v_profile.email, v_p) then v_mails := v_mails + 1; end if;

  when 'subscription.expiring' then
    v_m := (v_p ->> 'milestone')::int;
    if public.notify_user(p_event.user_id, 'subscription_expiring', 'assinatura',
         case when v_m = 1 then 'Último dia da sua assinatura'
              else 'A sua assinatura termina em ' || (v_p ->> 'days_left') || ' dias' end,
         'Plano ' || coalesce(v_p ->> 'plan', '') || ' válido até ' ||
         to_char((v_p ->> 'expires_at')::timestamptz at time zone 'Africa/Luanda', 'DD/MM/YYYY') || '. A renovação é manual.',
         '/app/assinatura', p_event.dedupe_key) then v_notes := v_notes + 1; end if;
    select reminder_emails into v_prefs_reminders from public.user_preferences where user_id = p_event.user_id;
    if public.notif_email_enabled('expiring') and coalesce(v_prefs_reminders, true)
       and public.enqueue_email(p_event, 'expiring_' || v_m, 'customer', v_profile.email, v_p) then v_mails := v_mails + 1; end if;

  when 'subscription.expired' then
    if public.notif_email_enabled('expired') then
      if public.notify_user(p_event.user_id, 'subscription_expired', 'assinatura', 'A sua assinatura terminou',
           'Pode renovar quando quiser escolhendo um plano.', '/planos', p_event.dedupe_key) then v_notes := v_notes + 1; end if;
      select reminder_emails into v_prefs_reminders from public.user_preferences where user_id = p_event.user_id;
      if coalesce(v_prefs_reminders, true)
         and public.enqueue_email(p_event, 'expired', 'customer', v_profile.email, v_p) then v_mails := v_mails + 1; end if;
    end if;
  end case;

  update public.notification_events set emails_queued = v_mails, notifications_created = v_notes where id = p_event.id;
end $$;

-- Ponto único de entrada da camada de eventos. Devolve null se o evento já existia.
create or replace function public.emit_event(
  p_type text, p_dedupe text, p_user uuid, p_subscription uuid, p_payment uuid, p_payload jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ev public.notification_events;
begin
  insert into public.notification_events (type, dedupe_key, user_id, subscription_id, payment_id, payload)
  values (p_type, p_dedupe, p_user, p_subscription, p_payment, coalesce(p_payload, '{}'))
  on conflict (dedupe_key) do nothing
  returning * into v_ev;
  if v_ev.id is null then
    return null;
  end if;
  perform public.route_event(v_ev);
  return v_ev.id;
end $$;

-- ---------------------------------------------------------------------
-- Ligação aos fluxos existentes (gatilhos: não alteram as funções atuais)
-- ---------------------------------------------------------------------

-- A. Conta criada: só depois de o e-mail estar confirmado (respeita a verificação).
create or replace function public.tg_user_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null)
     and exists (select 1 from public.profiles where id = new.id) then
    perform public.emit_event('user.registered', 'welcome:' || new.id, new.id, null, null, '{}'::jsonb);
  end if;
  return new;
end $$;

-- O nome garante que corre depois de on_auth_user_created (que cria o perfil).
drop trigger if exists on_auth_user_welcome on auth.users;
create trigger on_auth_user_welcome after insert or update of email_confirmed_at on auth.users
  for each row execute function public.tg_user_welcome();

-- B. Pedido de pagamento criado (um pedido reutilizado não gera novo evento).
create or replace function public.tg_payment_requested()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_pay jsonb;
begin
  select * into v_plan from public.plans where id = new.plan_id;
  select value into v_pay from public.platform_settings where key = 'payment';
  perform public.emit_event('payment.requested', 'payment.requested:' || new.id, new.user_id, null, new.id,
    jsonb_build_object(
      'reference', new.reference,
      'amount_minor', new.amount_minor,
      'plan', v_plan.name,
      'plan_code', v_plan.code,
      'duration_months', v_plan.duration_months,
      'created_at', new.created_at,
      'status', new.status,
      'method', new.method,
      -- Instruções configuradas no painel no momento do pedido (nunca fixas no código).
      'mcx_recipient_phone', v_pay ->> 'mcx_recipient_phone',
      'mcx_recipient_name', v_pay ->> 'mcx_recipient_name',
      'payment_instructions', v_pay ->> 'instructions'
    ));
  return new;
end $$;

drop trigger if exists payments_notify_requested on public.payments;
create trigger payments_notify_requested after insert on public.payments
  for each row when (new.status = 'pending' and new.user_id is not null)
  execute function public.tg_payment_requested();

-- C. Comprovativo ou dados de transação enviados pelo cliente (NÃO é confirmação).
create or replace function public.tg_payment_proof_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
begin
  if new.status = 'pending' and new.user_id is not null and (
       (new.proof_uploaded_at is not null and new.proof_uploaded_at is distinct from old.proof_uploaded_at)
    or (new.customer_reported_at is not null and new.customer_reported_at is distinct from old.customer_reported_at)
  ) then
    select * into v_plan from public.plans where id = new.plan_id;
    perform public.emit_event('payment.proof_submitted', 'payment.proof:' || new.id, new.user_id, null, new.id,
      jsonb_build_object('reference', new.reference, 'amount_minor', new.amount_minor, 'plan', v_plan.name,
                         'created_at', new.created_at, 'status', new.status, 'method', new.method));
  end if;
  return new;
end $$;

drop trigger if exists payments_notify_proof on public.payments;
create trigger payments_notify_proof after update on public.payments
  for each row execute function public.tg_payment_proof_submitted();

-- D. Pagamento confirmado + plano ativado. O período só é gravado por confirm_payment
-- depois de o pagamento estar confirmado e a assinatura atualizada, por isso este
-- gatilho vê o estado final, na mesma transação.
create or replace function public.tg_period_activated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_plan public.plans;
  v_sub public.subscriptions;
  v_payload jsonb;
begin
  if new.source <> 'payment' or new.payment_id is null then
    return new;
  end if;
  select * into v_payment from public.payments where id = new.payment_id;
  if v_payment.status <> 'confirmed' then
    return new;
  end if;
  select * into v_plan from public.plans where id = new.plan_id;
  select * into v_sub from public.subscriptions where id = new.subscription_id;

  v_payload := jsonb_build_object(
    'reference', v_payment.reference,
    'amount_minor', v_payment.amount_minor,
    'plan', v_plan.name,
    'plan_code', v_plan.code,
    'duration_months', v_plan.duration_months,
    'method', v_payment.method,
    'provider', v_payment.provider,
    'transaction_id', v_payment.provider_transaction_id,
    'created_at', v_payment.created_at,
    'confirmed_at', v_payment.confirmed_at,
    'previous_status', 'pending',
    'status', 'confirmed',
    'subscription_status', v_sub.status,
    'starts_at', v_sub.starts_at,
    'period_start', new.period_start,
    'expires_at', v_sub.expires_at
  );

  -- Avisos de expiração ainda por enviar referem-se à data antiga: deixam de valer.
  update public.email_jobs
     set status = 'skipped', last_error = 'Assinatura renovada: data de expiração alterada', completed_at = now()
   where subscription_id = new.subscription_id
     and template_key like 'expiring%'
     and status in ('queued', 'retry_scheduled');

  perform public.emit_event('payment.confirmed', 'payment.confirmed:' || v_payment.id, v_payment.user_id, v_sub.id, v_payment.id, v_payload);
  perform public.emit_event('subscription.activated', 'subscription.activated:' || v_payment.id, v_payment.user_id, v_sub.id, v_payment.id, v_payload);
  return new;
end $$;

drop trigger if exists subscription_periods_notify on public.subscription_periods;
create trigger subscription_periods_notify after insert on public.subscription_periods
  for each row execute function public.tg_period_activated();

-- E. Assinatura expirada pelo fim do período (não por estorno, suspensão ou cancelamento).
create or replace function public.tg_subscription_expired()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
begin
  if old.status = 'active' and new.status = 'expired' and new.expires_at <= now()
     and coalesce(new.status_reason, '') = 'Período terminado' then
    select * into v_plan from public.plans where id = new.plan_id;
    perform public.emit_event('subscription.expired',
      'expired:' || new.id || ':' || floor(extract(epoch from new.expires_at))::bigint,
      new.user_id, new.id, null,
      jsonb_build_object('plan', coalesce(v_plan.name, 'Acesso premium'), 'plan_code', v_plan.code, 'expires_at', new.expires_at));
  end if;
  return new;
end $$;

drop trigger if exists subscriptions_notify_expired on public.subscriptions;
create trigger subscriptions_notify_expired after update of status on public.subscriptions
  for each row execute function public.tg_subscription_expired();

-- ---------------------------------------------------------------------
-- Avisos antes da expiração (executado diariamente pelo agendador)
--
-- Marcos: 10, 5, 3 e 1 dia(s), contados em dias de calendário de Africa/Luanda.
-- Se um dia de processamento falhar, o aviso sai no dia seguinte com o número
-- real de dias (janelas 10:[9,10], 5:[4,5], 3:[2,3], 1:[0,1]). A identidade do
-- aviso é (assinatura, marco, data de expiração): uma renovação muda a data e,
-- portanto, gera avisos novos; os antigos deixam de ser válidos.
-- ---------------------------------------------------------------------
create or replace function public.expiry_milestone(p_days int)
returns int language sql immutable as $$
  select case
    when p_days between 9 and 10 then 10
    when p_days between 4 and 5 then 5
    when p_days between 2 and 3 then 3
    when p_days between 0 and 1 then 1
  end;
$$;

create or replace function public.enqueue_expiry_reminders(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_days int;
  v_m int;
  v_new int := 0;
  v_seen int := 0;
begin
  for r in
    select s.id, s.user_id, s.expires_at, s.starts_at, s.payment_method,
           coalesce(pl.name, 'Acesso premium') plan_name, pl.code plan_code, pl.duration_months
      from public.subscriptions s
      join public.profiles p on p.id = s.user_id
      left join public.plans pl on pl.id = s.plan_id
     where s.status = 'active'
       and p.status = 'active'
       and s.expires_at > p_now
       and s.expires_at <= p_now + interval '12 days'
  loop
    v_days := (r.expires_at at time zone 'Africa/Luanda')::date - (p_now at time zone 'Africa/Luanda')::date;
    v_m := public.expiry_milestone(v_days);
    continue when v_m is null;
    v_seen := v_seen + 1;
    if public.emit_event('subscription.expiring',
         'expiring:' || r.id || ':' || v_m || ':' || floor(extract(epoch from r.expires_at))::bigint,
         r.user_id, r.id, null,
         jsonb_build_object('milestone', v_m, 'days_left', v_days, 'expires_at', r.expires_at,
                            'starts_at', r.starts_at, 'plan', r.plan_name, 'plan_code', r.plan_code,
                            'duration_months', r.duration_months, 'payment_method', r.payment_method)) is not null then
      v_new := v_new + 1;
    end if;
  end loop;
  return jsonb_build_object('eligible', v_seen, 'created', v_new);
end $$;

-- ---------------------------------------------------------------------
-- Fila de envio
-- ---------------------------------------------------------------------

-- Reclama trabalhos prontos de forma exclusiva (FOR UPDATE SKIP LOCKED): dois
-- processos simultâneos nunca recebem o mesmo trabalho.
create or replace function public.claim_email_jobs(p_limit int, p_worker text, p_job uuid default null)
returns setof public.email_jobs language plpgsql security definer set search_path = public as $$
begin
  -- Trabalhos presos em processamento (função interrompida) voltam à fila.
  update public.email_jobs
     set status = case when attempts >= max_attempts then 'failed' else 'retry_scheduled' end,
         completed_at = case when attempts >= max_attempts then now() end,
         locked_at = null, locked_by = null,
         last_error = 'Processamento interrompido antes da confirmação do envio',
         next_attempt_at = now()
   where status = 'processing' and locked_at < now() - interval '10 minutes';

  return query
  update public.email_jobs j
     set status = 'processing', locked_at = now(), locked_by = left(p_worker, 80), attempts = j.attempts + 1
   where j.id in (
     select x.id from public.email_jobs x
      where x.status in ('queued', 'retry_scheduled')
        and (p_job is null and x.next_attempt_at <= now() and not x.is_test or x.id = p_job)
      order by x.next_attempt_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning j.*;
end $$;

-- Razão para não enviar (dados desatualizados) ou null se o e-mail continua válido.
create or replace function public.email_job_stale_reason(p_job uuid, p_now timestamptz default now())
returns text language plpgsql stable security definer set search_path = public as $$
declare
  j public.email_jobs;
  s public.subscriptions;
  pay public.payments;
  v_days int;
begin
  select * into j from public.email_jobs where id = p_job;
  if not found then return 'Trabalho inexistente'; end if;
  if j.is_test then return null; end if;

  if j.template_key like 'expiring%' then
    select * into s from public.subscriptions where id = j.subscription_id;
    if not found or s.status <> 'active' then return 'Assinatura já não está ativa'; end if;
    if s.expires_at <= p_now then return 'Assinatura já expirou'; end if;
    if s.expires_at is distinct from (j.payload ->> 'expires_at')::timestamptz then
      return 'Assinatura renovada: data de expiração alterada';
    end if;
    v_days := (s.expires_at at time zone 'Africa/Luanda')::date - (p_now at time zone 'Africa/Luanda')::date;
    if public.expiry_milestone(v_days) is distinct from (j.payload ->> 'milestone')::int then
      return 'Aviso desatualizado: o marco temporal já passou';
    end if;
    if exists (select 1 from public.profiles where id = s.user_id and status <> 'active') then
      return 'Conta suspensa';
    end if;
  elsif j.template_key = 'expired' then
    select * into s from public.subscriptions where id = j.subscription_id;
    if not found or s.status <> 'expired' or s.expires_at is distinct from (j.payload ->> 'expires_at')::timestamptz then
      return 'Assinatura renovada ou alterada';
    end if;
  elsif j.template_key in ('payment_requested', 'payment_under_review', 'admin_payment_requested') then
    select * into pay from public.payments where id = j.payment_id;
    if not found or pay.status <> 'pending' then return 'O pedido já não está pendente'; end if;
  end if;

  if j.audience = 'customer' and j.user_id is null then
    return 'Conta encerrada';
  end if;
  return null;
end $$;

-- Atraso progressivo entre tentativas: 5 min, 15 min, 1 h, 6 h, 24 h.
create or replace function public.email_retry_delay(p_attempts int)
returns interval language sql immutable as $$
  select case
    when p_attempts <= 1 then interval '5 minutes'
    when p_attempts = 2 then interval '15 minutes'
    when p_attempts = 3 then interval '1 hour'
    when p_attempts = 4 then interval '6 hours'
    else interval '24 hours'
  end;
$$;

create or replace function public.complete_email_job(
  p_job uuid, p_outcome text, p_provider text, p_message_id text, p_error text,
  p_permanent boolean default false, p_duration_ms int default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  j public.email_jobs;
  v_status text;
begin
  select * into j from public.email_jobs where id = p_job for update;
  if not found or j.status <> 'processing' then
    return null;
  end if;

  if p_outcome = 'sent' then
    v_status := 'sent';
    update public.email_jobs
       set status = 'sent', provider = p_provider, provider_message_id = left(p_message_id, 200),
           sent_at = now(), completed_at = now(), locked_at = null, locked_by = null, last_error = null
     where id = p_job;
    update public.email_integration_state set last_sent_at = now() where id = 1;
  elsif p_outcome = 'skipped' then
    v_status := 'skipped';
    update public.email_jobs
       set status = 'skipped', completed_at = now(), locked_at = null, locked_by = null, last_error = left(p_error, 500)
     where id = p_job;
  else
    v_status := case when p_permanent or j.attempts >= j.max_attempts then 'failed' else 'retry_scheduled' end;
    update public.email_jobs
       set status = v_status, provider = p_provider, last_error = left(coalesce(p_error, 'Erro desconhecido'), 1000),
           locked_at = null, locked_by = null,
           next_attempt_at = case when v_status = 'retry_scheduled' then now() + public.email_retry_delay(j.attempts) else next_attempt_at end,
           completed_at = case when v_status = 'failed' then now() end
     where id = p_job;
    update public.email_integration_state
       set last_error_at = now(), last_error = left(coalesce(p_error, 'Erro desconhecido'), 500)
     where id = 1;
    if v_status = 'failed' and not j.is_test then
      perform public.notify_admin('email_failed', 'error', 'E-mail não enviado · ' || j.template_key,
        'Destinatário ' || j.to_email || ' · ' || j.attempts || ' tentativa(s). ' || left(coalesce(p_error, ''), 200),
        '/admin/notificacoes/historico/' || j.id, 'email_failed:' || j.id);
    end if;
  end if;

  insert into public.email_logs (job_id, attempt, status, provider, provider_message_id, error, duration_ms)
  values (p_job, j.attempts, v_status, p_provider, left(p_message_id, 200),
          case when p_outcome = 'sent' then null else left(p_error, 1000) end, p_duration_ms);
  return v_status;
end $$;

-- O admin volta a colocar na fila um e-mail falhado, depois de resolver o problema.
create or replace function public.requeue_email_job(p_job uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j public.email_jobs;
begin
  if not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into j from public.email_jobs where id = p_job for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if j.status <> 'failed' then
    return jsonb_build_object('ok', false, 'error', 'not_failed');
  end if;
  update public.email_jobs
     set status = 'queued', next_attempt_at = now(), completed_at = null,
         max_attempts = least(20, j.attempts + 3)
   where id = p_job;
  insert into public.email_logs (job_id, attempt, status, actor_id) values (p_job, j.attempts, 'requeued', p_actor);
  perform public.write_audit(p_actor, 'email.requeue', 'email_job', p_job::text, null,
                             jsonb_build_object('template', j.template_key, 'to', j.to_email));
  return jsonb_build_object('ok', true);
end $$;

-- Privilégios: apenas o servidor executa estas funções.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'notif_settings()',
    'notif_email_enabled(text)',
    'notif_admin_email()',
    'notify_user(uuid,text,text,text,text,text,text)',
    'notify_admin(text,text,text,text,text,text)',
    'enqueue_email(public.notification_events,text,text,text,jsonb)',
    'route_event(public.notification_events)',
    'emit_event(text,text,uuid,uuid,uuid,jsonb)',
    'tg_user_welcome()',
    'tg_payment_requested()',
    'tg_payment_proof_submitted()',
    'tg_period_activated()',
    'tg_subscription_expired()',
    'enqueue_expiry_reminders(timestamptz)',
    'claim_email_jobs(int,text,uuid)',
    'email_job_stale_reason(uuid,timestamptz)',
    'complete_email_job(uuid,text,text,text,text,boolean,int)',
    'requeue_email_job(uuid,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
