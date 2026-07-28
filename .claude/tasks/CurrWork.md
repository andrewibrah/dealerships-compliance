# Next Work — handoff for the next session

## Task
**Full audit + repair of the Supabase ↔ webapp communication layer.** Treat this as a DevOps/perf
pass on the core feature: how the client talks to the API, how the API talks to Postgres, how many
round-trips a page costs, and whether any of it survives real traffic. Two confirmed production
bugs (below) are part of this task, not separate work.

Approach it like a real infra engineer: measure first, then fix. Every fix needs a before/after
number or a test, not a vibe.

## Scope — what to audit
1. **Connection lifecycle (highest priority — see Bug 2).** How Postgres clients are created,
   pooled, reused, and released in BOTH runtimes (`server/db.ts`, `supabase/functions/_shared/db.ts`).
   Look specifically at `getDb()` vs `scoped()`: how many `postgres()` clients does one tRPC call
   construct, what is each client's default pool size, and which paths ever release.
2. **Connection target.** Confirm the *Edge Function's* `SUPABASE_DB_URL` (not just the local `.env`)
   uses the **transaction-mode pooler on port 6543**, not 5432. The edge secret and the local value
   are NOT identical today — verify with `supabase secrets list --project-ref $SUPABASE_PROJECT_REF`
   and compare digests. Transaction mode requires `prepare: false` (already set — keep it).
3. **Request fan-out.** The dashboard fires ~5 tRPC calls per load (`auth.me`,
   `compliance.getAnswers`, `dealership.getCurrent`, `tasks.list`, `posture.list`). Check whether
   tRPC batching is actually enabled in `client/src/lib/trpc.ts` (httpBatchLink vs httpLink), and
   whether these should collapse into one procedure or be cached/staleTime'd instead of refetched.
4. **Per-call cost.** `resolveTenantScope` runs on nearly every procedure and re-queries the
   dealership; `upsertDerivedControls` does one `listRequirements()` + up to N sequential
   `upsertControl` round-trips per save; `recordPostureSnapshot` adds two more reads per save.
   Measure and batch what can be batched.
5. **Query efficiency.** Missing indexes, N+1 patterns (esp. evidence↔control link resolution and
   the examiner package's gather step), and anything doing per-row queries in a loop.
6. **Caching/staleness.** React Query defaults, `enabled` guards, and invalidation breadth — are we
   refetching the whole tenant on every mutation?

## Bug 2 — Postgres connection pool exhaustion ⚠️ SERIOUS
Reproduced: 12 identical tRPC calls → `200 ×9`, then `500 ×3`.
```
PostgresError: remaining connection slots are reserved for roles with the SUPERUSER attribute
```
The Edge Function opens a new Postgres connection per invocation and never releases it. Works for
one user clicking slowly; collapses under any real traffic — and fails harder because the dashboard
fires a 5-query batch on every load.

**Fix direction:** connect via the transaction-mode pooler (port **6543**, not 5432), and hoist the
client to **module scope** so it is reused across invocations instead of constructed per request.
Note the two code paths differ — one releases its client, one does not — so confirm which is
actually leaking before patching, and fix both runtimes identically.

**Related, decouple it:** after login, landing on `/dashboard` → stuck at "Loading your compliance
data…" → thrown back to the logged-out landing page with the session cleared. A failed *data* load
is being handled as an *auth* failure. A 500 on data must not sign the user out. Check
`client/src/hooks/useAuth.ts` and the redirect guards in the page components.

**Acceptance:** 50+ concurrent/sequential identical calls all return 200; connection count stays
flat under load (`select count(*) from pg_stat_activity`); a forced 500 on a data query leaves the
session intact.

## Bug 3 — Deep links return HTTP 404
`/dashboard`, `/login`, `/evidence`, `/signup` all return **404 status codes**. The `404.html`
redirect shim boots the SPA so it *looks* fine in a browser, but crawlers, uptime monitors, and
link previews see a 404. Standard GitHub Pages tradeoff — invisible in a browser, real for anything
automated.

**Fix direction:** either accept + document it, or move the frontend to a host that supports SPA
rewrites (the repo already has Vercel config/skills available). Decide deliberately; if we keep
GitHub Pages, at minimum make sure uptime monitoring targets a path that returns 200.

**Acceptance:** `curl -o /dev/null -w '%{http_code}' <deploy-url>/dashboard` returns 200 (or a
documented, deliberate decision to keep 404 with monitoring adjusted).

## Relevant files
- `server/db.ts:29-59` (`getDb`, `scoped`) and `supabase/functions/_shared/db.ts:24-52` — the twins
- `supabase/functions/trpc/index.ts` — Edge entrypoint / per-invocation lifecycle
- `client/src/lib/trpc.ts` — link config, batching
- `client/src/pages/Dashboard.tsx:38-49` — the 5-query fan-out
- `client/src/hooks/useAuth.ts` — session teardown + the auth/data coupling
- `server/routers.ts` / `supabase/functions/_shared/routers.ts` — `upsertDerivedControls`,
  `recordPostureSnapshot`, `resolveTenantScope` call sites
- `shared/tenant-guard.ts:51` — `resolveTenantScope` (runs on nearly every procedure)
- `.github/workflows/deploy-frontend.yml`, `client/public/404.html`, `vite.config.ts` (base path)

## Watch out for
- **Both runtimes stay in sync** — `server/*` ↔ `supabase/functions/_shared/*`. Current parity:
  db.ts exports 48/48. No `deno` binary locally, so mirror exactly + grep parity.
- **Module-scope hoisting must not break tenant isolation.** `scoped()` sets `set local role` +
  JWT claims inside a transaction; a shared/pooled client must still deliver those per-transaction,
  and `set local` must never leak across pooled sessions. This is the one place where a perf fix
  could silently become a security bug — test A-cannot-read-B (`server/tenant-guard.test.ts`) after.
- **Transaction-mode pooling does not support prepared statements or session-level state.** Keep
  `prepare: false`; audit anything relying on session GUCs outside a transaction.
- Don't regress: 283 tests, `pnpm check` / `test` / `lint` / `build` all currently green.
- Migrations are applied directly by the agent now (see CLAUDE.md) — history is reconciled and
  `0001`–`0012` are recorded; next free number is `0013`.

## Carryover (small, unrelated)
1. **Re-run the whole-branch integrity audit** — it never completed last session (reviewer hit its
   usage limit); the orchestrator self-verified, which doesn't satisfy the no-self-approval rule.
2. **Decide on GitNexus licensing** — `PolyForm-Noncommercial-1.0.0` on a commercial product.
3. **Pin `zod` in the Deno runtime** — `npm:zod` unpinned vs Node's lockfile 3.25.76.
4. **Fix edge-secret typos** — `STRIPE_SECERT_KEY`, `VITE_APP_URP`, `STRIPE_WEBHOOK_KEY`.

## After this
**Remediation #10 — Law-as-data** (PRD #6/#5): externalize §314.4 to versioned content with
effective dates + applicability. Then #13 recurrence engine, #14 dealer groups. Phase 4 designs
(RBAC, onboarding, recurrence, attestations) are in `.claude/tasks/done/0005-front-facing-phases-1-3.md`.
