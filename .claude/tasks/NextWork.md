# Next Work — handoff for the next session

## Task
**Finish Remediation #2 — enable & validate the DB-layer RLS backstop that session 0002 staged.**
The app-layer tenant-guard is already live and tested; the RLS policies + the flag-gated
authenticated-scoping executor are written but **not applied and not enabled**. This session turns
the DB-level "hard isolation" on, safely, with staging validation. PRD #46 — High.

## Cold-start context (what 0002 shipped)
- **App-layer guard is LIVE.** Business reads/writes of the crown-jewel tables (`compliance_answers`,
  `generated_documents`) funnel through `resolveTenantScope(db, ctx.user.id)` and require a branded
  `TenantScope`. See `.claude/tasks/done/0002-tenant-isolation.md` for the full rationale + review.
- **RLS is staged but dormant:**
  - `supabase/migrations/0003_tenant_isolation_rls.sql` — policies on all 5 tables, the
    `current_user_dealership_ids()` SECURITY DEFINER helper, `FORCE ROW LEVEL SECURITY`, FK indexes.
    **Not yet applied** to the Supabase DB.
  - `scoped()` in `server/db.ts` + `supabase/functions/_shared/db.ts` runs crown-jewel queries as the
    `authenticated` role with injected `request.jwt.claims` **only when `RLS_ENFORCED=true`**. The
    flag is **off** everywhere. `shared/rls.ts` builds the claim payload (unit-tested).
- **Why it's gated:** RLS is enabled on every table (since 0001) with — until 0003 is applied — zero
  policies. Flipping `RLS_ENFORCED=true` before 0003 is applied would **deny-all** (fails closed, no
  leak, but the app breaks). Order matters.

## Enable runbook (do in order — each step gated on the previous)
1. **Apply `0003` to a staging/branch DB first** (Supabase CLI: `supabase db push`, or run the SQL in
   the SQL editor). Safe even with `RLS_ENFORCED` off — the app is `service_role` (BYPASSRLS) so
   nothing changes yet; policies only start protecting authenticated/Data-API access.
2. **Validate the two runtime preconditions on staging** (both fail *closed* if unmet, so verify
   before trusting enforcement):
   - The `SUPABASE_DB_URL` role can `SET ROLE authenticated` (Supabase `postgres` normally can). Test:
     open a psql session as that role and run `set role authenticated;` — must succeed.
   - With `RLS_ENFORCED=true` on staging, a real user can still read **their own** answers and cannot
     read another tenant's. Seed two dealerships/users and check `compliance.getAll` for each.
3. **Flip `RLS_ENFORCED=true`** — it's read via `process.env` (Node) and `Deno.env.get` (Edge). Set it
   as an Edge secret in `.github/workflows/deploy-functions.yml` and in local `.env`. Deploy.
4. **Prod:** apply `0003` to prod, smoke-test, then set the prod `RLS_ENFORCED=true` secret + redeploy.
5. **(Follow-up, same task or next):** extend `scoped()` to the dealership/subscription read/write
   paths so *all* business queries are authenticated-scoped, not just crown-jewel. Today those stay
   service-role (they're still app-scoped by `ctx.user.id`, and RLS protects them against Data-API
   access, but they don't exercise the authenticated role).

## Relevant files
- `supabase/migrations/0003_tenant_isolation_rls.sql` — the policies to apply.
- `server/db.ts:34` / `supabase/functions/_shared/db.ts:28` — `scoped()` executor (the role-switch).
- `shared/rls.ts` — claim builder + `isRlsEnforced` flag parser (unit-tested in
  `server/tenant-guard.test.ts`).
- `shared/tenant-guard.ts` — the app-layer funnel (already live).
- `.github/workflows/deploy-functions.yml` — where the `RLS_ENFORCED` Edge secret must be set.
- `.claude/tasks/done/0002-tenant-isolation.md` — full decision log + review findings.

## Watch out for
- **Ordering:** never set `RLS_ENFORCED=true` before `0003` is applied to that environment → deny-all.
- **service_role must keep bypassing:** the Stripe webhook (`supabase/functions/stripe-webhook/`) and
  the auth-bootstrap `createUser` have no user JWT and MUST stay service-role. `0003` does not add
  policies that block service_role (BYPASSRLS is a role attribute) — don't "fix" that.
- **Two runtimes / two copies** stay in sync (see CLAUDE.md). Both `db.ts` copies already match.
- **No `deno` binary locally** → Deno files aren't tsc/vitest-covered; verify Edge behavior on a
  Supabase branch deploy, not just locally.

## After this
**Remediation #3 — Append-only audit trail** (immutable who/what/when; separate store) — PRD
#34/#51 — **Critical**. Start by logging auth events (login, MFA step-up, logout) + every
state-changing mutation (saveSection, subscription changes, document generation). This is the
examiner/litigation record the product lacks entirely, and it pairs naturally with the now-hardened
tenant-access layer.
