-- =========================================================================================
-- 0006 — Core compliance object model, batch 2 of 9 (PRD #22/#24/#26/#31/#32):
--        Evidence (+ evidence<->control join), Task, Policy.
--
-- Additive to slice 1 (0005) and to the questionnaire. Does NOT touch compliance_answers,
-- scoring, or the Wizard.
--
-- All four tables are TENANT-SCOPED crown-jewel data (a dealer's evidence artifacts,
-- remediation tasks, and written policies), reached only through a resolved TenantScope in
-- db.ts. RLS is dealership-scoped for all verbs, mirroring controls/risks in 0005. Unlike
-- 0005 there is NO seed here, so there is no seed-before-FORCE ordering concern.
--
-- Evidence files live in a private `evidence` Supabase Storage bucket (Supabase-managed
-- encryption at rest, same posture as the `documents` bucket); this table stores only
-- metadata + the storage path. Creating that bucket is a deploy step (see the session log).
--
-- Depends on 0003 (public.current_user_dealership_ids() in the tenant policies) and 0005
-- (FKs to public.requirements and public.controls); the numeric ordering guarantees both
-- apply first.
-- =========================================================================================

-- -----------------------------------------------------------------------------------------
-- Enums. Guarded so a re-run (or a partially-applied prior attempt) does not error.
-- -----------------------------------------------------------------------------------------
do $$ begin
  create type public.task_status as enum ('open', 'in_progress', 'blocked', 'done', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.policy_status as enum ('draft', 'in_review', 'approved', 'adopted', 'archived');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------------------
-- Tables.
-- -----------------------------------------------------------------------------------------
create table if not exists public.evidence (
  id            integer generated always as identity primary key,
  dealership_id integer      not null references public.dealerships(id),
  title         text         not null,
  description   text         not null default '',
  storage_path  text         not null,
  file_name     text         not null default '',
  content_type  varchar(128) not null default '',
  size_bytes    bigint       not null default 0,
  uploaded_by   uuid         references public.users(id),
  created_at    timestamp    not null default now(),
  updated_at    timestamp    not null default now()
);

create index if not exists evidence_dealership_id_idx on public.evidence (dealership_id);

create table if not exists public.evidence_controls (
  id            integer generated always as identity primary key,
  dealership_id integer not null references public.dealerships(id),
  evidence_id   integer not null references public.evidence(id),
  control_id    integer not null references public.controls(id),
  created_at    timestamp not null default now(),
  unique (evidence_id, control_id)
);

create index if not exists evidence_controls_dealership_id_idx on public.evidence_controls (dealership_id);
create index if not exists evidence_controls_evidence_id_idx   on public.evidence_controls (evidence_id);
create index if not exists evidence_controls_control_id_idx    on public.evidence_controls (control_id);

create table if not exists public.tasks (
  id             integer generated always as identity primary key,
  dealership_id  integer not null references public.dealerships(id),
  title          text    not null,
  description    text    not null default '',
  status         public.task_status   not null default 'open',
  priority       public.task_priority not null default 'medium',
  owner          text    not null default '',
  due_date       timestamp,
  requirement_id integer references public.requirements(id),
  control_id     integer references public.controls(id),
  created_at     timestamp not null default now(),
  updated_at     timestamp not null default now(),
  completed_at   timestamp
);

create index if not exists tasks_dealership_id_idx  on public.tasks (dealership_id);
create index if not exists tasks_requirement_id_idx on public.tasks (requirement_id);
create index if not exists tasks_control_id_idx     on public.tasks (control_id);

create table if not exists public.policies (
  id             integer generated always as identity primary key,
  dealership_id  integer not null references public.dealerships(id),
  policy_type    varchar(64) not null,
  title          text    not null,
  status         public.policy_status not null default 'draft',
  version        integer not null default 1,
  content        text    not null default '',
  storage_path   text,
  requirement_id integer references public.requirements(id),
  approved_by    text    not null default '',
  adopted_at     timestamp,
  created_at     timestamp not null default now(),
  updated_at     timestamp not null default now()
);

create index if not exists policies_dealership_id_idx  on public.policies (dealership_id);
create index if not exists policies_requirement_id_idx on public.policies (requirement_id);

-- -----------------------------------------------------------------------------------------
-- RLS. All four tables: dealership-scoped for all verbs, mirroring controls/risks in 0005.
-- FORCE RLS subjects the owner to policies too (defense in depth); it does not affect
-- service_role, whose BYPASSRLS is a role attribute, so the app keeps working. Every FORCE
-- RLS table MUST have a policy or it denies ALL authenticated access — each gets one below.
-- -----------------------------------------------------------------------------------------
alter table public.evidence enable row level security;
alter table public.evidence force row level security;

drop policy if exists evidence_tenant_all on public.evidence;
create policy evidence_tenant_all on public.evidence
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

alter table public.evidence_controls enable row level security;
alter table public.evidence_controls force row level security;

drop policy if exists evidence_controls_tenant_all on public.evidence_controls;
create policy evidence_controls_tenant_all on public.evidence_controls
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

alter table public.tasks enable row level security;
alter table public.tasks force row level security;

drop policy if exists tasks_tenant_all on public.tasks;
create policy tasks_tenant_all on public.tasks
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

alter table public.policies enable row level security;
alter table public.policies force row level security;

drop policy if exists policies_tenant_all on public.policies;
create policy policies_tenant_all on public.policies
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));
