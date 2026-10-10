-- Áudio AUREA (ecrã bloqueado e ouvir offline) só nos planos que o incluem.
-- Por omissão: Trimestral e Anual. O admin pode mudar em Admin → Planos.
alter table public.plans add column if not exists includes_own_audio boolean not null default false;

update public.plans set includes_own_audio = true where code in ('trimestral', 'anual');

-- Mostrar a vantagem na página de planos (sem duplicar se já lá estiver).
update public.plans
   set features = features || array['Áudios AUREA com o ecrã bloqueado e offline']
 where code in ('trimestral', 'anual')
   and not ('Áudios AUREA com o ecrã bloqueado e offline' = any (features))
   and cardinality(features) < 12;

-- Quem pode ouvir os áudios próprios: super admin, ou assinatura ativa num plano que os inclui.
-- Acessos manuais sem plano não incluem o áudio AUREA.
create or replace function public.has_own_audio_access(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() = p_user) and (
    public.is_super_admin(p_user)
    or exists (
      select 1
      from public.subscriptions s
      join public.plans pl on pl.id = s.plan_id
      join public.profiles p on p.id = s.user_id
      where s.user_id = p_user
        and s.status = 'active'
        and s.expires_at > now()
        and p.status = 'active'
        and pl.includes_own_audio
    ));
$$;

-- Até quando o utilizador pode manter áudios descarregados (fim da assinatura).
-- Super admin sem assinatura: 30 dias, renovados quando volta a abrir a app.
create or replace function public.own_audio_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case
    when not public.has_own_audio_access(p_user) then null
    else coalesce(
      (select s.expires_at from public.subscriptions s
         join public.plans pl on pl.id = s.plan_id
        where s.user_id = p_user and s.status = 'active' and s.expires_at > now() and pl.includes_own_audio),
      now() + interval '30 days')
  end;
$$;

revoke all on function public.has_own_audio_access(uuid) from public, anon;
grant execute on function public.has_own_audio_access(uuid) to authenticated, service_role;
revoke all on function public.own_audio_until(uuid) from public, anon;
grant execute on function public.own_audio_until(uuid) to authenticated, service_role;
