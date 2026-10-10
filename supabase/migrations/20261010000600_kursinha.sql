-- Vendas da Kursinha (app.kursinha.com) → acesso premium na AUREA.
--
-- A Kursinha envia webhooks de venda (sale.pending, sale.approved, sale.cancelled),
-- conforme https://github.com/kursinha1/kursinha-docs/blob/main/WEBHOOKS_GUIDE.md.
-- Não existe um conceito de "assinatura" na Kursinha: cada venda aprovada é um
-- pagamento que ativa ou estende o plano cujo preço corresponde ao valor da venda.
--
-- Regras:
--  * O servidor (rota /api/payments/webhook/kursinha) verifica a autenticidade
--    antes de chamar kursinha_handle_event; nenhuma destas funções é exposta a clientes.
--  * A conta é encontrada pelo e-mail do comprador, só se esse e-mail estiver confirmado.
--    Sem conta, a venda fica "à espera de conta" e é aplicada quando o e-mail for confirmado.
--  * O valor tem de corresponder exatamente ao preço de um plano ativo.
--  * Entregas repetidas (event + saleId) são ignoradas; a ordem dos eventos não é garantida.
--  * sale.cancelled depois de uma ativação (estorno/reembolso) reverte o período concedido.

-- ------------------------------------------------------------------ Pagamentos: nova origem
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('manual_review', 'partner', 'kursinha'));
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('multicaixa_express', 'kursinha'));

-- ------------------------------------------------------------------ Tabelas
create table if not exists public.kursinha_sales (
  sale_id text primary key check (char_length(sale_id) between 1 and 64),
  order_id text,
  status text not null check (status in ('pending', 'approved', 'cancelled')),
  status_at timestamptz not null,
  product_id text,
  product_name text,
  amount_minor bigint,
  buyer_email text not null,
  buyer_name text,
  payment_method text,
  transaction_id text,
  user_id uuid references public.profiles (id) on delete set null,
  plan_id uuid references public.plans (id),
  payment_id uuid references public.payments (id),
  outcome text not null default 'received' check (outcome in (
    'received', 'pending', 'activated', 'awaiting_account', 'no_matching_plan',
    'ignored_product', 'cancelled', 'reversed', 'error'
  )),
  outcome_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kursinha_sales_created_idx on public.kursinha_sales (created_at desc);
create index if not exists kursinha_sales_awaiting_idx on public.kursinha_sales (lower(buyer_email)) where outcome = 'awaiting_account';

drop trigger if exists kursinha_sales_updated_at on public.kursinha_sales;
create trigger kursinha_sales_updated_at before update on public.kursinha_sales
  for each row execute function public.tg_set_updated_at();

-- Registo de entregas recebidas (só acrescentar). event_key = event || ':' || saleId.
create table if not exists public.kursinha_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event text not null,
  sale_id text not null,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now()
);
create index if not exists kursinha_events_sale_idx on public.kursinha_events (sale_id, received_at);
drop trigger if exists kursinha_events_no_delete on public.kursinha_events;
create trigger kursinha_events_no_delete before delete on public.kursinha_events
  for each row execute function public.tg_forbid_delete();
drop trigger if exists kursinha_events_no_update on public.kursinha_events;
create trigger kursinha_events_no_update before update on public.kursinha_events
  for each row execute function public.tg_append_only_update();

alter table public.kursinha_sales enable row level security;
alter table public.kursinha_events enable row level security;
revoke all on public.kursinha_sales from anon, authenticated;
revoke all on public.kursinha_events from anon, authenticated;

-- ------------------------------------------------------------------ Aplicar uma venda aprovada
-- Cria o pagamento e confirma-o pelo caminho normal (confirm_payment), que valida o valor,
-- a reutilização da transação e estende a assinatura. Idempotente.
create or replace function public.kursinha_apply_sale(p_sale_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sale public.kursinha_sales;
  v_plan public.plans;
  v_user uuid;
  v_payment public.payments;
  v_ref text;
  v_try int := 0;
  v_r jsonb;
begin
  select * into v_sale from public.kursinha_sales where sale_id = p_sale_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sale_not_found');
  end if;
  if v_sale.status <> 'approved' or v_sale.outcome = 'ignored_product' then
    return jsonb_build_object('ok', true, 'status', v_sale.outcome);
  end if;
  if v_sale.payment_id is not null then
    return jsonb_build_object('ok', true, 'status', 'already_applied');
  end if;

  select * into v_plan from public.plans
   where is_active and amount_minor = v_sale.amount_minor
   order by sort_order, duration_months limit 1;
  if not found then
    update public.kursinha_sales
       set outcome = 'no_matching_plan',
           outcome_detail = 'Nenhum plano ativo custa ' || coalesce((v_sale.amount_minor / 100)::text, '?') || ' Kz.'
     where sale_id = p_sale_id;
    perform public.notify_admin('kursinha.no_plan', 'warning', 'Venda Kursinha sem plano correspondente',
      'Venda ' || p_sale_id || ' (' || coalesce(v_sale.product_name, 'produto') || ', ' || v_sale.buyer_email ||
      '): o valor não corresponde a nenhum plano ativo.', '/admin/kursinha', 'kursinha.no_plan:' || p_sale_id);
    return jsonb_build_object('ok', true, 'status', 'no_matching_plan');
  end if;

  select u.id into v_user
    from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(v_sale.buyer_email) and u.email_confirmed_at is not null
   order by u.email_confirmed_at limit 1;
  if v_user is null then
    update public.kursinha_sales
       set outcome = 'awaiting_account', plan_id = v_plan.id,
           outcome_detail = 'Será ativado quando o cliente criar conta e confirmar este e-mail.'
     where sale_id = p_sale_id;
    return jsonb_build_object('ok', true, 'status', 'awaiting_account');
  end if;

  loop
    v_try := v_try + 1;
    v_ref := 'AUR-' || upper(substr(translate(encode(decode(md5(random()::text || clock_timestamp()::text || p_sale_id), 'hex'), 'base64'), '+/=0O1IL', ''), 1, 8));
    begin
      insert into public.payments (user_id, plan_id, reference, amount_minor, method, provider, customer_reported_transaction_id)
      values (v_user, v_plan.id, v_ref, v_plan.amount_minor, 'kursinha', 'kursinha', left(v_sale.transaction_id, 64))
      returning * into v_payment;
      exit;
    exception when unique_violation then
      if v_try > 5 then raise; end if;
    end;
  end loop;

  insert into public.payment_events (payment_id, reference, type, source, payload)
  values (v_payment.id, v_payment.reference, 'created', 'webhook',
          jsonb_build_object('plan', v_plan.code, 'amount_minor', v_plan.amount_minor, 'kursinha_sale_id', p_sale_id,
                             'kursinha_order_id', v_sale.order_id, 'kursinha_payment_method', v_sale.payment_method));

  v_r := public.confirm_payment(v_payment.reference, v_sale.amount_minor, 'kursinha:' || p_sale_id, 'webhook',
                                null, null, 'kursinha:sale.approved:' || p_sale_id);
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    update public.kursinha_sales
       set outcome = 'error', user_id = v_user, plan_id = v_plan.id, payment_id = v_payment.id,
           outcome_detail = 'Confirmação recusada: ' || coalesce(v_r ->> 'error', 'erro')
     where sale_id = p_sale_id;
    perform public.notify_admin('kursinha.error', 'error', 'Venda Kursinha não aplicada',
      'Venda ' || p_sale_id || ': ' || coalesce(v_r ->> 'error', 'erro'), '/admin/kursinha', 'kursinha.error:' || p_sale_id);
    return jsonb_build_object('ok', false, 'error', coalesce(v_r ->> 'error', 'confirm_failed'));
  end if;

  -- confirm_payment marca a origem webhook como 'partner'; aqui a origem é a Kursinha.
  update public.payments set provider = 'kursinha' where id = v_payment.id;

  update public.kursinha_sales
     set outcome = 'activated', user_id = v_user, plan_id = v_plan.id, payment_id = v_payment.id,
         outcome_detail = 'Plano ' || v_plan.name || ' ativo até ' || to_char(((v_r ->> 'expires_at')::timestamptz) at time zone 'Africa/Luanda', 'DD/MM/YYYY') || '.'
   where sale_id = p_sale_id;
  return jsonb_build_object('ok', true, 'status', 'activated', 'payment_id', v_payment.id, 'user_id', v_user);
end $$;

-- ------------------------------------------------------------------ Reverter (estorno / cancelamento)
create or replace function public.kursinha_reverse_sale(p_sale_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sale public.kursinha_sales;
  v_payment public.payments;
  v_period public.subscription_periods;
  v_sub public.subscriptions;
  v_new_exp timestamptz;
begin
  select * into v_sale from public.kursinha_sales where sale_id = p_sale_id for update;
  if not found or v_sale.payment_id is null then
    return jsonb_build_object('ok', true, 'status', 'nothing_to_reverse');
  end if;
  select * into v_payment from public.payments where id = v_sale.payment_id for update;
  if v_payment.status <> 'confirmed' then
    return jsonb_build_object('ok', true, 'status', 'nothing_to_reverse');
  end if;

  update public.payments set status = 'reversed', rejected_reason = 'Venda cancelada/reembolsada na Kursinha'
   where id = v_payment.id;

  select * into v_period from public.subscription_periods where payment_id = v_payment.id;
  if found and v_period.reversed_at is null then
    update public.subscription_periods set reversed_at = now() where id = v_period.id;
    select * into v_sub from public.subscriptions where id = v_period.subscription_id for update;
    v_new_exp := v_sub.expires_at - (v_period.period_end - v_period.period_start);
    if v_new_exp <= coalesce(v_sub.starts_at, now()) or v_new_exp <= now() then
      update public.subscriptions
         set status = case when status = 'active' then 'expired'::public.subscription_status else status end,
             expires_at = greatest(v_new_exp, starts_at + interval '1 second'),
             status_reason = 'Venda Kursinha cancelada'
       where id = v_sub.id;
    else
      update public.subscriptions set expires_at = v_new_exp, status_reason = 'Venda Kursinha cancelada' where id = v_sub.id;
    end if;
  end if;

  insert into public.payment_events (payment_id, reference, type, source, provider_event_id, payload)
  values (v_payment.id, v_payment.reference, 'reversed', 'webhook', 'kursinha:sale.cancelled:' || p_sale_id,
          jsonb_build_object('reason', 'sale.cancelled', 'kursinha_sale_id', p_sale_id));

  update public.kursinha_sales set outcome = 'reversed', outcome_detail = 'Acesso deste pagamento retirado.'
   where sale_id = p_sale_id;
  perform public.notify_admin('kursinha.reversed', 'warning', 'Venda Kursinha cancelada após ativação',
    'Venda ' || p_sale_id || ' (' || v_sale.buyer_email || ') foi cancelada ou reembolsada; o período foi revertido.',
    '/admin/kursinha', 'kursinha.reversed:' || p_sale_id);
  return jsonb_build_object('ok', true, 'status', 'reversed');
end $$;

-- ------------------------------------------------------------------ Ponto de entrada do webhook
-- p: notificação já autenticada e normalizada pelo servidor:
--   { event, sale_id, order_id, occurred_at, product_id, product_name, amount_minor,
--     buyer_email, buyer_name, payment_method, transaction_id, raw }
create or replace function public.kursinha_handle_event(p jsonb, p_product_allowed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event text := p ->> 'event';
  v_sale_id text := p ->> 'sale_id';
  v_at timestamptz := coalesce((p ->> 'occurred_at')::timestamptz, now());
  v_status text;
  v_sale public.kursinha_sales;
  v_inserted boolean;
begin
  v_status := case v_event when 'sale.pending' then 'pending' when 'sale.approved' then 'approved'
                           when 'sale.cancelled' then 'cancelled' end;
  if v_status is null or v_sale_id is null or nullif(trim(coalesce(p ->> 'buyer_email', '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_payload');
  end if;

  insert into public.kursinha_events (event_key, event, sale_id, payload)
  values (v_event || ':' || v_sale_id, v_event, v_sale_id, coalesce(p -> 'raw', '{}'))
  on conflict (event_key) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'status', 'duplicate');
  end if;

  insert into public.kursinha_sales (sale_id, order_id, status, status_at, product_id, product_name, amount_minor,
                                     buyer_email, buyer_name, payment_method, transaction_id, outcome)
  values (v_sale_id, p ->> 'order_id', v_status, v_at, p ->> 'product_id', left(p ->> 'product_name', 200),
          (p ->> 'amount_minor')::bigint, lower(trim(p ->> 'buyer_email')), left(p ->> 'buyer_name', 120),
          p ->> 'payment_method', left(p ->> 'transaction_id', 64),
          case when p_product_allowed then 'received' else 'ignored_product' end)
  on conflict (sale_id) do nothing;
  v_inserted := found;

  select * into v_sale from public.kursinha_sales where sale_id = v_sale_id for update;

  if not v_inserted then
    -- Ordem não garantida: "cancelada" é final e "pendente" nunca substitui outro estado.
    if v_sale.status = 'cancelled' or v_status = 'pending' or v_status = v_sale.status then
      return jsonb_build_object('ok', true, 'status', 'ignored_out_of_order');
    end if;
    update public.kursinha_sales
       set status = v_status, status_at = v_at,
           transaction_id = coalesce(left(p ->> 'transaction_id', 64), transaction_id),
           payment_method = coalesce(p ->> 'payment_method', payment_method)
     where sale_id = v_sale_id
    returning * into v_sale;
  end if;

  if v_sale.outcome = 'ignored_product' then
    return jsonb_build_object('ok', true, 'status', 'ignored_product');
  end if;

  if v_status = 'pending' then
    update public.kursinha_sales set outcome = 'pending', outcome_detail = 'A aguardar pagamento na Kursinha.'
     where sale_id = v_sale_id;
    return jsonb_build_object('ok', true, 'status', 'pending');
  elsif v_status = 'approved' then
    return public.kursinha_apply_sale(v_sale_id);
  else
    if v_sale.payment_id is not null then
      return public.kursinha_reverse_sale(v_sale_id);
    end if;
    update public.kursinha_sales set outcome = 'cancelled', outcome_detail = 'Cancelada, expirada ou recusada na Kursinha.'
     where sale_id = v_sale_id;
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;
end $$;

-- ------------------------------------------------------------------ Conta criada depois da compra
-- Quando um e-mail fica confirmado, aplica as vendas aprovadas que esperavam por essa conta.
create or replace function public.kursinha_claim_for_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sale_id text;
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null and old.email is not distinct from new.email then
    return new;
  end if;
  for v_sale_id in
    select sale_id from public.kursinha_sales
     where outcome = 'awaiting_account' and lower(buyer_email) = lower(new.email)
     order by status_at
  loop
    begin
      perform public.kursinha_apply_sale(v_sale_id);
    exception when others then
      -- Nunca impedir o registo/confirmação da conta; o admin vê a venda pendente.
      perform public.notify_admin('kursinha.error', 'error', 'Venda Kursinha não aplicada',
        'Venda ' || v_sale_id || ': ' || sqlerrm, '/admin/kursinha', 'kursinha.claim_error:' || v_sale_id);
    end;
  end loop;
  return new;
end $$;

-- O nome ordena este gatilho depois de on_auth_user_created (que cria o perfil).
drop trigger if exists on_auth_user_kursinha_claim on auth.users;
create trigger on_auth_user_kursinha_claim after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.kursinha_claim_for_user();

-- ------------------------------------------------------------------ Privilégios
revoke all on function public.kursinha_apply_sale(text) from public, anon, authenticated;
revoke all on function public.kursinha_reverse_sale(text) from public, anon, authenticated;
revoke all on function public.kursinha_handle_event(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.kursinha_claim_for_user() from public, anon, authenticated;
grant execute on function public.kursinha_apply_sale(text) to service_role;
grant execute on function public.kursinha_reverse_sale(text) to service_role;
grant execute on function public.kursinha_handle_event(jsonb, boolean) to service_role;
