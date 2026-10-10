-- Termina todas as sessões de um utilizador (invalida refresh tokens).
-- O access token atual expira no prazo configurado no Supabase (por omissão 1 h);
-- as verificações de estado da conta no servidor bloqueiam o acesso de imediato.
create or replace function public.admin_revoke_sessions(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.sessions where user_id = p_user;
end $$;

revoke all on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;
