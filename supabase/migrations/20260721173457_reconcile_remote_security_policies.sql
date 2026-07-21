-- Reconcile pre-existing remote policies with the dealership-scoped policies from
-- tenant_isolation_rls. Permissive policies combine with OR, so retaining the legacy
-- user_id policy on compliance_answers would weaken dealership isolation.
drop policy if exists users_manage_own_compliance_answers on public.compliance_answers;
drop policy if exists users_manage_own_dealership on public.dealerships;
drop policy if exists users_read_own_profile on public.users;
drop policy if exists users_update_own_profile on public.users;

-- raw_user_meta_data is user-editable and must never assign an authorization role.
-- Administrative role assignment remains in the trusted application context path.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'user'::public.role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger functions do not need to be callable through PostgREST RPC.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
