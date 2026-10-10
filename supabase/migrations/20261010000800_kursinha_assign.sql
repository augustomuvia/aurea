-- Associar manualmente uma venda Kursinha "à espera de conta" a uma conta AUREA,
-- quando o comprador usou na Kursinha um e-mail diferente do da conta.
-- Só o super admin; fica na auditoria. A ativação segue o caminho normal (kursinha_apply_sale).

alter table public.kursinha_sales add column if not exists assigned_user_id uuid references public.profiles (id) on delete set null;
alter table public.kursinha_sales add column if not exists assigned_by uuid references public.profiles (id) on delete set null;
alter table public.kursinha_sales add column if not exists assigned_at timestamptz;

-- Igual à versão de 20261010000600, mas respeita a conta associada pelo admin.
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

  if v_sale.assigned_user_id is not null then
    -- Conta escolhida pelo admin (o comprador usou outro e-mail na Kursinha).
    select p.id into v_user from public.profiles p where p.id = v_sale.assigned_user_id;
  else
    select u.id into v_user
      from auth.users u join public.profiles p on p.id = u.id
     where lower(u.email) = lower(v_sale.buyer_email) and u.email_confirmed_at is not null
     order by u.email_confirmed_at limit 1;
  end if;
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

create or replace function public.kursinha_assign_sale(p_sale_id text, p_user uuid, p_actor uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sale public.kursinha_sales;
  v_profile public.profiles;
  v_r jsonb;
begin
  if p_actor is null or not public.is_super_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_sale from public.kursinha_sales where sale_id = p_sale_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sale_not_found');
  end if;
  if v_sale.outcome <> 'awaiting_account' or v_sale.payment_id is not null then
    return jsonb_build_object('ok', false, 'error', 'sale_not_awaiting');
  end if;
  select * into v_profile from public.profiles where id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  update public.kursinha_sales
     set assigned_user_id = p_user, assigned_by = p_actor, assigned_at = now()
   where sale_id = p_sale_id;

  v_r := public.kursinha_apply_sale(p_sale_id);

  perform public.write_audit(p_actor, 'kursinha.assign', 'kursinha_sale', p_sale_id, trim(p_reason),
    jsonb_build_object('buyer_email', v_sale.buyer_email, 'user_id', p_user, 'user_email', v_profile.email, 'result', v_r));
  return v_r;
end $$;

revoke all on function public.kursinha_apply_sale(text) from public, anon, authenticated;
grant execute on function public.kursinha_apply_sale(text) to service_role;
revoke all on function public.kursinha_assign_sale(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kursinha_assign_sale(text, uuid, uuid, text) to service_role;
