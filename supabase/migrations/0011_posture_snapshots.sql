-- =========================================================================================
-- 0011 — Posture history (PRD #33): continuous compliance-posture tracking.
--
-- A TENANT-SCOPED, append-only time series. Each row is a point-in-time snapshot of the
-- dealer's OVERALL compliance score (+ risk band + per-section scores) written by the save
-- path whenever the overall score changes. Additive: does NOT touch compliance_answers,
-- controls, scoring, or the Wizard.
--
-- Crown-jewel tenant data, reached only through a resolved TenantScope in db.ts. RLS is
-- dealership-scoped for all verbs, mirroring controls/risks in 0005. Like 0006 there is NO
-- seed here, so no seed-before-FORCE ordering concern.
--
-- Depends on 0001 (public.dealerships) and 0003 (public.current_user_dealership_ids() in the
-- tenant policy); the numeric ordering guarantees both apply first.
--
-- Idempotent: `create table if not exists` + guarded policy. HUMAN-applied via the Supabase
-- SQL editor (numeric<->timestamped history caveat — do NOT `supabase db push`).
-- =========================================================================================

create table if not exists public.posture_snapshots (
  id             integer generated always as identity primary key,
  dealership_id  integer   not null references public.dealerships(id),
  overall_score  integer   not null,
  -- 'critical' | 'high' | 'medium' | 'low' — derivation's four-band scale (text, not an enum,
  -- so the app's risk bands can evolve without a type migration).
  risk_level     text      not null default '',
  section_scores jsonb     not null default '{}'::jsonb,
  created_at     timestamp not null default now()
);

create index if not exists posture_snapshots_dealership_id_idx on public.posture_snapshots (dealership_id);
create index if not exists posture_snapshots_created_at_idx    on public.posture_snapshots (created_at);

-- -----------------------------------------------------------------------------------------
-- RLS. Dealership-scoped for all verbs, mirroring controls/risks in 0005. FORCE RLS subjects
-- the owner to policies too (defense in depth); it does not affect service_role, whose
-- BYPASSRLS is a role attribute, so the app keeps working. Every FORCE RLS table MUST have a
-- policy or it denies ALL authenticated access — this one gets its tenant policy below.
-- -----------------------------------------------------------------------------------------
alter table public.posture_snapshots enable row level security;
alter table public.posture_snapshots force row level security;

drop policy if exists posture_snapshots_tenant_all on public.posture_snapshots;
create policy posture_snapshots_tenant_all on public.posture_snapshots
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));
