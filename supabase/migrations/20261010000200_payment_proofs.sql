-- Comprovativo de pagamento (PNG, JPG ou PDF) enviado pelo cliente.
-- O ficheiro fica num bucket PRIVADO do Supabase Storage; só o servidor (service_role)
-- lê e escreve. Enviar o comprovativo NÃO confirma o pagamento nem ativa a assinatura:
-- serve apenas de evidência para a verificação manual pela equipa.

alter table public.payments
  add column if not exists proof_path text,
  add column if not exists proof_mime text,
  add column if not exists proof_size integer,
  add column if not exists proof_uploaded_at timestamptz;

alter table public.payments drop constraint if exists payments_proof_mime_check;
alter table public.payments add constraint payments_proof_mime_check
  check (proof_mime is null or proof_mime in ('image/png', 'image/jpeg', 'application/pdf'));
alter table public.payments drop constraint if exists payments_proof_size_check;
alter table public.payments add constraint payments_proof_size_check
  check (proof_size is null or proof_size between 1 and 4194304);

create or replace function public.attach_payment_proof(
  p_user uuid, p_reference text, p_path text, p_mime text, p_size integer
) returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_previous text;
begin
  select * into v_payment from public.payments where reference = p_reference and user_id = p_user for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'payment_not_pending' using errcode = '23514';
  end if;
  if p_mime is null or p_mime not in ('image/png', 'image/jpeg', 'application/pdf') then
    raise exception 'invalid_proof_type' using errcode = '22023';
  end if;
  if p_size is null or p_size not between 1 and 4194304 then
    raise exception 'invalid_proof_size' using errcode = '22023';
  end if;
  -- O caminho tem de pertencer ao próprio utilizador e ao próprio pedido.
  if p_path is null or p_path !~ ('^' || p_user::text || '/' || p_reference || '-[a-f0-9]{16}\.(png|jpg|pdf)$') then
    raise exception 'invalid_proof_path' using errcode = '22023';
  end if;

  v_previous := v_payment.proof_path;
  update public.payments
     set proof_path = p_path, proof_mime = p_mime, proof_size = p_size, proof_uploaded_at = now()
   where id = v_payment.id
  returning * into v_payment;

  insert into public.payment_events (payment_id, reference, type, source, actor_id, payload)
  values (v_payment.id, v_payment.reference, 'proof_uploaded', 'customer', p_user,
          jsonb_build_object('mime', p_mime, 'size', p_size, 'replaced', v_previous is not null));
  return v_payment;
end $$;

revoke all on function public.attach_payment_proof(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.attach_payment_proof(uuid, text, text, text, integer) to service_role;

-- Bucket privado (só existe no Supabase; nos testes locais o schema storage não existe).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('payment-proofs', 'payment-proofs', false, 4194304, array['image/png', 'image/jpeg', 'application/pdf'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
