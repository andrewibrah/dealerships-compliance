# 2026-07-27 — Session 0006: Supabase ↔ webapp communication layer audit + repair

Active task: `.claude/tasks/CurrWork.md` (promoted from NextWork `6422b16`). Base HEAD `6422b16`.

## Measurement pass (before any change)

### Area 1 — Connection lifecycle ⚠️ ROOT CAUSE OF BUG 2
Two client factories in each runtime (`server/db.ts:29,45`, `supabase/functions/_shared/db.ts:24,38`):

| Factory | Call sites (per runtime) | Constructs a `postgres()` client | Releases it |
|---|---|---|---|
| `getDb()` | 13 | per call | **never** |
| `scoped()` | 31 | per call | yes — `client.end({timeout:5})` in `finally` |

`scoped()` is NOT the leak. **`getDb()` is** — 13 exported functions call it, each constructing a
fresh `postgres()` client (default pool `max: 10`) that is never ended. In a Deno Edge isolate the
client outlives the invocation, so its opened sockets accumulate across requests.

Leaked clients per batched dashboard load (traced by hand):
- `createContext`: `createUser` (1), `updateUserLastSignedIn` (2), `appendAuditLog` on a new
  session (3)
- `compliance.getAnswers` → `resolveTenantScope` → `getDealershipByUserId` (4)
- `dealership.getCurrent` → `getDealershipByUserId` (5)
- `tasks.list` → `resolveTenantScope` (6)
- `posture.list` → `resolveTenantScope` (7)

≈ **7 leaked clients per dashboard load.** Against a default-tier direct-connection budget (~60
non-superuser slots) that predicts failure at request ~9 — which matches the reported repro exactly
(`200 ×9`, then `500 ×3`). The observed error string
(`remaining connection slots are reserved for roles with the SUPERUSER attribute`) is the *direct
Postgres* message, not a pooler message — corroborating Area 2 below.

### Area 2 — Connection target ⚠️ EDGE IS NOT ON THE POOLER
- Local `.env` `SUPABASE_DB_URL` → `...pooler.supabase.com:6543` ✓ (transaction mode, correct)
- Local value sha256: `495d053eac86ee666f66f3876ae1c3112fe964ffcb5e7e4e4ec040aedeef060f`
- Edge secret `SUPABASE_DB_URL` digest: `2db6d4b27e127d3fee6ecb5644c03358bc8f401be6dc9240d61d3ca39b2d2546`

**They differ.** The Edge Function — the runtime that actually serves production — is connecting to
a different target than local dev, and the SUPERUSER-slot error is the direct-connection signature.
`prepare: false` is already set in both runtimes and must stay.

### Area 3 — Request fan-out ✓ ALREADY CORRECT
`client/src/main.tsx:42` already uses `httpBatchLink`, so the Dashboard's 5 queries collapse into
one HTTP request and `createContext` runs once. No change needed. The cost is server-side
(per-procedure `resolveTenantScope`), not HTTP round-trips.

### Area 6 — Caching/staleness
`client/src/main.tsx:11` is a bare `new QueryClient()` — no `staleTime`, so React Query's defaults
refetch on every mount and window focus. Every tab focus replays the full 5-query batch.

### Bug 2 sub-bug — auth/data coupling ⚠️ CONFIRMED
`useAuth.ts:31` sources `user` from `trpc.auth.me`. Eight pages then do `if (!user) → redirect`
(`Dashboard.tsx:127`, `Policies.tsx:80`, `Tasks.tsx:84`, `Documents.tsx:99`, `Profile.tsx:109`,
`Architecture.tsx:228`, `Evidence.tsx:179`, `Summary.tsx:66`). A **500** on `auth.me` leaves
`user === null` and `userLoading === false`, which is indistinguishable from "not signed in" — so a
data-layer failure ejects the user. The Supabase session itself is never cleared; the redirect only
makes it look that way. `main.tsx:17` correctly redirects only on `UNAUTHED_ERR_MSG`, so the bug is
in the page guards, not the global error handler.

### Carryover 4 — edge secret typos ✓ CONFIRMED
`STRIPE_SECERT_KEY` (digest differs from `STRIPE_SECRET_KEY` — a stale distinct value),
`STRIPE_WEBHOOK_KEY` (digest identical to `STRIPE_WEBHOOK_SECRET` — a pure duplicate),
`VITE_APP_URP`.

### Areas 4/5 — per-call cost + N+1 (found, NOT yet fixed)
- `server/routers.ts:55-58` `upsertDerivedControls` — `for (…of Object.entries(answers)) await
  db.upsertControl(…)`: up to **45 sequential round-trips per section save**. The single largest
  per-call cost in the app.
- `server/routers.ts:651-653` task derivation — sequential `createTask` + `appendAuditLog` per task.
- `client/src/pages/Profile.tsx:61` — `utils.invalidate()` with no key invalidates the **entire**
  query cache, refetching the whole tenant after one profile edit.

## Actions

### 1. Connection lifecycle — FIXED (both runtimes)
`shared/db-options.ts` (new) holds `POSTGRES_OPTIONS` so the two hand-synced `db.ts` copies cannot
drift. Both `server/db.ts` and `supabase/functions/_shared/db.ts`:
- `getDb()` now returns drizzle over ONE lazily-created, process/isolate-wide client instead of
  constructing (and abandoning) a new one per call.
- `scoped()` runs on that same shared client and no longer calls `client.end()`.

**Tenant isolation preserved by construction:** postgres.js reserves a dedicated connection for the
duration of a `transaction()`, and both `set_config(..., true)` and `set local role` are reverted by
Postgres at COMMIT/ROLLBACK — no scoping state can outlive the transaction or leak to the next
borrower. `server/tenant-guard.test.ts` (A-cannot-read-B) still passes.

### 2. Pooler mode — DEVIATION FROM THE HANDOFF, driven by measurement
The handoff directed transaction mode (6543). **Measurement says transaction mode is the wrong
target for this driver.** postgres.js deadlocks against Supavisor transaction mode as soon as
concurrent callers exceed `max` (i.e. the moment a query must wait for a pooled connection).
Reproduced with **raw postgres.js and `select 1`** — no drizzle, no application code:

| Mode | max | N concurrent | Result |
|---|---|---|---|
| transaction (6543) | 5 | 20 | **STALLED** — never completes (>50s) |
| transaction (6543) | 5 | 60 | **STALLED** |
| transaction (6543) | 25 | 20 | 20/20 ok, 364 ms *(no query ever waits)* |
| session (5432) | 5 | 20 | 20/20 ok, 366 ms |
| session (5432) | 5 | 60 | 60/60 ok, 389 ms |

Ruled out along the way: pool poisoning from earlier killed runs (re-tested from a terminated-clean
pool — still stalls), `fetch_types` type introspection, `idle_timeout`, and drizzle.
Chosen target: **Supavisor session mode, port 5432 on the pooler host**, with `max: 5` bounding the
per-isolate footprint (project `max_connections` = 60, 3 superuser-reserved).

### 3. Bug 2 — before/after against the real db layer
Same load, same code paths, session mode, from a clean pool:

| | 30 concurrent | 60 concurrent | 120 concurrent | 120 sequential |
|---|---|---|---|---|
| **Before** | **0/30 ok, 30 failed**, 15 sockets leaked | 0/60 ok | — | — |
| **After** | — | 60/60 ok, 1671 ms | **120/120 ok**, 2779 ms | 120/120 ok |
| **Sockets held after** | 15 (leak) | 5 | **5** | 1 |
| **Backends** | 16 | 6 | **6 (flat)** | 2 |

Acceptance ("50+ calls all 200; connection count flat") **met at 120**, over double the bar.

### 4. Bug 2 sub-bug — auth/data decoupling — FIXED
New `client/src/components/SessionDataError.tsx`. `useAuth` now exposes `userError` + `refetchUser`
and documents that `isAuthenticated` is session-derived only. All **8** page guards changed from
`if (!user) → /login` to: redirect only when `!isAuthenticated`; when a session exists but the
account failed to load, render `SessionDataError` with a retry. A 500 on data no longer ejects a
signed-in user, and the Supabase session is never torn down.

### 5. Area 6 — caching — FIXED
`client/src/main.tsx`: `QueryClient` given `staleTime: 30_000` + `refetchOnWindowFocus: false`, so
the 5-query dashboard batch no longer replays on every remount and tab focus.

### 6. Pooler mode — CORRECTED after live testing (transaction mode wins)
The session-mode conclusion above was drawn from a **single local process** and did not survive
contact with the many-isolate Edge runtime. Both modes have a ceiling:

- **Session mode (5432)** — Supavisor caps session clients project-wide at **`pool_size: 15`**.
  Deployed and load-tested: 60 concurrent authenticated calls returned **56×500** with
  `FATAL: (EMAXCONNSESSION) max clients reached in session mode`. Not viable for Edge.
- **Transaction mode (6543)** — multiplexes many clients onto a small server pool (what a
  many-isolate runtime needs), but postgres.js **stalls** if a query ever waits for a connection,
  and Supavisor caps clients at **200** total.

Final config: **transaction mode**, `max: 10` (above the ~7 concurrent queries one batched request
issues, so nothing queues; low enough that ~20 isolates fit under the 200-client ceiling),
`idle_timeout: 5` (an idle isolate must not pin client slots). `max: 20` was measured too high —
sustained 60-concurrent bursts hit `FATAL: (EMAXCONN) max client connections reached, limit: 200`.

`APP_DB_URL` was introduced because `supabase secrets set` rejects the reserved prefix
(`Env name cannot start with SUPABASE_`), so the platform-injected `SUPABASE_DB_URL` — the actual
cause of the digest mismatch — cannot be overridden. Both runtimes now read `APP_DB_URL` first.

### 7. Live acceptance (deployed Edge Function, authenticated, DB path)
`auth.me` with a real bearer token exercises `createUser` + `updateUserLastSignedIn` — the leaky path.

| Config | Load | Result |
|---|---|---|
| session mode, max=5 | 60 sequential | 46×200, **14×500** |
| session mode, max=5 | 60 concurrent | 4×200, **56×500** |
| txn mode, max=20 | 60 seq / 60 conc / 120 conc | 200 / 200 / 200 — but 3rd sustained burst **EMAXCONN** |
| **txn mode, max=10, idle 5** | **4 back-to-back bursts of 60 concurrent** | **240/240 × 200** |

Backends flat at 38 during load, settling to **13** (baseline) after. Post-deploy re-verification
after the N+1 changes: 3×60 concurrent → **180/180 × 200**, backends 13.

### 8. N+1 / per-call cost — FIXED
- New `upsertControls(scope, inputs[])` in **both** runtimes: one transaction, one
  `insert … on conflict do update` using `excluded.*`. `upsertDerivedControls` now builds the set
  then writes once — **up to 45 sequential round-trips per section save → 1**.
- New `createTasks(scope, inputs[])` in both runtimes; `tasks.deriveFromControls` inserts the whole
  derived set in one statement. The per-task `appendAuditLog` calls are **deliberately left
  sequential** — `audit_log` is a SHA-256 `prev_hash → row_hash` chain and must stay ordered.
- Tenant guarantee unchanged: every batched row's `dealershipId` comes from the resolved `scope`.

**Correction to the earlier finding:** `Profile.tsx:61`'s cache-wide `utils.invalidate()` is NOT a
defect. It is in the **logout** path and is intentionally broad so the next account to sign in on
that browser cannot be shown the previous dealership's cached data. Narrowing it would weaken tenant
isolation — left as-is. The profile-save path (`Profile.tsx:88`) was already targeted.

### 9. Bug 3 — deep-link 404s — ACCEPTED + DOCUMENTED (user decision)
Verified live: `/` and `/index.html` → **200**; `/dashboard`, `/login`, `/evidence`, `/signup` →
**404**; `/404.html` → 200. No monitoring config exists anywhere in the repo. Documented the
tradeoff in CLAUDE.md with the required probe targets: **`/` for the frontend and
`<VITE_API_URL>/trpc/system.health` for the API — never a deep link.**

### Gates (final)
`pnpm check` clean · `pnpm test` 29 files / **283 passed** (baseline 283) · `pnpm lint` clean ·
`pnpm build` clean (dist/index.js 209.1kb) · two-runtime parity **49/49 exports, identical sets**.

### Deployed
`supabase functions deploy trpc` (×3 across the tuning iterations), plus `stripe-webhook` and
`handle-signup` once. Edge secret `APP_DB_URL` set to the transaction-mode pooler URL
(sha256 `495d053e…`, matching local).

## Notes / residue
- **A load-test user remains in production**: `loadtest-1785213363@example.com`
  (`0ecbeab1-aecd-4d1a-ae97-583b9209d53e`). It could not be deleted — `audit_log` references it and
  that table is append-only by design. Deleting audit rows would violate a non-negotiable, so the
  credential was **banned until 2126** instead and the single audit row left intact. This is the
  correct outcome for an append-only trail, but it is real production data worth knowing about.
- Local `.env` `SUPABASE_DB_URL` is back on **6543** (it was briefly moved to 5432 during testing).
  A timestamped backup was written to `/tmp/.env.backup.*`.
- Carryover 4 (edge secret typos) is **confirmed but not fixed**: `STRIPE_SECERT_KEY` (distinct
  stale value), `STRIPE_WEBHOOK_KEY` (exact duplicate of `STRIPE_WEBHOOK_SECRET`), `VITE_APP_URP`.
- Carryovers 1–3 (independent branch audit, GitNexus licensing, Deno `zod` pin) **not started**.
