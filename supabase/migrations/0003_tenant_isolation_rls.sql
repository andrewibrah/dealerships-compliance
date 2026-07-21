-- 0003_tenant_isolation_rls.sql
-- Tenant isolation, defense-in-depth (PRD #46 / gaps.md remediation #2).
-- (Numbered 0003: a 0002_auth_trigger.sql already exists; the Supabase CLI keys applied
--  migrations on the leading version, so this must not reuse 0002.)
--
-- 0001 ENABLED row level security on every table but created ZERO policies. Under the
-- service-role connection that is harmless (the `service_role` role has BYPASSRLS), which
-- is exactly why tenant isolation is application-layer-only today. This migration adds the
-- policies that make isolation real for any `authenticated`-role access:
--   * the application's RLS_ENFORCED scoped path (see server/db.ts + _shared/db.ts
--     `scoped()`, which does `set local role authenticated` + injects request.jwt.claims), and
--   * any direct Supabase Data API (PostgREST) access with a user JWT.
--
-- SAFE TO APPLY ANY TIME: the running app connects as `service_role` and keeps bypassing
-- RLS, so applying this does NOT change current behavior. The Stripe webhook and auth
-- bootstrap (no user JWT, service-role) are likewise unaffected. Enforcement for the app's
-- own queries is switched on separately by setting RLS_ENFORCED=true — and that must happen
-- ONLY AFTER this migration is applied (enabling scoped/authenticated queries with no
-- policies present would deny-all).

-- ---------------------------------------------------------------------------------------
-- Helper: the caller's dealership ids, resolved from their JWT (auth.uid()).
-- SECURITY DEFINER so the lookup is not itself blocked by dealerships RLS and to avoid
-- policy recursion from the child-table policies below. search_path pinned to '' per
-- Supabase security guidance; all references are fully schema-qualified.
-- ---------------------------------------------------------------------------------------
create or replace function public.current_user_dealership_ids()
returns setof integer
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.dealerships d
  where d.user_id = (select auth.uid())
$$;

revoke all on function public.current_user_dealership_ids() from public, anon;
grant execute on function public.current_user_dealership_ids() to authenticated;

-- ---------------------------------------------------------------------------------------
-- users: a user may see/update only their own row.
-- ---------------------------------------------------------------------------------------
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- dealerships: owner-scoped (all verbs).
-- ---------------------------------------------------------------------------------------
drop policy if exists dealerships_owner_all on public.dealerships;
create policy dealerships_owner_all on public.dealerships
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- compliance_answers / subscriptions / generated_documents: scoped by dealership ownership.
-- (select ...) subquery form keeps current_user_dealership_ids() from being re-evaluated
-- per row.
-- ---------------------------------------------------------------------------------------
drop policy if exists compliance_answers_tenant_all on public.compliance_answers;
create policy compliance_answers_tenant_all on public.compliance_answers
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

drop policy if exists subscriptions_tenant_all on public.subscriptions;
create policy subscriptions_tenant_all on public.subscriptions
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

drop policy if exists generated_documents_tenant_all on public.generated_documents;
create policy generated_documents_tenant_all on public.generated_documents
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

-- ---------------------------------------------------------------------------------------
-- Force RLS so the table OWNER is also subject to policies (defense in depth). This does
-- NOT affect `service_role`, whose BYPASSRLS is a role attribute, not owner status — so
-- the webhook + auth bootstrap keep working.
-- ---------------------------------------------------------------------------------------
alter table public.users force row level security;
alter table public.dealerships force row level security;
alter table public.compliance_answers force row level security;
alter table public.subscriptions force row level security;
alter table public.generated_documents force row level security;

-- ---------------------------------------------------------------------------------------
-- Indexes on the columns RLS policies filter on (RLS performance guidance).
-- compliance_answers already has a btree on (dealership_id, section) from its UNIQUE
-- constraint, usable for the dealership_id predicate.
-- ---------------------------------------------------------------------------------------
create index if not exists dealerships_user_id_idx on public.dealerships (user_id);
create index if not exists subscriptions_dealership_id_idx on public.subscriptions (dealership_id);
create index if not exists generated_documents_dealership_id_idx on public.generated_documents (dealership_id);
