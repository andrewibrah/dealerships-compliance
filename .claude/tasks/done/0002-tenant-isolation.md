# 2026-07-21 — Session 0002: Tenant isolation, defense-in-depth (PRD #46)

Active task: `.claude/tasks/CurrWork.md` (Remediation #2). Promotion from NextWork already applied
by a prior (broken) session — CurrWork == NextWork verified byte-identical at session start.

## Mandate (from the user, this session)
Execute **both** enforcement layers in one session, autonomously, through session-review + session-end:
1. **App-layer: verified tenant-guard** — every business query funnels through one helper that
   requires a `dealershipId` derived from `ctx.user`; tests fail if a query bypasses it.
2. **DB-layer: RLS policies** — the "hard isolation" PRD #46 asks for.

## Safety rails I bound myself to (user asleep, can't verify)
- **No `pnpm db:push` against the live Supabase DB**; **no deploy.** Migration SQL + code land in the
  repo, fully ready, with an apply/enable runbook. Applying/deploying stays a human step.
- RLS runtime role-switch is **flag-gated (`RLS_ENFORCED`, default off)** so the repo is safe at rest:
  shipping/deploying the code does not flip DB enforcement (which, with RLS enabled + zero policies,
  would deny-all until the migration is applied). Enabling is a deliberate post-migration step.

## Pre-flight investigation (carried over from this session's report)
- Connection = Supavisor pooler `:6543` (transaction mode), `prepare:false` already set → `SET LOCAL
  role authenticated` + `set_config('request.jwt.claims', …, true)` inside a transaction is the
  sanctioned Drizzle+RLS pattern and is viable. `:5432` direct URL exists in template as fallback.
- `users.id` / `dealerships.user_id` are `uuid` = `auth.users.id` → `auth.uid()` compares with no cast.
- Two access modes are mandatory (confirmed): **service-role** must stay for the Stripe webhook
  (`stripe-webhook/index.ts` — no user JWT) and the auth-bootstrap upsert (`createUser` in the
  context builders); **authenticated-scoped** for user business queries.

---

## Actions log
(appended continuously)

### Phase 1 — App-layer tenant-guard (Node) — DONE, verified
- Added `shared/tenant-guard.ts` (branded `ScopedDealershipId`, generic `resolveTenantScope`
  funnel with owner re-check, `assertScopeOwns`, `serviceRoleScope` escape hatch) and
  `shared/rls.ts` (pure JWT-claim builder + `isRlsEnforced` flag parser). Both dependency-free →
  portable to Deno by construction.
- `server/db.ts`: added `dbUrl()`, `scoped()` executor (transaction that impersonates the
  `authenticated` role + injects claims when `RLS_ENFORCED`), `rlsEnforced()`,
  `createDefaultDealership()`. Converted crown-jewel accessors — `getComplianceAnswers`,
  `getAllComplianceAnswers`, `saveComplianceAnswer`, `getGeneratedDocuments`,
  `saveGeneratedDocument` — to require a `TenantScope` (compile-time: cannot touch another
  tenant's answers/docs without a session-derived scope).
- Rewired `server/routers.ts` (compliance.*, documents.*), `server/pdf-router.ts`
  (`requirePaidScope`), `server/stripe-router.ts` (default-dealership helper) onto the funnel.
- New `server/tenant-guard.test.ts` — 12 tests incl. the **A-cannot-read-B regression** and the
  defense-in-depth owner-refusal.
- Verify: `tsc --noEmit` → 0 errors; full vitest → **90/90** (was 78; +12).

### Phase 1b — App-layer tenant-guard (Deno mirror) — DONE (mirror-by-hand; Deno not tsc/vitest-covered)
- `supabase/functions/_shared/db.ts`: mirrored `scoped()`, `rlsEnforced()` (reads `Deno.env`),
  `createDefaultDealership`, and the TenantScope-only crown-jewel accessors.
- `supabase/functions/_shared/routers.ts`, `_shared/pdf-router.ts`, `_shared/stripe-router.ts`:
  rewired onto `resolveTenantScope`; dropped the duplicated `getOrCreateDefaultDealership` /
  `requirePaidDealership`.
- No `deno` binary available here (same constraint the MFA session hit) → Deno files verified by
  careful mirroring + a repo-wide grep confirming every crown-jewel call passes a `scope`.
- Pre-existing note: `and` is an unused import in the Deno `_shared/db.ts` (was unused before this
  change too — the Deno `getGeneratedDocuments` has no docType branch). Left as-is (not mine).

### Phase 2 — DB-layer RLS — DONE (ready + flag-gated; NOT applied, NOT enabled)
- `supabase/migrations/0002_tenant_isolation_rls.sql`: `current_user_dealership_ids()` SECURITY
  DEFINER helper; `FOR ALL TO authenticated` policies on users (self), dealerships (owner),
  compliance_answers / subscriptions / generated_documents (dealership-ownership); `FORCE ROW
  LEVEL SECURITY` on all five; FK indexes for policy predicates.
- **Safe-to-apply property:** the app connects as `service_role` (BYPASSRLS), so applying the
  migration does NOT change current behavior; it immediately protects any authenticated/Data-API
  access. Webhook + auth bootstrap (service-role, no JWT) unaffected.
- Runtime scoping is gated by `RLS_ENFORCED` (default OFF). `scoped()` wraps crown-jewel queries in
  a transaction that `set local role authenticated` + injects `request.jwt.claims` only when the
  flag is on. `shared/rls.ts` builds the claim payload (unit-tested).
- **Deliberately NOT done (needs a live DB + human validation, can't verify overnight):** applying
  the migration; flipping `RLS_ENFORCED`; extending scoped execution to the dealership/subscription
  paths (currently service-role). All captured in NextWork as the enable runbook.

### Verification (Node)
- `tsc --noEmit` → 0 errors. `vitest run` → **90/90** (10 files). `eslint client/src` → 0 warnings.

### Review gate (independent verifier) — findings + fixes
Ran the session-review protocol with an **independent verifier subagent** (not self-approved, per
CLAUDE.md "authoring and review are separate passes" + the security-sensitivity of the change).
Objective checks: `pnpm check` 0, `pnpm test` 90/90, `pnpm lint` 0.

Verifier verdict: PASS on the security objective (no cross-tenant leak; branded funnel sound;
both runtimes parity; migration fails *closed*), **NEEDS WORK on two items — both fixed this session:**
1. **[BLOCKING] Migration version collision.** My file was `0002_tenant_isolation_rls.sql` but
   `0002_auth_trigger.sql` already existed; the Supabase CLI keys on the numeric prefix and would
   **silently skip** my migration → RLS policies never created. **Fixed:** renamed →
   `0003_tenant_isolation_rls.sql`; updated the in-file header + all `0002`→`0003` code comments
   (shared/rls.ts, shared/tenant-guard.ts, both db.ts).
2. **[sync drift] `saveComplianceAnswer` upsert** updated `sectionName` on conflict in Node but the
   Deno copy omitted it (pre-existing divergence in a function I was already rewriting; violates the
   both-copies-in-sync non-negotiable). **Fixed:** added `sectionName` to the Deno on-conflict set.
- Re-verified after fixes: `tsc` 0 · `vitest` 90/90 · `eslint` 0. Migrations now order 0001, 0002
  (auth_trigger), 0003 (tenant_isolation_rls).

Verifier non-blocking notes carried into NextWork: (a) before flipping `RLS_ENFORCED`, validate on
staging that the `SUPABASE_DB_URL` role can `SET ROLE authenticated` and that
`current_user_dealership_ids()` resolves under FORCE RLS (both fail *closed* if not); (b) pre-existing,
out-of-scope: `getDocumentUrl` "most recent" has no ORDER BY; `getDb()` opens a client per call
without `end()`.

## Verdict: PASS → proceeding to session-end.

---

## Outcome — SHIPPED (2026-07-21)

**Remediation #2 delivered as two layers.**

**Live now (app-layer tenant-guard):**
- `shared/tenant-guard.ts` funnel (`resolveTenantScope` + branded `ScopedDealershipId` + owner
  re-check) is the single, tested path to a tenant scope. Crown-jewel accessors (compliance answers,
  generated documents) require a `TenantScope` → on the typechecked Node side it is a **compile
  error** to touch another tenant's rows without a session-derived scope. Enforced in both runtimes.
- `server/tenant-guard.test.ts` — 12 tests incl. the A-cannot-read-B regression + defense-in-depth.

**Ready, NOT enabled (DB-layer RLS) — human step, see NextWork:**
- `supabase/migrations/0003_tenant_isolation_rls.sql` — policies on all 5 tables, `security definer`
  helper, `FORCE RLS`, FK indexes. **Safe to apply while the app runs as service_role** (BYPASSRLS).
- `scoped()` executor (both `db.ts`) impersonates `authenticated` + injects JWT claims when
  `RLS_ENFORCED=true` (default OFF). `shared/rls.ts` claim builder is unit-tested.

**Verified:** `tsc --noEmit` → 0 · `vitest run` → 90/90 (10 files; +12) · `eslint client/src` → 0.
Independent verifier: no cross-tenant leak, fails closed, both-runtime parity. (Deno not
tsc/vitest-covered here — no `deno` binary — verified by mirroring + grep, as in session 0001.)

**Bug found & fixed this session (root cause):** migration named `0002_*` collided with the
existing `0002_auth_trigger.sql`; the Supabase CLI keys on the numeric prefix and would have
**silently skipped** the RLS migration. Root cause: didn't `ls supabase/migrations/` before naming.
Caught by the independent review gate; renamed to `0003_*`. Also synced a pre-existing
`saveComplianceAnswer` upsert drift (`sectionName`) between the two `db.ts` copies.

**Open threads (→ NextWork):**
1. Apply `0003` to Supabase + validate on staging that the DB role can `SET ROLE authenticated`
   and `current_user_dealership_ids()` resolves under FORCE RLS (both fail *closed* if not).
2. Flip `RLS_ENFORCED=true` (deploy-functions secret) only AFTER (1).
3. Extend `scoped()` execution to the dealership/subscription paths (currently service-role) so
   *all* app business queries are authenticated-scoped, not just crown-jewel.
4. Out of scope, pre-existing (noted by verifier): `getDocumentUrl` lacks `ORDER BY`; `getDb()`
   opens a client per call without `end()`.
