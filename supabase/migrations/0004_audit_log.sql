-- =========================================================================================
-- 0004 — Append-only, tamper-evident audit trail (PRD #34 / #51).
--
-- Immutable who/what/when record of auth events and every state-changing mutation.
--
-- Threat model note: the application connects as `service_role`, whose BYPASSRLS attribute
-- means RLS alone CANNOT stop an UPDATE/DELETE of audit rows. Append-only is therefore
-- enforced by TRIGGERS that raise on UPDATE/DELETE/TRUNCATE — triggers fire regardless of
-- BYPASSRLS or table ownership. A BEFORE INSERT trigger maintains a SHA-256 hash chain
-- (prev_hash -> row_hash) so any post-hoc edit or gap is cryptographically detectable.
--
-- Depends on 0003 (uses public.current_user_dealership_ids() in the read policy); the
-- numeric ordering guarantees 0003 applies first.
-- =========================================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------------------
-- Table. Writers supply only the semantic columns; id/created_at default, and the hash
-- columns are filled by the BEFORE INSERT trigger below.
-- -----------------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  actor_user_id uuid references public.users(id),
  actor_email   varchar(320) not null default '',
  action        varchar(96)  not null,
  entity_type   varchar(64)  not null default '',
  entity_id     text         not null default '',
  dealership_id integer references public.dealerships(id),
  metadata      jsonb        not null default '{}'::jsonb,
  prev_hash     text         not null default '',
  row_hash      text         not null default '',
  created_at    timestamptz  not null default now()
);

create index if not exists audit_log_dealership_id_idx on public.audit_log (dealership_id);
create index if not exists audit_log_actor_user_id_idx on public.audit_log (actor_user_id);
create index if not exists audit_log_action_idx        on public.audit_log (action);
create index if not exists audit_log_created_at_idx     on public.audit_log (created_at);

-- -----------------------------------------------------------------------------------------
-- BEFORE INSERT: link the SHA-256 hash chain. A transaction-scoped advisory lock serializes
-- concurrent inserts so prev_hash is read consistently (low write volume; correctness over
-- throughput here). Runs as the inserting role — only service_role (BYPASSRLS) inserts, so
-- the prev-row lookup sees the full chain. search_path pinned per Supabase guidance.
-- -----------------------------------------------------------------------------------------
create or replace function public.audit_log_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prev    text;
  v_payload text;
begin
  perform pg_advisory_xact_lock(hashtext('public.audit_log.chain')::bigint);

  if new.created_at is null then
    new.created_at := now();
  end if;

  select a.row_hash into v_prev
  from public.audit_log a
  order by a.id desc
  limit 1;
  new.prev_hash := coalesce(v_prev, '');

  -- Canonical, deterministic serialization (jsonb::text has sorted keys + normalized
  -- whitespace, so it is stable). Excludes id and the hash columns themselves.
  v_payload :=
    coalesce(new.actor_user_id::text, '') || '|' ||
    coalesce(new.actor_email, '')         || '|' ||
    new.action                            || '|' ||
    coalesce(new.entity_type, '')         || '|' ||
    coalesce(new.entity_id, '')           || '|' ||
    coalesce(new.dealership_id::text, '') || '|' ||
    coalesce(new.metadata::text, '{}')    || '|' ||
    to_char((new.created_at at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');

  new.row_hash := encode(
    extensions.digest(new.prev_hash || '|' || v_payload, 'sha256'),
    'hex'
  );

  return new;
end;
$$;

drop trigger if exists audit_log_before_insert on public.audit_log;
create trigger audit_log_before_insert
  before insert on public.audit_log
  for each row execute function public.audit_log_before_insert();

-- -----------------------------------------------------------------------------------------
-- Append-only enforcement: block UPDATE/DELETE/TRUNCATE unconditionally. Fires even for the
-- table owner / service_role (BYPASSRLS does not bypass triggers) — this is the real
-- immutability guarantee; the REVOKEs below are belt-and-suspenders.
-- -----------------------------------------------------------------------------------------
create or replace function public.audit_log_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only: % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_block_mutation();

drop trigger if exists audit_log_no_delete on public.audit_log;
create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_block_mutation();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_block_mutation();

revoke update, delete, truncate on public.audit_log from public;
revoke update, delete, truncate on public.audit_log from anon;
revoke update, delete, truncate on public.audit_log from authenticated;

-- -----------------------------------------------------------------------------------------
-- RLS: readable (never writable) by authenticated users, limited to their own audit rows.
-- No INSERT/UPDATE/DELETE policy => the authenticated/anon roles cannot write; the app
-- writes as service_role (BYPASSRLS). FORCE RLS subjects the owner to the read policy too;
-- it does not affect service_role.
-- -----------------------------------------------------------------------------------------
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

drop policy if exists audit_log_read_own on public.audit_log;
create policy audit_log_read_own on public.audit_log
  for select to authenticated
  using (
    actor_user_id = (select auth.uid())
    or dealership_id in (select public.current_user_dealership_ids())
  );
