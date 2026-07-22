-- =========================================================================================
-- 0005 — Core compliance object model, batch 1 of 9 (PRD #3): Requirement, Control, Risk.
--
-- Additive to the questionnaire. Does NOT touch compliance_answers, scoring, or the Wizard.
--
-- Global vs tenant split:
--   * requirements — a GLOBAL, versioned catalog: the FTC Safeguards Rule as data, identical
--     for every dealer, keyed by the questionnaire question id (e.g. q1_1). Seeded below and
--     maintained by the app as service_role. RLS grants read-all to authenticated; there is
--     NO write policy (only service_role, which has BYPASSRLS, writes it).
--   * controls / risks — TENANT-SCOPED crown-jewel data (a dealer's implemented state and
--     risk findings). RLS is dealership-scoped for all verbs, mirroring
--     compliance_answers_tenant_all in 0003.
--
-- Ordering matters: the requirements SEED runs BEFORE the enable/force RLS statements. FORCE
-- RLS subjects the table owner (which applies this migration) to policies too, and there is
-- no INSERT policy on requirements — so seeding after FORCE would be denied. Seed first, then
-- lock the table down.
--
-- Depends on 0003 (uses public.current_user_dealership_ids() in the controls/risks policies);
-- the numeric ordering guarantees 0003 applies first.
-- =========================================================================================

-- -----------------------------------------------------------------------------------------
-- Enums. Guarded so a re-run (or a partially-applied prior attempt) does not error.
-- -----------------------------------------------------------------------------------------
do $$ begin
  create type public.control_status as enum
    ('implemented', 'partial', 'not_implemented', 'not_applicable', 'unknown');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.risk_level as enum ('low', 'medium', 'high');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.risk_severity as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.risk_status as enum ('open', 'mitigating', 'accepted', 'closed');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------------------
-- Tables.
-- -----------------------------------------------------------------------------------------
create table if not exists public.requirements (
  id            integer generated always as identity primary key,
  code          varchar(32)  not null unique,
  section       integer      not null,
  section_name  text         not null default '',
  title         text         not null default '',
  citation      varchar(32)  not null default '',
  weight        varchar(16)  not null default 'standard',
  applicability jsonb        not null default '{}'::jsonb,
  version       integer      not null default 1,
  created_at    timestamptz  not null default now()
);

create table if not exists public.controls (
  id             integer generated always as identity primary key,
  dealership_id  integer not null references public.dealerships(id),
  requirement_id integer not null references public.requirements(id),
  status         public.control_status not null default 'unknown',
  notes          text    not null default '',
  source         varchar(32) not null default 'manual',
  created_at     timestamp not null default now(),
  updated_at     timestamp not null default now(),
  unique (dealership_id, requirement_id)
);

create index if not exists controls_dealership_id_idx  on public.controls (dealership_id);
create index if not exists controls_requirement_id_idx on public.controls (requirement_id);

create table if not exists public.risks (
  id             integer generated always as identity primary key,
  dealership_id  integer not null references public.dealerships(id),
  title          text    not null,
  description    text    not null default '',
  likelihood     public.risk_level,
  impact         public.risk_level,
  severity       public.risk_severity,
  status         public.risk_status not null default 'open',
  requirement_id integer references public.requirements(id),
  control_id     integer references public.controls(id),
  created_at     timestamp not null default now(),
  updated_at     timestamp not null default now()
);

create index if not exists risks_dealership_id_idx  on public.risks (dealership_id);
create index if not exists risks_requirement_id_idx on public.risks (requirement_id);
create index if not exists risks_control_id_idx     on public.risks (control_id);

-- -----------------------------------------------------------------------------------------
-- Seed the GLOBAL requirement catalog (45 rows = 9 sections x 5 questions). Authored to
-- match shared/requirements.ts REQUIREMENT_CATALOG EXACTLY (assert-tested in
-- server/requirements.test.ts). Idempotent: on conflict on the stable `code` key, refresh
-- the derived columns so re-applying keeps the catalog in lockstep with the questionnaire.
-- Citations are SECTION-LEVEL (coarse); per-requirement refinement is the next task (#5).
-- Runs BEFORE the RLS statements below (see header).
-- -----------------------------------------------------------------------------------------
insert into public.requirements (code, section, section_name, title, citation, weight, version)
values
  ('q1_1', 1, 'Qualified Individual', 'Has your dealership designated a Qualified Individual (QI) responsible for overseeing information security?', '§314.4(a)', 'critical', 1),
  ('q1_2', 1, 'Qualified Individual', 'Does the QI have documented credentials and qualifications in information security?', '§314.4(a)', 'important', 1),
  ('q1_3', 1, 'Qualified Individual', 'Does the QI report directly to the board of directors or equivalent governance body?', '§314.4(a)', 'critical', 1),
  ('q1_4', 1, 'Qualified Individual', 'Is the QI''s role and responsibilities documented in writing?', '§314.4(a)', 'important', 1),
  ('q1_5', 1, 'Qualified Individual', 'Does your dealership have a succession plan for the QI position?', '§314.4(a)', 'standard', 1),
  ('q2_1', 2, 'Risk Assessment', 'Has your dealership conducted a written risk assessment of all data systems?', '§314.4(b)', 'critical', 1),
  ('q2_2', 2, 'Risk Assessment', 'Does the risk assessment identify internal and external threats?', '§314.4(b)', 'critical', 1),
  ('q2_3', 2, 'Risk Assessment', 'Has the risk assessment identified vulnerabilities in your systems?', '§314.4(b)', 'critical', 1),
  ('q2_4', 2, 'Risk Assessment', 'Is the risk assessment updated at least annually?', '§314.4(b)', 'important', 1),
  ('q2_5', 2, 'Risk Assessment', 'Do you reassess risk when significant system changes occur?', '§314.4(b)', 'important', 1),
  ('q3_1', 3, 'Data Inventory & Classification', 'Have you documented all locations where customer NPI is stored?', '§314.4(c)(2)', 'critical', 1),
  ('q3_2', 3, 'Data Inventory & Classification', 'Do you have documented data retention policies for customer information?', '§314.4(c)(2)', 'critical', 1),
  ('q3_3', 3, 'Data Inventory & Classification', 'Have you documented all third-party data sharing agreements?', '§314.4(c)(2)', 'important', 1),
  ('q3_4', 3, 'Data Inventory & Classification', 'Do you have a documented data disposal procedure?', '§314.4(c)(2)', 'important', 1),
  ('q3_5', 3, 'Data Inventory & Classification', 'Is your data inventory reviewed and updated regularly?', '§314.4(c)(2)', 'standard', 1),
  ('q4_1', 4, 'Access Controls', 'Is multi-factor authentication (MFA) implemented on all systems storing NPI?', '§314.4(c)(1)', 'critical', 1),
  ('q4_2', 4, 'Access Controls', 'Do you implement the principle of least privilege for system access?', '§314.4(c)(1)', 'critical', 1),
  ('q4_3', 4, 'Access Controls', 'Do you have a documented procedure for revoking access when employees terminate?', '§314.4(c)(1)', 'critical', 1),
  ('q4_4', 4, 'Access Controls', 'Is privileged access monitored and logged?', '§314.4(c)(1)', 'important', 1),
  ('q4_5', 4, 'Access Controls', 'Are access rights reviewed and updated at least quarterly?', '§314.4(c)(1)', 'important', 1),
  ('q5_1', 5, 'Encryption', 'Is all customer NPI encrypted at rest using industry-standard encryption?', '§314.4(c)(3)', 'critical', 1),
  ('q5_2', 5, 'Encryption', 'Is all data transmission using TLS 1.2 or higher?', '§314.4(c)(3)', 'critical', 1),
  ('q5_3', 5, 'Encryption', 'Are encryption keys securely managed and rotated regularly?', '§314.4(c)(3)', 'critical', 1),
  ('q5_4', 5, 'Encryption', 'Is email containing NPI encrypted end-to-end?', '§314.4(c)(3)', 'important', 1),
  ('q5_5', 5, 'Encryption', 'Are mobile devices accessing NPI encrypted?', '§314.4(c)(3)', 'important', 1),
  ('q6_1', 6, 'Vendor & Third-Party Management', 'Do all vendor contracts include written security requirements?', '§314.4(f)', 'critical', 1),
  ('q6_2', 6, 'Vendor & Third-Party Management', 'Do you conduct annual security assessments of critical vendors?', '§314.4(f)', 'critical', 1),
  ('q6_3', 6, 'Vendor & Third-Party Management', 'Do vendor contracts require breach notification within 30 days?', '§314.4(f)', 'critical', 1),
  ('q6_4', 6, 'Vendor & Third-Party Management', 'Have you assessed the security practices of your DMS vendor?', '§314.4(f)', 'important', 1),
  ('q6_5', 6, 'Vendor & Third-Party Management', 'Do you have a process to monitor vendor compliance with security requirements?', '§314.4(f)', 'important', 1),
  ('q7_1', 7, 'Incident Response Plan', 'Do you have a written Incident Response Plan (IRP)?', '§314.4(h)', 'critical', 1),
  ('q7_2', 7, 'Incident Response Plan', 'Has your IRP been tested via tabletop exercise in the last 12 months?', '§314.4(h)', 'critical', 1),
  ('q7_3', 7, 'Incident Response Plan', 'Does your IRP include a breach notification procedure with 30-day timeline?', '§314.4(h)', 'critical', 1),
  ('q7_4', 7, 'Incident Response Plan', 'Is there a designated incident response team with clear roles?', '§314.4(h)', 'important', 1),
  ('q7_5', 7, 'Incident Response Plan', 'Do you maintain an incident log documenting all security incidents?', '§314.4(h)', 'important', 1),
  ('q8_1', 8, 'Employee Training', 'Do all employees receive annual security awareness training?', '§314.4(e)', 'critical', 1),
  ('q8_2', 8, 'Employee Training', 'Do you conduct phishing simulations to test employee awareness?', '§314.4(e)', 'important', 1),
  ('q8_3', 8, 'Employee Training', 'Are new employees trained on security policies before accessing systems?', '§314.4(e)', 'important', 1),
  ('q8_4', 8, 'Employee Training', 'Do you maintain records of employee training completion?', '§314.4(e)', 'important', 1),
  ('q8_5', 8, 'Employee Training', 'Is social engineering awareness included in training?', '§314.4(e)', 'standard', 1),
  ('q9_1', 9, 'Penetration Testing & Monitoring', 'Has your dealership conducted an annual penetration test?', '§314.4(d)', 'critical', 1),
  ('q9_2', 9, 'Penetration Testing & Monitoring', 'Do you conduct quarterly vulnerability assessments?', '§314.4(d)', 'critical', 1),
  ('q9_3', 9, 'Penetration Testing & Monitoring', 'Do you have continuous monitoring and log aggregation in place?', '§314.4(d)', 'critical', 1),
  ('q9_4', 9, 'Penetration Testing & Monitoring', 'Do you track and remediate identified vulnerabilities?', '§314.4(d)', 'important', 1),
  ('q9_5', 9, 'Penetration Testing & Monitoring', 'Are penetration test and vulnerability assessment reports reviewed by QI?', '§314.4(d)', 'important', 1)
on conflict (code) do update set
  section      = excluded.section,
  section_name = excluded.section_name,
  title        = excluded.title,
  citation     = excluded.citation,
  weight       = excluded.weight,
  version      = excluded.version;

-- -----------------------------------------------------------------------------------------
-- RLS. requirements: read-all to authenticated, no write policy (service_role writes via
-- BYPASSRLS). controls / risks: dealership-scoped for all verbs, mirroring 0003. FORCE RLS
-- subjects the owner to policies too (defense in depth); it does not affect service_role,
-- whose BYPASSRLS is a role attribute, so the app + seed maintenance keep working.
-- -----------------------------------------------------------------------------------------
alter table public.requirements enable row level security;
alter table public.requirements force row level security;

drop policy if exists requirements_read_all on public.requirements;
create policy requirements_read_all on public.requirements
  for select to authenticated
  using (true);

alter table public.controls enable row level security;
alter table public.controls force row level security;

drop policy if exists controls_tenant_all on public.controls;
create policy controls_tenant_all on public.controls
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));

alter table public.risks enable row level security;
alter table public.risks force row level security;

drop policy if exists risks_tenant_all on public.risks;
create policy risks_tenant_all on public.risks
  for all to authenticated
  using (dealership_id in (select public.current_user_dealership_ids()))
  with check (dealership_id in (select public.current_user_dealership_ids()));
