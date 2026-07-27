# Next Work — handoff for the next session

## Carryover (operational — triage first, all are small)
Phases 1–3 are **merged to `main`** (`29b8a29`, `91af29d`) and Supabase is **fully deployed**:
migrations `0001`–`0012` applied and reconciled, 17 tables, RLS forced + policy on every tenant
table, both storage buckets private. Nothing is pending there. Full detail:
`.claude/tasks/done/0005-front-facing-phases-1-3.md`.

1. **Re-run the whole-branch integrity audit.** It never completed last session (the reviewer
   subagent hit its usage limit). The orchestrator audited it instead and everything passed — but
   that is self-verification, not an independent lane, so it does not satisfy the no-self-approval
   rule. Dispatch one fresh reviewer over `main` (base `196f03d`).
2. **Decide on GitNexus.** It is licensed `PolyForm-Noncommercial-1.0.0` (noncommercial use only)
   and this is a commercial product (Stripe billing, paid plans). Keep + buy a license, or remove.
   Selling regulatory compliance while shipping on an unlicensed tool is a bad look. Config lives in
   `CLAUDE.md` (`<!-- gitnexus:start -->` block), `AGENTS.md`, `.claude/skills/gitnexus/`.
3. **Pin `zod` in the Deno runtime.** `supabase/functions/_shared/routers.ts:2` imports `npm:zod`
   with no version and no `zod` entry in `supabase/functions/import_map.json`, while Node is
   lockfile-pinned to 3.25.76. Identical source ≠ identical behaviour in the runtime that actually
   serves production — and the shared `logoUrlSchema` guard depends on it.
4. **Fix the edge-secret typos**: `STRIPE_SECERT_KEY` and `VITE_APP_URP` (both misspelled, sitting
   beside correct duplicates), plus `STRIPE_WEBHOOK_KEY` duplicating `STRIPE_WEBHOOK_SECRET`. Risk
   is someone wiring code to the misspelled name. `supabase secrets list --project-ref $REF`.
5. **Optional:** add Sign Out to a global surface (header/footer). It exists only on `/profile`
   (`client/src/pages/Profile.tsx:179-189`) — reachable, but unconventional.

---

## Task
**Remediation #10 — Law-as-data: externalize the regulation to versioned structured content.**
PRD #6/#5 — **High**. This is now the highest remaining item in gaps.md's remediation order (#5–#9,
#11, #12 all closed last session). Store §314.4 as versioned data with citations, **effective
dates**, and applicability conditions — so the rule can change without a redeploy.

## Cold-start context
- **What exists (the spine is already here).** `shared/requirements.ts` holds
  `REQUIREMENT_CATALOG` — 45 rows at `REQUIREMENT_CATALOG_VERSION = 2` (`:371`), each carrying a
  per-requirement §314.4 `citation` refined last session, plus authored `whyItMatters`/`fix`. It is
  **derived** from `SAFEGUARDS_SECTIONS` (`:374`), so the questionnaire and the catalog cannot drift.
- **What is missing for #6.** The law is still *code*, not *content*:
  - `shared/safeguards-questions.ts` is a 388-line hardcoded TS array — changing the rule means a
    redeploy.
  - `Requirement` (`shared/requirements.ts:19`) has **no `effectiveDate`**, and `applicability`
    (`:34`) is a `Record<string, unknown>` that is always seeded `{}` (`:384`) — the §314.6 logic
    lives in `shared/applicability.ts` keyed off the citation instead, which was the right call for
    that slice but means the *data* still doesn't express applicability.
  - There is no content versioning independent of the app (PRD #65's "regulatory-content package").
- **Why it matters now.** #6 blocks #9 (regulatory update pipeline) and is the honest prerequisite
  for claiming "law as data". §314.4(j) only became effective 2024-05-13 — a real example of a
  requirement the catalog cannot currently date.

## Design sketch (decide + log the choice in the `done/` log)
- **Externalize to JSON/YAML** under something like `content/safeguards/` with an explicit schema
  version, loaded (and validated) by `shared/requirements.ts` rather than hand-written TS. Keep the
  derived-from-questions guarantee or replace it with a drift test — do not lose it silently.
- **Extend `Requirement`** with `effectiveDate` (and optionally `supersededDate`) + a real typed
  `applicability` shape. Migration `0013` (next free number — `0012` is the last) to add the
  columns, idempotent, **applied directly by the agent** now that the history is reconciled (see
  CLAUDE.md's migrations rule) and recorded in `supabase_migrations.schema_migrations`.
- **Bump `REQUIREMENT_CATALOG_VERSION` to 3** and update BOTH drift guards —
  `server/requirements.test.ts` and `server/requirements-seed.test.ts` (the latter parses the seed
  SQL and asserts it equals the catalog; it will fail loudly if you change one and not the other).
- Consider moving `shared/applicability.ts`'s exempt-set logic to read the new `applicability` data
  instead of matching citations — but **only if** the §314.6 test suite
  (`server/applicability.test.ts`) stays green with the identical 12-code exempt set.

## Relevant files
- `shared/requirements.ts:19` (`Requirement` interface), `:371` (version), `:374` (catalog derivation)
- `shared/safeguards-questions.ts` (388 lines — the hardcoded law to externalize)
- `shared/applicability.ts` (§314.6 engine, citation-keyed today), `server/applicability.test.ts`
- `server/requirements.test.ts` + `server/requirements-seed.test.ts` (the two drift guards)
- `supabase/migrations/0009_requirement_citation_refinement.sql` (the idempotent seed-update pattern
  to copy for `0013`)
- `.claude/tasks/done/0005-front-facing-phases-1-3.md` (what shipped, and the bugs to avoid repeating)

## Watch out for
- **Citation accuracy is a compliance claim.** Every §314.4 citation must be correct and grounded —
  last session a builder cited §314.5 (the *effective date* section) for the breach-notification
  duty, which actually lives at **§314.4(j)**. An independent reviewer caught it. Never generate a
  citation via LLM; verify against the CFR text.
- **Both runtimes / two copies** stay in sync: `server/*` ↔ `supabase/functions/_shared/*`. Current
  parity: db.ts exports **48/48**. Any new `shared/` module needs `.ts`-EXPLICIT relative value
  imports or the Deno edge breaks in a way `tsc` cannot see.
- **Determinism.** Status/score/gap/citation are never LLM-produced. The only two LLM surfaces are
  `shared/interview-phrasing.ts` and `shared/architecture-narrative.ts`, both display-only via
  `shared/llm-provider.ts` (OpenAI primary, Anthropic fallback, deterministic passthrough when
  neither key is set).
- **RLS** on any new/changed table: `enable` + `force` + a tenant policy in the SAME migration.
  `requirements` is GLOBAL — it uses `for select to authenticated using (true)`, not a tenant policy.
- **Don't regress scores.** `server/derivation.test.ts` proves `derivation.ts` ≡ `scoring.ts`; the
  §314.6 default path (no `consumerCount`) must stay byte-identical for existing dealers.

## After this
**Remediation #13 — Recurrence engine + notifications** (PRD #35/#43) — annual risk assessment,
§314.4(d)(2) pen test / vuln assessment, §314.4(i) QI board report. `server/email-service.ts` is a
Resend scaffold that is still **never imported**; the design (table shape, idempotent sweep,
exemption-awareness) is written up in the Phase 4 notes below. Then **#14 dealer groups /
rooftop scoping** (PRD #2), which reshapes tenancy and should be sequenced with RBAC.

---

## Phase 4 — DESIGN ONLY (deferred; NOT implemented, per the master plan)
Documented last session, not built. Deferred until the user decides to pick it up. Each carries
design, dependencies, and acceptance criteria.

### 4.1 Roles / RBAC — owner · QI · staff · auditor (PRD #14/#42) ⚠️ GUARDED CHANGE
Tenancy today is single-owner: `dealerships.user_id` is the only user↔dealership link, and
`resolveTenantScope` (`shared/tenant-guard.ts:51-59`) resolves scope through
`getDealershipByUserId`. RBAC needs a `dealership_members` table `(dealership_id, user_id, role)`,
which changes the contract of the **only mint** for the branded `ScopedDealershipId` — every
crown-jewel accessor in both `db.ts` copies depends on it. Treat as a security change: builder →
independent security review, keep `dealerships.user_id` during transition, backfill existing owners,
and re-run `server/tenant-guard.test.ts` plus a new multi-member A≠B regression. Authorization via a
`requireRole(scope, [...])` helper enforced **server-side** (never by hiding UI); auditor is
read-only everywhere.
*Accept:* a `staff` member on A cannot read/write B; an `auditor` gets 403 on every mutation; legacy
single-owner dealerships keep working.

### 4.2 Guided onboarding to first artifact (PRD #37)
Signup currently drops the user on a Dashboard with a zero score and 13 routes. Add a **derived**
(not separately stored) resumable checklist: profile complete → first section answered →
consumer count set → first artifact generated, each computed from existing queries. No new table.
*Accept:* a new account reaches a generated artifact without reading docs; steps are idempotent and
resumable; zero effect on scores.

### 4.3 Recurrence engine + notifications (PRD #43/#35)
New `recurrences` table `(dealership_id, kind, cadence, last_completed_at, next_due_at, status)`,
seeded deterministically from the Rule (risk assessment annual §314.4(b); pen test annual +
vuln assessment semiannual §314.4(d)(2); QI board report annual §314.4(i)) and **respecting the
§314.6 exemption** — an exempt dealer must not be nagged about (d)(2) or (i). Pure date math in
`shared/recurrence.ts`; sweep via `pg_cron` or a scheduled Edge Function; wire the existing
`server/email-service.ts`. The sweep must be **idempotent** (record `last_notified_at` — running
twice must not double-send). Dashboard "Upcoming obligations" widget closes the last of PRD #38.
*Accept:* deterministic due dates, unit-tested; exempt dealers excluded; no duplicate sends; each
notification audited; graceful no-op when `RESEND_API_KEY` is absent.

### 4.4 Attestation collection flow (PRD #29)
Cheapest item: the `attestations` entity + audited CRUD already shipped
(`server/routers.ts:930-1000`) with **zero client UI**. Build campaign → notify → acknowledge →
record, stamping `attested_at` **once** (mirror the set-once `adoptedAt` discipline in
`shared/policy-lifecycle.ts`, and lock lifecycle fields out of `create`/`update` with `.strict()` —
last session that exact gap let a policy be born adopted). Feed attested records into the evidence
index and the Examiner Package as §314.4(e) evidence.
*Accept:* send→attest→record round-trips, fully audited; `attested_at` cannot be overwritten
(guard-tested like `server/policy-guard.test.ts`); records appear in the Examiner Package.

**Suggested order:** 4.4 (backend exists) → 4.2 (no schema) → 4.3 (new table + scheduler) →
4.1 (guarded; sequence with PRD #2 dealer groups, since both reshape tenancy).
