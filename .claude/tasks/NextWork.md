# Next Work — handoff for the next session

## Carryover from #3 (operational, human + live-DB — do this first)
Remediation #3 (audit trail) is **code-complete and verified** (types/tests/lint green, both runtimes
in sync) but **not yet applied/deployed** — the DB-level append-only + hash-chain enforcement needs a
live DB and a human. See `.claude/tasks/done/0003-audit-trail.md` for full detail.
1. **Apply `supabase/migrations/0004_audit_log.sql`** with `supabase db push`. It references
   `current_user_dealership_ids()` from `0003`; the numeric ordering applies
   `0003` first. (Note: `0003` itself may still be unapplied — apply both, in order.)
2. **Validate on a staging/branch deploy** (each fails toward the safe side if unmet):
   - `update`/`delete`/`truncate` on `audit_log` are rejected **even as `service_role`** (triggers).
   - `extensions.digest` resolves (pgcrypto in the `extensions` schema — Supabase default).
   - A real mutation writes a row and `prev_hash`/`row_hash` populate (chain links across ≥2 rows).
   - Authenticated Data-API read is scoped by the `audit_log_read_own` policy.
3. **Commit + deploy** on Andrew's go (Edge auto-deploys via `deploy-functions.yml`; `0004` is a
   human `db push`). No `RLS_ENFORCED` interaction — audit writes are service-role either way.

---

## Task
**Remediation #4 — Core compliance object model.** Model the nine first-class entities the PRD
demands — **Control, Requirement, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation** — in
Drizzle, and begin migrating the questionnaire off opaque JSONB onto `Control`/`Requirement`.
PRD #3 — **High**.

## Cold-start context
- **Why this is the keystone.** Today compliance state is `compliance_answers.answers` JSONB keyed by
  question id (`drizzle/schema.ts` `complianceAnswers`). gaps.md's top structural finding: almost
  every remaining High/Critical gap — citations (#19), risk assessment (#20), IRP (#23), tasks (#24),
  evidence repo (#31), posture history (#33), attestations (#29) — is **blocked or degraded** by the
  absence of this model. This unblocks the most downstream work of any remaining item.
- **What's already in place to build on:**
  - Tenant seam (#2): `resolveTenantScope` → branded `TenantScope`; scope every new business table
    to `dealership_id` and route reads/writes through the funnel (`shared/tenant-guard.ts`).
  - Audit seam (#3): `appendAuditLog` + `AUDIT_ACTIONS` (`shared/audit.ts`) — add actions for the new
    entities' create/update/delete as you build them.
  - Deterministic scoring (`shared/scoring.ts`) reads the questionnaire; keep it deterministic (no LLM).
- **This is a large task (gaps.md "L").** Don't try to land all nine entities + full migration in one
  session. Recommended first slice: **`Control` + `Requirement`** (the regulatory spine), a migration,
  the tenant-scoped accessors in both `db.ts` copies, and a read path in both routers — then map the
  existing 9 sections × questions onto Requirements without breaking current scoring. Sequence the
  other seven entities (Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation) in follow-ups.

## Design sketch (decide + log the choice in the `done/` log, like #2 and #3)
- **New tables in `drizzle/schema.ts` + a `0005_*.sql` migration** (remember: `ls
  supabase/migrations/` first — next free is `0005`). Scope each to `dealership_id` with an FK index,
  and add them to `0003`/`0004`-style RLS (enable + force + tenant policy via
  `current_user_dealership_ids()`), since RLS is enabled on every table.
- **Start with `control` + `requirement`**: a Requirement = an atomic, testable §314.4 obligation
  (citation, applicability, weight); a Control = the dealer's implemented answer/state for a
  Requirement. This is the #5/#6 "law as data" spine and what #19 citations hang off.
- **Migration path, not a rewrite**: keep `compliance_answers` working; add a mapping from
  `(section, questionId)` → `requirement`, and backfill. Don't break `shared/scoring.ts` or the Wizard.
- **Both runtimes / two copies** stay in sync (CLAUDE.md non-negotiable): schema, both `db.ts`, both
  router copies, and audit actions for the new mutations.

## Relevant files
- `drizzle/schema.ts` — add the entity tables; `supabase/migrations/0005_*.sql` — tables + RLS.
- `shared/safeguards-questions.ts` — the current 9×N questionnaire to map onto Requirements.
- `shared/scoring.ts` — deterministic scoring that must keep working through the migration.
- `server/db.ts` / `supabase/functions/_shared/db.ts` — tenant-scoped accessors (both copies).
- `server/routers.ts` / `supabase/functions/_shared/routers.ts` — new procedures (both copies);
  add `AUDIT_ACTIONS` entries in `shared/audit.ts` and log each new mutation.
- `client/src/pages/Wizard.tsx` / `Dashboard.tsx` — consumers of the questionnaire/scoring.
- `.claude/tasks/done/0003-audit-trail.md`, `0002-tenant-isolation.md` — the seams you build on.

## Watch out for
- **Don't break scoring or the Wizard** — this is a migration, keep the old path green until the new
  one is proven. Tests: `server/scoring.test.ts`.
- **RLS is enabled on every table with no policy until you add one** — a new table with FORCE RLS and
  no policy denies all authenticated access. Add the tenant policy in the same migration (see `0003`).
- **Scope everything to `dealership_id`** through `resolveTenantScope`; audit every new mutation.
- **No LLM in the compliance path**; keep status deterministic.
- **No `deno` locally** → verify Edge behavior on a branch deploy, not just `tsc`/vitest.

## After this
**Remediation #5 — Citation-level explainability** (every gap → a §314.4 citation + the triggering
answer) — PRD #19/#62 — **High**. It depends directly on #4's `Requirement` carrying the citation, so
it slots in naturally once the object model spine exists.
