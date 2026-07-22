-- =========================================================================================
-- 0007 — Core compliance object model, batch 3 of 3 (PRD #13/#29): Asset, DataFlow,
--        Attestation. Completes the 9 PRD #3 entities.
--
-- Additive to slices 1/2 (0005/0006) and to the questionnaire. Does NOT touch
-- compliance_answers, scoring, or the Wizard.
--
-- All three tables are TENANT-SCOPED crown-jewel data (a dealer's asset register, NPI data
-- flows, and staff attestations), reached only through a resolved TenantScope in db.ts. RLS
-- is dealership-scoped for all verbs, mirroring controls/risks in 0005. No seed here, so
-- there is no seed-before-FORCE ordering concern.
--
-- data_flows.source_asset_id / destination_asset_id and attestations.policy_id /
-- requirement_id follow the SAME raw-id + dealership_id-forced-from-scope pattern as
-- risks.control_id in 0005: plain FKs, tenant scoping enforced by dealership_id + RLS. The
-- composite-FK hardening (dealership_id, asset_id)->assets(dealership_id, id) across all such
-- references is a tracked follow-up to be done together later.
--
-- Depends on 0003 (public.current_user_dealership_ids() in the tenant policies), 0005 (FK to
-- public.requirements) and 0006 (FK to public.policies); the numeric ordering guarantees all
-- apply first.
-- =========================================================================================

-- -----------------------------------------------------------------------------------------
-- Enums. Guarded so a re-run (or a partially-applied prior attempt) does not error.
-- -----------------------------------------------------------------------------------------
do $$ begin
  create type public.asset_type as enum
    ('system', 'application', 'database', 'device', 'network', 'storage', 'vendor_service', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.asset_criticality as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.data_flow_direction as enum ('inbound', 'outbound', 'internal', 'bidirectional');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.transport_encryption as enum ('none', 'tls', 'other', 'unknown');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attestation_type as enum
    ('policy_acknowledgment', 'training_completion', 'access_review', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attestation_status as enum ('pending', 'acknowledged', 'declined', 'expired');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------------------
-- Tables.
-- -----------------------------------------------------------------------------------------
create table if not exists public.assets (
  id            integer generated always as identity primary key,
  dealership_id integer not null references public.dealerships(id),
  name          text    not null,
  asset_type    public.asset_type not null,
  description   text    not null default '',
  owner         text    not null default '',
  location      text    not null default '',
  stores_npi    boolean not null default false,
  criticality   public.asset_criticality not null default 'medium',
  vendor        text    not null default '',
  created_at    timestamp not null default now(),
  updated_at    timestamp not null default now()
);

create index if not exists assets_dealership_id_idx on public.assets (dealership_id);

create table if not exists public.data_flows (
  id                  integer generated always as identity primary key,
  dealership_id       integer not null references public.dealerships(id),
  name                text    not null,
  description         text    not null default '',
  source_asset_id     integer references public.assets(id),
  destination_asset_id integer references public.assets(id),
  external_party      text    not null default '',
  data_types          text    not null default '',
  direction           public.data_flow_direction not null,
  transport_encryption public.transport_encryption not null default 'unknown',
  created_at          timestamp not null default now(),
  updated_at          timestamp not null default now()
);

create index if not exists data_flows_dealership_id_idx       on public.data_flows (dealership_id);
create index if not exists data_flows_source_asset_id_idx     on public.data_flows (source_asset_id);
create index if not exists data_flows_destination_asset_id_idx on public.data_flows (destination_asset_id);

create table if not exists public.attestations (
  id               integer generated always as identity primary key,
  dealership_id    integer not null references public.dealerships(id),
  attestation_type public.attestation_type not null,
  subject          text    not null,
  attestor_name    text    not null,
  attestor_email   varchar(320) not null default '',
  status           public.attestation_status not null default 'pending',
  policy_id        integer references public.policies(id),
  requirement_id   integer references public.requirements(id),
  attested_at      timestamp,
  notes            text    not null default '',
  created_at       timestamp not null default now(),
  updated_at       timestamp not null default now()
);

create index if not exists attestations_dealership_id_idx on public.attestations (dealership_id);
create index if not exists attestations_policy_id_idx     on public.attestations (policy_id);

-- -----------------------------------------------------------------------------------------
-- RLS. All three tables: dealership-scoped for all verbs, mirroring controls/risks in 0005.
-- FORCE RLS subjects the owner to policies too (defense in depth); it does not affect
-- service_role, whose BYPASSRLS is a role attribute, so the app keeps working. Every FORCE
-- RLS table MUST have a policy or it denies ALL authenticated access — each gets one below.
-- -----------------------------------------------------------------------------------------
alter table public.assets enable row level security;
alter table public.assets force row level security;

drop policy if exists assets_tenant_all on public.assets;
create policy assets_tenant_all on public.assets
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

alter table public.data_flows enable row level security;
alter table public.data_flows force row level security;

drop policy if exists data_flows_tenant_all on public.data_flows;
create policy data_flows_tenant_all on public.data_flows
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

alter table public.attestations enable row level security;
alter table public.attestations force row level security;

drop policy if exists attestations_tenant_all on public.attestations;
create policy attestations_tenant_all on public.attestations
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));
