# Next Work — handoff for the next session

## Task
**Remediation #2 — Tenant isolation, defense-in-depth: add Supabase RLS policies (or a verified,
tested tenant-guard) so business rows cannot cross tenants even if application-layer filtering has
a bug.** PRD #46 — High.

## Cold-start context
- Today tenant isolation is **application-layer only.** RLS is *enabled* on every table but has
  **zero policies** (`supabase/migrations/0001_init_schema.sql:70-75` — no `CREATE POLICY`
  anywhere). Drizzle connects with the service role via `SUPABASE_DB_URL`, which **bypasses RLS
  entirely**, and every tRPC query scopes data by calling `getDealershipByUserId` (e.g.
  `server/routers.ts:46`, `104-113`). So the *only* thing preventing tenant A from reading tenant
  B's rows is that each query remembers to filter by the caller's dealership. One missing filter =
  a cross-tenant leak.
- Two enforcement strategies — pick one and document the decision in a `done/` log:
  1. **RLS policies** on `dealerships` / `compliance_answers` / `subscriptions` /
     `generated_documents` keyed on the authenticated user → dealership. Requires the Edge Function
     to run queries as the **authenticated** role (JWT-scoped), not the service role — a meaningful
     change to the DB access path, since Drizzle currently uses the service-role connection. This
     is the true "hard isolation" PRD #46 asks for.
  2. **Verified tenant-guard**: keep the service-role path but funnel every business query through a
     single helper that *requires* a `dealershipId` derived from `ctx.user`, plus tests that fail if
     a query bypasses it. Cheaper, but defense-in-depth is weaker (still app-layer).
- **If Step 1 (MFA) landed first**, the session JWT now carries `aal2` for MFA'd users — useful
  context if you choose the JWT-scoped RLS route, but not a prerequisite.
- Keep the two router copies and two `db.ts` copies in sync (see CLAUDE.md).

## Relevant files
- `supabase/migrations/0001_init_schema.sql:70-75` — where RLS is enabled with no policies.
- `server/db.ts` / `supabase/functions/_shared/db.ts` — the Drizzle helpers; service-role connection.
- `server/routers.ts:46,104-113` / `supabase/functions/_shared/routers.ts` — every business query
  and its `getDealershipByUserId` scoping.
- `server/_core/context.ts` / `supabase/functions/trpc/index.ts` — where the authenticated user
  (and, post-#1, the AAL) is established.
- `.agents/skills/supabase-postgres-best-practices/references/security-rls-basics.md` — on-disk RLS reference.

## First moves
1. Decide RLS-policies vs verified-tenant-guard; write the decision + rationale into today's `done/` log.
2. If RLS: draft policies for all four business tables and a migration; confirm the Edge query path
   can run as the authenticated role (this is the crux — validate it before writing every policy).
3. If tenant-guard: centralize `getDealershipByUserId`-scoped access and add tests that a query
   without tenant scoping fails.
4. Add a regression test proving tenant A cannot read tenant B's `compliance_answers`.

## Watch out for
- **Service role bypasses RLS.** Policies are invisible until queries run as the authenticated role
  — it's easy to "add policies" and prove nothing. Verify the access path first.
- Don't break the auto-create-default-dealership path (`server/routers.ts:16-31`).
- Both runtimes (Express + Deno) must enforce identically.

## After this
**Remediation #3 — Append-only audit trail** (immutable who/what/when; separate store) — PRD
#34/#51 — **Critical**. Start by logging auth events + every state-changing mutation. This pairs
naturally with #2 (both are about trustworthy access to tenant data) and begins building the
examiner/litigation record the product currently lacks entirely.
