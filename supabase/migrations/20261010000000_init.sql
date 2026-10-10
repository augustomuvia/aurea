-- =====================================================================
-- AUREA — esquema inicial
-- Supabase (PostgreSQL 15+). Todas as operações privilegiadas passam por
-- funções SECURITY DEFINER executáveis apenas pelo service_role.
-- Valores monetários: inteiros em cêntimos de kwanza (amount_minor).
-- =====================================================================

-- ---------- Tipos ----------
create type public.app_role as enum ('super_admin');
create type public.account_status as enum ('active', 'suspended', 'closed');
create type public.subscription_status as enum ('pending_payment', 'active', 'expired', 'suspended', 'cancelled');
create type public.payment_status as enum ('pending', 'confirmed', 'rejected', 'cancelled', 'expired', 'reversed');
create type public.content_status as enum ('draft', 'published', 'unpublished', 'removed');

-- ---------- Utilitário updated_at ----------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Impede DELETE em tabelas com valor de auditoria/financeiro.
create or replace function public.tg_forbid_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'delete_forbidden: % is append-only', tg_table_name using errcode = '42501';
end $$;

-- Tabelas append-only: só é permitido anular a referência ao autor quando
-- a conta é eliminada (ON DELETE SET NULL); qualquer outra alteração é recusada.
create or replace function public.tg_append_only_update()
returns trigger language plpgsql as $$
begin
  if new.actor_id is null and old.actor_id is not null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'update_forbidden: % is append-only', tg_table_name using errcode = '42501';
end $$;

-- =====================================================================
-- Perfis e papéis
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  status public.account_status not null default 'active',
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_created_at_idx on public.profiles (created_at);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Papéis elevados. Um utilizador sem linha aqui é um cliente comum.
create table public.roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by text not null default 'bootstrap',
  primary key (user_id, role)
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  preferred_categories text[] not null default '{}',
  marketing_consent boolean not null default false,
  analytics_consent boolean not null default false,
  terms_accepted_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function public.tg_set_updated_at();

-- Criação automática do perfil. O papel NUNCA é lido dos metadados do registo.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  );
  insert into public.user_preferences (user_id, terms_accepted_at)
  values (
    new.id,
    case when (new.raw_user_meta_data ->> 'terms_accepted') = 'true' then now() end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil sincronizado com auth.users.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

create or replace function public.is_super_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- Um cliente autenticado só pode consultar o seu próprio papel.
  select (auth.uid() is null or auth.uid() = p_user) and exists (
    select 1 from public.roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = p_user and r.role = 'super_admin' and p.status = 'active'
  );
$$;

-- =====================================================================
-- Planos
-- =====================================================================
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]{2,32}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '',
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'AOA' check (currency = 'AOA'),
  duration_months int not null check (duration_months between 1 and 36),
  features text[] not null default '{}',
  is_active boolean not null default true,
  is_highlighted boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans
  for each row execute function public.tg_set_updated_at();

-- =====================================================================
-- Assinaturas (uma por utilizador; renovações em subscription_periods)
-- =====================================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  plan_id uuid references public.plans (id),
  status public.subscription_status not null,
  starts_at timestamptz,
  expires_at timestamptz,
  payment_method text check (payment_method in ('multicaixa_express', 'manual_grant')),
  transaction_id text,
  last_confirmed_at timestamptz,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_active_has_dates check (
    status not in ('active', 'expired', 'suspended') or (starts_at is not null and expires_at is not null)
  ),
  constraint subscriptions_dates_order check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create index subscriptions_status_expires_idx on public.subscriptions (status, expires_at);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- Máquina de estados: rejeita transições impossíveis.
create or replace function public.tg_subscription_transition()
returns trigger language plpgsql as $$
declare
  ok boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  ok := case old.status
    when 'pending_payment' then new.status in ('active', 'cancelled')
    when 'active' then new.status in ('expired', 'suspended', 'cancelled')
    when 'expired' then new.status in ('active', 'pending_payment', 'cancelled')
    when 'suspended' then new.status in ('active', 'expired', 'cancelled')
    when 'cancelled' then new.status in ('active', 'pending_payment')
  end;
  if not ok then
    raise exception 'invalid_subscription_transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;

create trigger subscriptions_transition before update of status on public.subscriptions
  for each row execute function public.tg_subscription_transition();

-- =====================================================================
-- Pagamentos
-- =====================================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  plan_id uuid not null references public.plans (id),
  reference text not null unique check (reference ~ '^AUR-[A-Z0-9]{8}$'),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'AOA' check (currency = 'AOA'),
  method text not null default 'multicaixa_express' check (method = 'multicaixa_express'),
  provider text not null default 'manual_review' check (provider in ('manual_review', 'partner')),
  status public.payment_status not null default 'pending',
  provider_transaction_id text unique,
  customer_reported_transaction_id text,
  customer_note text check (char_length(customer_note) <= 500),
  customer_reported_at timestamptz,
  verification_evidence text,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_confirmed_fields check (
    status not in ('confirmed', 'reversed') or (confirmed_at is not null and provider_transaction_id is not null)
  )
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);
create index payments_confirmed_at_idx on public.payments (confirmed_at) where status = 'confirmed';
create trigger payments_updated_at before update on public.payments
  for each row execute function public.tg_set_updated_at();
create trigger payments_no_delete before delete on public.payments
  for each row execute function public.tg_forbid_delete();

create or replace function public.tg_payment_transition()
returns trigger language plpgsql as $$
declare
  ok boolean;
begin
  if new.amount_minor <> old.amount_minor or new.plan_id <> old.plan_id or new.reference <> old.reference then
    raise exception 'payment_immutable_fields' using errcode = '23514';
  end if;
  if new.status = old.status then
    return new;
  end if;
  ok := case old.status
    when 'pending' then new.status in ('confirmed', 'rejected', 'cancelled', 'expired')
    when 'confirmed' then new.status = 'reversed'
    else false
  end;
  if not ok then
    raise exception 'invalid_payment_transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;

create trigger payments_transition before update on public.payments
  for each row execute function public.tg_payment_transition();

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments (id),
  reference text,
  type text not null,
  source text not null check (source in ('system', 'customer', 'admin', 'webhook')),
  provider_event_id text unique,
  actor_id uuid references public.profiles (id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index payment_events_payment_idx on public.payment_events (payment_id, created_at);
create trigger payment_events_no_delete before delete on public.payment_events
  for each row execute function public.tg_forbid_delete();
create trigger payment_events_no_update before update on public.payment_events
  for each row execute function public.tg_append_only_update();

-- Histórico de renovações / períodos concedidos.
create table public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid references public.plans (id),
  payment_id uuid unique references public.payments (id),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  source text not null check (source in ('payment', 'manual_grant')),
  granted_by uuid references public.profiles (id) on delete set null,
  reason text,
  reversed_at timestamptz,
  created_at timestamptz not null default now()
);
create index subscription_periods_user_idx on public.subscription_periods (user_id, period_start);

-- =====================================================================
-- Catálogo
-- =====================================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  description text not null default '',
  kind text not null default 'purpose' check (kind in ('purpose', 'frequency', 'ambient')),
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,90}$'),
  title text not null check (char_length(title) between 2 and 140),
  description text not null default '' check (char_length(description) <= 2000),
  declared_frequency_hz numeric(8, 2) check (declared_frequency_hz is null or declared_frequency_hz > 0),
  is_binaural boolean not null default false,
  duration_seconds int check (duration_seconds is null or duration_seconds > 0),
  cover_url text check (cover_url is null or cover_url ~ '^https://'),
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  status public.content_status not null default 'draft',
  is_premium boolean not null default true,
  is_featured boolean not null default false,
  featured_order int not null default 0,
  recommended_use text[] not null default '{}',
  tags text[] not null default '{}',
  embed_error text,
  embed_checked_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_items_status_idx on public.content_items (status, published_at desc);
create index content_items_featured_idx on public.content_items (is_featured, featured_order) where status = 'published';
create index content_items_tags_idx on public.content_items using gin (tags);
create trigger content_items_updated_at before update on public.content_items
  for each row execute function public.tg_set_updated_at();

-- O URL original e o identificador do vídeo ficam numa tabela separada:
-- só quem tem direito à reprodução os pode ler (RLS abaixo).
create table public.content_media (
  content_id uuid primary key references public.content_items (id) on delete cascade,
  youtube_url text not null check (youtube_url ~ '^https://'),
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$')
);

create table public.content_categories (
  content_id uuid not null references public.content_items (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (content_id, category_id)
);
create index content_categories_category_idx on public.content_categories (category_id);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_id uuid not null references public.content_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table public.listening_history (
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_id uuid not null references public.content_items (id) on delete cascade,
  position_seconds int not null default 0 check (position_seconds >= 0),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  play_count int not null default 1 check (play_count >= 0),
  first_played_at timestamptz not null default now(),
  last_played_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create index listening_history_recent_idx on public.listening_history (user_id, last_played_at desc);
create index listening_history_content_idx on public.listening_history (content_id);

-- =====================================================================
-- Notificações, auditoria, configurações, suporte, rate limiting
-- =====================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text,
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_type, target_id);
create trigger admin_audit_logs_no_delete before delete on public.admin_audit_logs
  for each row execute function public.tg_forbid_delete();
create trigger admin_audit_logs_no_update before update on public.admin_audit_logs
  for each row execute function public.tg_append_only_update();

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null default '{}',
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.tg_set_updated_at();

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200),
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

-- =====================================================================
-- Funções de acesso
-- =====================================================================
create or replace function public.has_premium_access(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() = p_user) and exists (
    select 1
    from public.subscriptions s
    join public.profiles p on p.id = s.user_id
    where s.user_id = p_user
      and s.status = 'active'
      and s.expires_at > now()
      and p.status = 'active'
  );
$$;

create or replace function public.can_play_content(p_user uuid, p_content uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() = p_user) and (
    public.is_super_admin(p_user)
    or exists (
      select 1 from public.content_items c
      join public.profiles p on p.id = p_user and p.status = 'active'
      where c.id = p_content
        and c.status = 'published'
        and (not c.is_premium or public.has_premium_access(p_user))
    ));
$$;

-- Rate limiting simples por janela fixa (funciona em ambientes serverless).
create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r public.rate_limits;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning * into r;
  return r.count <= p_limit;
end $$;

create or replace function public.write_audit(
  p_actor uuid, p_action text, p_target_type text, p_target_id text, p_reason text, p_details jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit_logs (actor_id, actor_email, action, target_type, target_id, reason, details)
  values (
    p_actor,
    (select email from public.profiles where id = p_actor),
    p_action, p_target_type, p_target_id, p_reason, coalesce(p_details, '{}')
  );
end $$;

-- =====================================================================
-- Fluxo de pagamento
-- =====================================================================

-- Cria (ou reutiliza) um pedido de pagamento. O valor vem SEMPRE da tabela plans.
create or replace function public.create_payment_order(p_user uuid, p_plan_code text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_profile public.profiles;
  v_payment public.payments;
  v_ref text;
  v_try int := 0;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found or v_profile.status <> 'active' then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  select * into v_plan from public.plans where code = p_plan_code and is_active;
  if not found then
    raise exception 'plan_not_available' using errcode = 'P0002';
  end if;

  -- Reutiliza um pedido pendente recente para o mesmo plano e valor (evita duplicados).
  select * into v_payment from public.payments
  where user_id = p_user and plan_id = v_plan.id and status = 'pending'
    and amount_minor = v_plan.amount_minor
    and created_at > now() - interval '48 hours'
  order by created_at desc limit 1;
  if found then
    return v_payment;
  end if;

  loop
    v_try := v_try + 1;
    v_ref := 'AUR-' || upper(substr(translate(encode(decode(md5(random()::text || clock_timestamp()::text || p_user::text), 'hex'), 'base64'), '+/=0O1IL', ''), 1, 8));
    begin
      insert into public.payments (user_id, plan_id, reference, amount_minor)
      values (p_user, v_plan.id, v_ref, v_plan.amount_minor)
      returning * into v_payment;
      exit;
    exception when unique_violation then
      if v_try > 5 then raise; end if;
    end;
  end loop;

  insert into public.payment_events (payment_id, reference, type, source, actor_id, payload)
  values (v_payment.id, v_payment.reference, 'created', 'customer', p_user,
          jsonb_build_object('plan', v_plan.code, 'amount_minor', v_plan.amount_minor));

  insert into public.subscriptions (user_id, plan_id, status)
  values (p_user, v_plan.id, 'pending_payment')
  on conflict (user_id) do update
    set plan_id = excluded.plan_id,
        status = 'pending_payment'
    where public.subscriptions.status in ('expired', 'cancelled')
       or (public.subscriptions.status = 'pending_payment');

  return v_payment;
end $$;

-- O cliente indica o identificador da transação do comprovativo Multicaixa Express.
-- Isto NÃO confirma nada: apenas fornece dados para verificação.
create or replace function public.report_payment(p_user uuid, p_reference text, p_txn text, p_note text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where reference = p_reference and user_id = p_user for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'payment_not_pending' using errcode = '23514';
  end if;
  if p_txn is null or char_length(trim(p_txn)) not between 4 and 64 then
    raise exception 'invalid_transaction_id' using errcode = '22023';
  end if;

  update public.payments
     set customer_reported_transaction_id = trim(p_txn),
         customer_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
         customer_reported_at = now()
   where id = v_payment.id
  returning * into v_payment;

  insert into public.payment_events (payment_id, reference, type, source, actor_id, payload)
  values (v_payment.id, v_payment.reference, 'customer_reported', 'customer', p_user,
          jsonb_build_object('transaction_id', trim(p_txn)));
  return v_payment;
end $$;

-- Confirmação de pagamento — idempotente e à prova de adulteração de valores.
-- p_source: 'admin' (modo provisório, exige evidência) ou 'webhook' (parceiro verificado).
-- Devolve jsonb { ok, status, error? } sem levantar exceção nos casos de negócio,
-- para que as tentativas inválidas fiquem registadas em payment_events.
create or replace function public.confirm_payment(
  p_reference text,
  p_amount_minor bigint,
  p_provider_txn_id text,
  p_source text,
  p_actor uuid default null,
  p_evidence text default null,
  p_provider_event_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_plan public.plans;
  v_sub public.subscriptions;
  v_start timestamptz;
  v_period_start timestamptz;
  v_end timestamptz;
  v_txn text := nullif(trim(coalesce(p_provider_txn_id, '')), '');
begin
  if p_source not in ('admin', 'webhook') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  if p_provider_event_id is not null and exists (
    select 1 from public.payment_events where provider_event_id = p_provider_event_id
  ) then
    return jsonb_build_object('ok', true, 'status', 'duplicate_event');
  end if;

  select * into v_payment from public.payments where reference = p_reference for update;
  if not found then
    insert into public.payment_events (reference, type, source, actor_id, provider_event_id, payload)
    values (left(p_reference, 64), 'rejected_unknown_reference', p_source, p_actor, p_provider_event_id,
            jsonb_build_object('amount_minor', p_amount_minor, 'transaction_id', v_txn));
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;

  if p_source = 'admin' then
    if p_actor is null or not public.is_super_admin(p_actor) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    if p_evidence is null or char_length(trim(p_evidence)) < 10 then
      return jsonb_build_object('ok', false, 'error', 'evidence_required');
    end if;
  end if;

  if v_payment.status = 'confirmed' then
    if v_payment.provider_transaction_id = v_txn then
      return jsonb_build_object('ok', true, 'status', 'already_confirmed');
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_confirmed_other_txn');
  end if;

  if v_payment.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'payment_not_pending', 'status', v_payment.status);
  end if;

  if v_txn is null or char_length(v_txn) > 64 then
    return jsonb_build_object('ok', false, 'error', 'transaction_id_required');
  end if;

  if p_amount_minor is distinct from v_payment.amount_minor then
    insert into public.payment_events (payment_id, reference, type, source, actor_id, provider_event_id, payload)
    values (v_payment.id, v_payment.reference, 'rejected_amount_mismatch', p_source, p_actor, p_provider_event_id,
            jsonb_build_object('expected', v_payment.amount_minor, 'received', p_amount_minor));
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;

  if exists (select 1 from public.payments where provider_transaction_id = v_txn and id <> v_payment.id) then
    insert into public.payment_events (payment_id, reference, type, source, actor_id, provider_event_id, payload)
    values (v_payment.id, v_payment.reference, 'rejected_transaction_reused', p_source, p_actor, p_provider_event_id,
            jsonb_build_object('transaction_id', v_txn));
    return jsonb_build_object('ok', false, 'error', 'transaction_reused');
  end if;

  select * into v_plan from public.plans where id = v_payment.plan_id;

  update public.payments
     set status = 'confirmed',
         provider_transaction_id = v_txn,
         provider = case when p_source = 'webhook' then 'partner' else provider end,
         verification_evidence = case when p_source = 'admin' then trim(p_evidence) else 'webhook verificado' end,
         confirmed_at = now(),
         confirmed_by = case when p_source = 'admin' then p_actor end
   where id = v_payment.id
  returning * into v_payment;

  -- Extensão da assinatura: se ainda ativa, soma a partir da expiração atual.
  select * into v_sub from public.subscriptions where user_id = v_payment.user_id for update;
  if found and v_sub.status = 'active' and v_sub.expires_at > now() then
    v_period_start := v_sub.expires_at;
    v_start := v_sub.starts_at;
  else
    v_period_start := now();
    v_start := now();
  end if;
  v_end := v_period_start + make_interval(months => v_plan.duration_months);

  insert into public.subscriptions as s (user_id, plan_id, status, starts_at, expires_at, payment_method,
                                         transaction_id, last_confirmed_at, status_reason)
  values (v_payment.user_id, v_plan.id, 'active', v_start, v_end, 'multicaixa_express', v_txn, now(), null)
  on conflict (user_id) do update set
    plan_id = excluded.plan_id,
    status = 'active',
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    payment_method = excluded.payment_method,
    transaction_id = excluded.transaction_id,
    last_confirmed_at = excluded.last_confirmed_at,
    status_reason = null
  returning * into v_sub;

  insert into public.subscription_periods (subscription_id, user_id, plan_id, payment_id, period_start, period_end, source)
  values (v_sub.id, v_payment.user_id, v_plan.id, v_payment.id, v_period_start, v_end, 'payment');

  insert into public.payment_events (payment_id, reference, type, source, actor_id, provider_event_id, payload)
  values (v_payment.id, v_payment.reference, 'confirmed', p_source, p_actor, p_provider_event_id,
          jsonb_build_object('transaction_id', v_txn, 'amount_minor', v_payment.amount_minor, 'expires_at', v_end));

  if p_source = 'admin' then
    perform public.write_audit(p_actor, 'payment.confirm', 'payment', v_payment.id::text, trim(p_evidence),
      jsonb_build_object('reference', v_payment.reference, 'transaction_id', v_txn, 'amount_minor', v_payment.amount_minor));
  end if;

  insert into public.notifications (user_id, kind, title, body)
  values (v_payment.user_id, 'payment_confirmed', 'Pagamento confirmado',
          'A sua assinatura ' || v_plan.name || ' está ativa até ' || to_char(v_end at time zone 'Africa/Luanda', 'DD/MM/YYYY') || '.');

  return jsonb_build_object('ok', true, 'status', 'confirmed', 'payment_id', v_payment.id,
                            'user_id', v_payment.user_id, 'expires_at', v_end);
end $$;

create or replace function public.reject_payment(p_payment_id uuid, p_actor uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
begin
  if not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;
  if v_payment.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'payment_not_pending');
  end if;

  update public.payments set status = 'rejected', rejected_reason = trim(p_reason) where id = p_payment_id;

  update public.subscriptions set status = 'cancelled', status_reason = 'Pagamento rejeitado'
   where user_id = v_payment.user_id and status = 'pending_payment'
     and not exists (select 1 from public.payments where user_id = v_payment.user_id and status = 'pending');

  insert into public.payment_events (payment_id, reference, type, source, actor_id, payload)
  values (v_payment.id, v_payment.reference, 'rejected', 'admin', p_actor, jsonb_build_object('reason', trim(p_reason)));
  perform public.write_audit(p_actor, 'payment.reject', 'payment', p_payment_id::text, trim(p_reason),
                             jsonb_build_object('reference', v_payment.reference));
  insert into public.notifications (user_id, kind, title, body)
  values (v_payment.user_id, 'payment_rejected', 'Pagamento não confirmado',
          'Não foi possível confirmar o pagamento ' || v_payment.reference || '. Contacte o suporte se precisar de ajuda.');
  return jsonb_build_object('ok', true, 'status', 'rejected');
end $$;

-- Correção auditável de um pagamento confirmado (estorno/erro). Nada é apagado.
create or replace function public.reverse_payment(p_payment_id uuid, p_actor uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_period public.subscription_periods;
  v_sub public.subscriptions;
  v_new_exp timestamptz;
begin
  if not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error', 'payment_not_confirmed');
  end if;

  update public.payments set status = 'reversed', rejected_reason = trim(p_reason) where id = p_payment_id;

  select * into v_period from public.subscription_periods where payment_id = p_payment_id;
  if found and v_period.reversed_at is null then
    update public.subscription_periods set reversed_at = now() where id = v_period.id;
    select * into v_sub from public.subscriptions where id = v_period.subscription_id for update;
    v_new_exp := v_sub.expires_at - (v_period.period_end - v_period.period_start);
    if v_new_exp <= coalesce(v_sub.starts_at, now()) or v_new_exp <= now() then
      update public.subscriptions
         set status = case when status = 'active' then 'expired'::public.subscription_status else status end,
             expires_at = greatest(v_new_exp, starts_at + interval '1 second'),
             status_reason = 'Pagamento revertido'
       where id = v_sub.id;
    else
      update public.subscriptions set expires_at = v_new_exp, status_reason = 'Pagamento revertido' where id = v_sub.id;
    end if;
  end if;

  insert into public.payment_events (payment_id, reference, type, source, actor_id, payload)
  values (v_payment.id, v_payment.reference, 'reversed', 'admin', p_actor, jsonb_build_object('reason', trim(p_reason)));
  perform public.write_audit(p_actor, 'payment.reverse', 'payment', p_payment_id::text, trim(p_reason),
                             jsonb_build_object('reference', v_payment.reference));
  return jsonb_build_object('ok', true, 'status', 'reversed');
end $$;

create or replace function public.cancel_own_pending_payment(p_user uuid, p_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where reference = p_reference and user_id = p_user for update;
  if not found or v_payment.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'payment_not_pending');
  end if;
  update public.payments set status = 'cancelled' where id = v_payment.id;
  insert into public.payment_events (payment_id, reference, type, source, actor_id)
  values (v_payment.id, v_payment.reference, 'cancelled_by_customer', 'customer', p_user);
  update public.subscriptions set status = 'cancelled', status_reason = 'Pedido cancelado pelo cliente'
   where user_id = p_user and status = 'pending_payment'
     and not exists (select 1 from public.payments where user_id = p_user and status = 'pending');
  return jsonb_build_object('ok', true);
end $$;

-- Acesso manual concedido pelo super admin (motivo e expiração obrigatórios).
create or replace function public.grant_manual_access(p_user uuid, p_expires_at timestamptz, p_reason text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions;
  v_start timestamptz;
begin
  if not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '5 years' then
    return jsonb_build_object('ok', false, 'error', 'invalid_expiry');
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  select * into v_sub from public.subscriptions where user_id = p_user for update;
  if found and v_sub.status = 'active' and v_sub.expires_at > now() then
    v_start := v_sub.starts_at;
  else
    v_start := now();
  end if;

  insert into public.subscriptions as s (user_id, plan_id, status, starts_at, expires_at, payment_method, last_confirmed_at, status_reason)
  values (p_user, null, 'active', v_start, p_expires_at, 'manual_grant', now(), trim(p_reason))
  on conflict (user_id) do update set
    status = 'active', starts_at = excluded.starts_at, expires_at = excluded.expires_at,
    payment_method = 'manual_grant', last_confirmed_at = now(), status_reason = excluded.status_reason
  returning * into v_sub;

  insert into public.subscription_periods (subscription_id, user_id, period_start, period_end, source, granted_by, reason)
  values (v_sub.id, p_user, now(), p_expires_at, 'manual_grant', p_actor, trim(p_reason));

  perform public.write_audit(p_actor, 'subscription.manual_grant', 'user', p_user::text, trim(p_reason),
                             jsonb_build_object('expires_at', p_expires_at));
  insert into public.notifications (user_id, kind, title, body)
  values (p_user, 'access_granted', 'Acesso premium ativado',
          'O seu acesso premium está ativo até ' || to_char(p_expires_at at time zone 'Africa/Luanda', 'DD/MM/YYYY') || '.');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_subscription_status(
  p_user uuid, p_status public.subscription_status, p_reason text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions;
begin
  if not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_status not in ('suspended', 'cancelled', 'active') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_sub from public.subscriptions where user_id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'subscription_not_found');
  end if;
  if p_status = 'active' and (v_sub.status <> 'suspended' or v_sub.expires_at <= now()) then
    return jsonb_build_object('ok', false, 'error', 'cannot_reactivate');
  end if;
  begin
    update public.subscriptions set status = p_status, status_reason = trim(p_reason) where id = v_sub.id;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_transition');
  end;
  perform public.write_audit(p_actor, 'subscription.set_status', 'user', p_user::text, trim(p_reason),
                             jsonb_build_object('from', v_sub.status, 'to', p_status));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_account_status(
  p_user uuid, p_status public.account_status, p_reason text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prev public.account_status;
begin
  if not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user = p_actor then
    return jsonb_build_object('ok', false, 'error', 'cannot_change_self');
  end if;
  if p_status not in ('active', 'suspended') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select status into v_prev from public.profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  update public.profiles set status = p_status, status_reason = trim(p_reason) where id = p_user;
  perform public.write_audit(p_actor, 'account.set_status', 'user', p_user::text, trim(p_reason),
                             jsonb_build_object('from', v_prev, 'to', p_status));
  return jsonb_build_object('ok', true);
end $$;

-- Expiração automática (executada por cron). O acesso já é negado em tempo real
-- por has_premium_access(); isto apenas sincroniza estados para relatórios.
create or replace function public.expire_stale_records()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_subs int;
  v_pays int;
begin
  update public.subscriptions set status = 'expired', status_reason = 'Período terminado'
   where status = 'active' and expires_at <= now();
  get diagnostics v_subs = row_count;

  with expired as (
    update public.payments set status = 'expired'
     where status = 'pending' and created_at < now() - interval '7 days'
     returning id, reference
  )
  insert into public.payment_events (payment_id, reference, type, source)
  select id, reference, 'expired', 'system' from expired;
  get diagnostics v_pays = row_count;

  update public.subscriptions s set status = 'cancelled', status_reason = 'Pedido de pagamento expirado'
   where s.status = 'pending_payment'
     and not exists (select 1 from public.payments p where p.user_id = s.user_id and p.status = 'pending');

  delete from public.rate_limits where window_start < now() - interval '1 day';
  return jsonb_build_object('subscriptions_expired', v_subs, 'payments_expired', v_pays);
end $$;

-- Registo de reprodução (posição e contagem).
create or replace function public.record_playback(p_user uuid, p_content uuid, p_position int, p_duration int, p_new_play boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_play_content(p_user, p_content) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.listening_history as h (user_id, content_id, position_seconds, duration_seconds)
  values (p_user, p_content, greatest(p_position, 0), nullif(greatest(coalesce(p_duration, 0), 0), 0))
  on conflict (user_id, content_id) do update set
    position_seconds = greatest(excluded.position_seconds, 0),
    duration_seconds = coalesce(excluded.duration_seconds, h.duration_seconds),
    play_count = h.play_count + case when p_new_play then 1 else 0 end,
    last_played_at = now();
end $$;

-- Métricas do painel (apenas transações confirmadas contam como receita).
create or replace function public.admin_metrics(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_new', (select count(*) from public.profiles where created_at between p_from and p_to),
    'subs_active', (select count(*) from public.subscriptions where status = 'active' and expires_at > now()),
    'subs_expired', (select count(*) from public.subscriptions where status = 'expired' or (status = 'active' and expires_at <= now())),
    'payments_pending', (select count(*) from public.payments where status = 'pending'),
    'payments_confirmed', (select count(*) from public.payments where status = 'confirmed' and confirmed_at between p_from and p_to),
    'revenue_minor', (select coalesce(sum(amount_minor), 0) from public.payments where status = 'confirmed' and confirmed_at between p_from and p_to),
    'revenue_by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('plan', pl.name, 'code', pl.code, 'revenue_minor', x.rev, 'count', x.n) order by pl.sort_order), '[]')
      from (select plan_id, sum(amount_minor) rev, count(*) n from public.payments
            where status = 'confirmed' and confirmed_at between p_from and p_to group by plan_id) x
      join public.plans pl on pl.id = x.plan_id
    ),
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d), '[]')
      from (select (created_at at time zone 'Africa/Luanda')::date d, count(*) n from public.profiles
            where created_at between p_from and p_to group by 1) s
    ),
    'revenue_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'revenue_minor', r) order by d), '[]')
      from (select (confirmed_at at time zone 'Africa/Luanda')::date d, sum(amount_minor) r from public.payments
            where status = 'confirmed' and confirmed_at between p_from and p_to group by 1) s
    ),
    'top_content', (
      select coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'slug', c.slug, 'plays', t.plays) order by t.plays desc), '[]')
      from (select content_id, sum(play_count) plays from public.listening_history
            where last_played_at between p_from and p_to group by content_id order by 2 desc limit 8) t
      join public.content_items c on c.id = t.content_id
    ),
    'renewal', (
      select jsonb_build_object('eligible', count(*), 'renewed', count(*) filter (where renewed))
      from (
        select p1.user_id, exists (
          select 1 from public.subscription_periods p2
          where p2.user_id = p1.user_id and p2.source = 'payment' and p2.reversed_at is null
            and p2.period_start >= p1.period_end - interval '1 second' and p2.id <> p1.id
        ) renewed
        from public.subscription_periods p1
        where p1.source = 'payment' and p1.reversed_at is null and p1.period_end <= now()
      ) r
    )
  );
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_periods enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.categories enable row level security;
alter table public.content_items enable row level security;
alter table public.content_media enable row level security;
alter table public.content_categories enable row level security;
alter table public.favorites enable row level security;
alter table public.listening_history enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.support_requests enable row level security;
alter table public.rate_limits enable row level security;

-- Perfis: leitura do próprio; o cliente só pode alterar full_name.
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

-- Papéis: o utilizador pode ver os seus, nunca escrever.
create policy roles_select_own on public.roles for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.roles from authenticated, anon;

create policy prefs_select_own on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy prefs_update_own on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.user_preferences from authenticated, anon;
revoke update on public.user_preferences from authenticated, anon;
grant update (preferred_categories, marketing_consent, analytics_consent) on public.user_preferences to authenticated;

-- Planos: leitura pública dos planos ativos.
create policy plans_public_read on public.plans for select to anon, authenticated using (is_active);
revoke insert, update, delete on public.plans from authenticated, anon;

-- Assinaturas/pagamentos: só leitura dos próprios. Nenhuma escrita direta pelo cliente.
create policy subs_select_own on public.subscriptions for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.subscriptions from authenticated, anon;
create policy periods_select_own on public.subscription_periods for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.subscription_periods from authenticated, anon;
create policy payments_select_own on public.payments for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.payments from authenticated, anon;
revoke all on public.payment_events from authenticated, anon;

-- Catálogo: metadados publicados são públicos; media só para quem pode reproduzir.
create policy categories_public_read on public.categories for select to anon, authenticated using (is_visible);
revoke insert, update, delete on public.categories from authenticated, anon;
create policy content_public_read on public.content_items for select to anon, authenticated using (status = 'published');
revoke insert, update, delete on public.content_items from authenticated, anon;
create policy content_media_entitled on public.content_media for select to authenticated
  using (public.can_play_content(auth.uid(), content_id));
revoke insert, update, delete on public.content_media from authenticated, anon;
revoke select on public.content_media from anon;
create policy content_categories_public_read on public.content_categories for select to anon, authenticated using (true);
revoke insert, update, delete on public.content_categories from authenticated, anon;

-- Favoritos e histórico: do próprio utilizador.
create policy favorites_own_select on public.favorites for select to authenticated using (user_id = auth.uid());
create policy favorites_own_insert on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy favorites_own_delete on public.favorites for delete to authenticated using (user_id = auth.uid());
revoke update on public.favorites from authenticated, anon;
create policy history_own_select on public.listening_history for select to authenticated using (user_id = auth.uid());
create policy history_own_delete on public.listening_history for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.listening_history from authenticated, anon;

create policy notifications_own_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.notifications from authenticated, anon;
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- Tabelas administrativas: sem acesso direto do cliente (apenas service_role).
revoke all on public.admin_audit_logs from authenticated, anon;
revoke all on public.rate_limits from authenticated, anon;
revoke all on public.support_requests from authenticated, anon;
create policy settings_public_read on public.platform_settings for select to anon, authenticated using (is_public);
revoke insert, update, delete on public.platform_settings from authenticated, anon;

-- Funções privilegiadas: apenas service_role (servidor). Leitura de acesso: authenticated.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'check_rate_limit(text,int,int)',
    'write_audit(uuid,text,text,text,text,jsonb)',
    'create_payment_order(uuid,text)',
    'report_payment(uuid,text,text,text)',
    'confirm_payment(text,bigint,text,text,uuid,text,text)',
    'reject_payment(uuid,uuid,text)',
    'reverse_payment(uuid,uuid,text)',
    'cancel_own_pending_payment(uuid,text)',
    'grant_manual_access(uuid,timestamptz,text,uuid)',
    'admin_set_subscription_status(uuid,public.subscription_status,text,uuid)',
    'admin_set_account_status(uuid,public.account_status,text,uuid)',
    'expire_stale_records()',
    'record_playback(uuid,uuid,int,int,boolean)',
    'admin_metrics(timestamptz,timestamptz)',
    'handle_new_user()',
    'handle_user_email_change()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

revoke all on function public.has_premium_access(uuid) from public, anon;
grant execute on function public.has_premium_access(uuid) to authenticated, service_role;
revoke all on function public.can_play_content(uuid, uuid) from public, anon;
grant execute on function public.can_play_content(uuid, uuid) to authenticated, service_role;
revoke all on function public.is_super_admin(uuid) from public, anon;
grant execute on function public.is_super_admin(uuid) to authenticated, service_role;
