-- =========================================================================================
-- 0008 — Composite-FK hardening for the tenant-scoped object model (carryover from #4).
--
-- 0005–0007 modeled the cross-entity links (risks.control_id, tasks.control_id,
-- evidence_controls.*, data_flows.*_asset_id, attestations.policy_id) as PLAIN single-column
-- FKs to the parent's id, with tenant isolation enforced only by dealership_id + RLS + the
-- db.ts accessors forcing dealership_id from scope. That leaves a theoretical hole: a child row
-- could reference a parent id owned by a DIFFERENT dealership. No live leak exists today (the
-- app always writes both ids from the same resolved scope), but before these links get client
-- wiring we harden them into (dealership_id, <ref>_id) -> parent(dealership_id, id) COMPOSITE
-- FKs, so the database itself refuses a cross-tenant link.
--
-- requirement_id references the GLOBAL requirements catalog (not tenant-scoped) and is exempt.
--
-- Each composite FK needs a UNIQUE (dealership_id, id) on the parent — added first, idempotently.
-- The composite FKs are ADDITIVE: the existing single-column FKs stay (harmless; the composite
-- one adds the tenant-consistency guarantee). Nullable child columns use MATCH SIMPLE (Postgres
-- default), so a NULL <ref>_id skips the check — an unlinked risk/task/flow stays valid.
--
-- Idempotent throughout: every ADD CONSTRAINT is wrapped in a DO block that swallows
-- duplicate_object, so re-applying is a no-op. Human-applied via the Supabase SQL editor (never
-- `supabase db push`); drizzle/schema.ts reflects the same constraints so a later `pnpm db:push`
-- is a no-op. Depends on 0005 (controls), 0006 (evidence, policies), 0007 (assets); numeric
-- ordering guarantees they apply first.
-- =========================================================================================

-- -----------------------------------------------------------------------------------------
-- Parent uniqueness: UNIQUE (dealership_id, id) on every table a composite FK points at.
-- id is already the primary key (globally unique), so these constraints never reject real
-- data; they exist solely to make (dealership_id, id) a referenceable target.
-- -----------------------------------------------------------------------------------------
do $$ begin
  alter table public.controls add constraint controls_dealership_id_id_key unique (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.evidence add constraint evidence_dealership_id_id_key unique (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.assets add constraint assets_dealership_id_id_key unique (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.policies add constraint policies_dealership_id_id_key unique (dealership_id, id);
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------------------
-- Composite FKs: (dealership_id, <ref>_id) -> parent(dealership_id, id). A cross-tenant link
-- is now impossible because the child's own dealership_id must match the parent's.
-- -----------------------------------------------------------------------------------------
do $$ begin
  alter table public.risks
    add constraint risks_dealership_id_control_id_fkey
    foreign key (dealership_id, control_id) references public.controls (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tasks
    add constraint tasks_dealership_id_control_id_fkey
    foreign key (dealership_id, control_id) references public.controls (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.evidence_controls
    add constraint evidence_controls_dealership_id_control_id_fkey
    foreign key (dealership_id, control_id) references public.controls (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.evidence_controls
    add constraint evidence_controls_dealership_id_evidence_id_fkey
    foreign key (dealership_id, evidence_id) references public.evidence (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.data_flows
    add constraint data_flows_dealership_id_source_asset_id_fkey
    foreign key (dealership_id, source_asset_id) references public.assets (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.data_flows
    add constraint data_flows_dealership_id_destination_asset_id_fkey
    foreign key (dealership_id, destination_asset_id) references public.assets (dealership_id, id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.attestations
    add constraint attestations_dealership_id_policy_id_fkey
    foreign key (dealership_id, policy_id) references public.policies (dealership_id, id);
exception when duplicate_object then null; end $$;
