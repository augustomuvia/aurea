-- =====================================================================
-- AUREA — envio aos clientes atuais e recibos de pagamento
--
-- 1. Envio único aos clientes que já existiam antes dos e-mails automáticos:
--    boas-vindas e "pagamento confirmado" com recibo em PDF. O PDF é gerado
--    pelo servidor no momento do envio; nada de grande fica na base de dados.
-- 2. A fila dá prioridade aos e-mails transacionais: um envio em massa nunca
--    atrasa as instruções de um pedido novo.
-- 3. Revalidação: um e-mail de pagamento confirmado (e o recibo) não sai se o
--    pagamento entretanto tiver sido revertido.
--
-- Requer 20261010000400_notifications.sql. Idempotente e não destrutivo:
-- não cria tabelas nem apaga dados; só funções. Pode ser executado de novo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fila: transacionais primeiro, envios aos clientes atuais depois
-- ---------------------------------------------------------------------
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
      order by (x.event_type like 'backfill.%'), x.next_attempt_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning j.*;
end $$;

-- ---------------------------------------------------------------------
-- Revalidação no envio (igual à anterior + pagamento revertido + conta suspensa)
-- ---------------------------------------------------------------------
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
  elsif j.template_key in ('plan_activated', 'payment_receipt') then
    -- Leva o recibo: só sai enquanto o pagamento estiver confirmado.
    select * into pay from public.payments where id = j.payment_id;
    if not found or pay.status <> 'confirmed' then return 'O pagamento já não está confirmado'; end if;
  end if;

  if j.audience = 'customer' and j.user_id is null then
    return 'Conta encerrada';
  end if;
  if j.event_type like 'backfill.%' and exists (select 1 from public.profiles where id = j.user_id and status <> 'active') then
    return 'Conta suspensa';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Clientes atuais: quem ainda não recebeu cada e-mail
--
-- Boas-vindas: conta com e-mail confirmado, ativa, sem papel administrativo e
-- sem nenhum e-mail de boas-vindas (real) registado, em qualquer estado.
-- Pagamento: pagamento confirmado de uma conta ativa, sem papel administrativo,
-- sem e-mail "plano ativado" nem "pagamento confirmado com recibo" registado.
-- Os envios de teste (is_test) nunca contam nem são incluídos.
-- ---------------------------------------------------------------------
create or replace function public.notif_backfill_candidates(p_kind text)
returns table (c_user uuid, c_payment uuid, c_email text, c_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, null::uuid, lower(trim(p.email)), p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
   where p_kind = 'welcome'
     and u.email_confirmed_at is not null
     and p.status = 'active'
     and position('@' in p.email) > 1
     and not exists (select 1 from public.roles r where r.user_id = p.id)
     and not exists (select 1 from public.email_jobs j where j.user_id = p.id and j.template_key = 'welcome' and not j.is_test)
  union all
  select pay.user_id, pay.id, lower(trim(p.email)), pay.confirmed_at
    from public.payments pay
    join public.profiles p on p.id = pay.user_id
   where p_kind = 'payment'
     and pay.status = 'confirmed'
     and p.status = 'active'
     and position('@' in p.email) > 1
     and not exists (select 1 from public.roles r where r.user_id = p.id)
     and not exists (select 1 from public.email_jobs j
                      where j.payment_id = pay.id and j.template_key in ('plan_activated', 'payment_receipt') and not j.is_test)
  order by 4, 1;
$$;

-- Pré-visualização para o painel: totais exatos e alguns destinatários.
create or replace function public.notif_backfill_preview(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_out jsonb := jsonb_build_object('ok', true, 'test_mode', coalesce((public.notif_settings() ->> 'test_mode')::boolean, false));
  k text;
begin
  if not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  foreach k in array array['welcome', 'payment'] loop
    v_out := v_out || jsonb_build_object(k, jsonb_build_object(
      'count', (select count(*) from public.notif_backfill_candidates(k)),
      'enabled', public.notif_email_enabled(case k when 'welcome' then 'welcome' else 'plan_activated' end),
      'sample', coalesce((select jsonb_agg(c_email) from (select c_email from public.notif_backfill_candidates(k) limit 5) s), '[]'::jsonb)
    ));
  end loop;
  return v_out;
end $$;

-- Coloca na fila (não envia). p_expected é o total que o admin confirmou: se
-- mudou entretanto, nada é feito. Chaves backfill:<tipo>:<id> impedem duplicados
-- mesmo com cliques repetidos ou pedidos simultâneos.
create or replace function public.notif_backfill_enqueue(p_actor uuid, p_kind text, p_expected int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_eligible int;
  v_new int := 0;
begin
  if not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_kind is null or p_kind not in ('welcome', 'payment') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if not public.notif_email_enabled(case p_kind when 'welcome' then 'welcome' else 'plan_activated' end) then
    return jsonb_build_object('ok', false, 'error', 'disabled');
  end if;
  -- Em modo de teste os e-mails a clientes seriam descartados e não poderiam ser reenviados.
  if coalesce((public.notif_settings() ->> 'test_mode')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'test_mode');
  end if;

  -- Um envio de cada vez.
  perform pg_advisory_xact_lock(hashtext('aurea:notif_backfill'));
  select count(*) into v_eligible from public.notif_backfill_candidates(p_kind);
  if p_expected is distinct from v_eligible then
    return jsonb_build_object('ok', false, 'error', 'count_changed', 'eligible', v_eligible);
  end if;

  if p_kind = 'welcome' then
    insert into public.email_jobs (idempotency_key, event_type, template_key, audience, to_email, user_id, payload)
    select 'backfill:welcome:' || c.c_user, 'backfill.welcome', 'welcome', 'customer', c.c_email, c.c_user,
           jsonb_build_object('nome', coalesce(p.full_name, ''), 'email', p.email, 'user_id', p.id)
      from public.notif_backfill_candidates('welcome') c
      join public.profiles p on p.id = c.c_user
    on conflict (idempotency_key) do nothing;
  else
    insert into public.email_jobs (idempotency_key, event_type, template_key, audience, to_email,
                                   user_id, subscription_id, payment_id, payload)
    select 'backfill:payment:' || pay.id, 'backfill.payment_receipt', 'payment_receipt', 'customer', c.c_email,
           pay.user_id, sp.subscription_id, pay.id,
           jsonb_build_object(
             'nome', coalesce(p.full_name, ''),
             'email', p.email,
             'user_id', pay.user_id,
             'subscription_id', sp.subscription_id,
             'payment_id', pay.id,
             'reference', pay.reference,
             'amount_minor', pay.amount_minor,
             'plan', pl.name,
             'plan_code', pl.code,
             'duration_months', pl.duration_months,
             'method', pay.method,
             'provider', pay.provider,
             'transaction_id', pay.provider_transaction_id,
             'created_at', pay.created_at,
             'confirmed_at', pay.confirmed_at,
             'status', 'confirmed',
             'starts_at', sp.period_start,
             'period_start', sp.period_start,
             'expires_at', sp.period_end)
      from public.notif_backfill_candidates('payment') c
      join public.payments pay on pay.id = c.c_payment
      join public.profiles p on p.id = pay.user_id
      left join public.plans pl on pl.id = pay.plan_id
      left join public.subscription_periods sp on sp.payment_id = pay.id and sp.reversed_at is null
    on conflict (idempotency_key) do nothing;
  end if;
  get diagnostics v_new = row_count;

  perform public.write_audit(p_actor, 'notifications.backfill', 'email_jobs', p_kind, null,
                             jsonb_build_object('kind', p_kind, 'eligible', v_eligible, 'enqueued', v_new));
  return jsonb_build_object('ok', true, 'eligible', v_eligible, 'enqueued', v_new);
end $$;

-- Privilégios: apenas o servidor executa estas funções.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'claim_email_jobs(int,text,uuid)',
    'email_job_stale_reason(uuid,timestamptz)',
    'notif_backfill_candidates(text)',
    'notif_backfill_preview(uuid)',
    'notif_backfill_enqueue(uuid,text,int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
