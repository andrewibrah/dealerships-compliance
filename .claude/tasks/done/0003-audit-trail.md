# 2026-07-21 — Session 0003: Append-only, tamper-evident audit trail (PRD #34 / #51)

Active task: `.claude/tasks/CurrWork.md` (Remediation #3), promoted from NextWork this session
(`/session-start`) after the handoff was retargeted to #3 (commit `7065421`). Base HEAD for this
work: `7065421`.

## Mandate
Implement the examiner/litigation record the product entirely lacked: an **immutable who/what/when**
log of auth events and **every state-changing mutation**, in a **tamper-evident** store (PRD #34
Critical, #51 Critical). Deterministic, no LLM. Ship a complete, verified vertical slice.

## Outcome — CODE-COMPLETE, pending live-DB apply + deploy
All code is implemented and locally verified (types/tests/lint green, both-runtime parity). The DB-level append-only
+ hash-chain enforcement is authored and correct-by-review but **not yet applied/validated on a live
DB** (no local Postgres or `deno` here — same constraint as sessions 0001/0002). Apply + branch-deploy
validation + commit/deploy are the carried-forward human steps (see NextWork runbook).

## What is ready to ship
- **`audit_log` table** — `drizzle/schema.ts` (`auditLog`) + `supabase/migrations/0004_audit_log.sql`.
  Columns: `actor_user_id`, `actor_email`, `action`, `entity_type`, `entity_id`, `dealership_id`,
  `metadata` jsonb, `prev_hash`, `row_hash`, `created_at`, + 4 indexes.
- **Append-only enforced by TRIGGERS, not RLS** (the crux): the app connects as `service_role`
  (BYPASSRLS), so RLS cannot stop UPDATE/DELETE. `0004` adds `audit_log_block_mutation()` wired to
  `before update`/`before delete`/`before truncate` triggers (fire regardless of BYPASSRLS or table
  ownership) + `REVOKE update,delete,truncate`. This is the real immutability guarantee.
- **Tamper-evidence (SHA-256 hash chain)** — `0004` `audit_log_before_insert()` links
  `prev_hash -> row_hash` over a canonical row serialization, using `extensions.digest`. A
  transaction-scoped advisory lock serializes inserts so `prev_hash` is read consistently
  (correctness over throughput; fine at this write volume).
- **Runtime-neutral core** — `shared/audit.ts` (pure, dependency-free, mirrors `rls.ts`/
  `tenant-guard.ts`): `AUDIT_ACTIONS` vocabulary, `AuditRecord` shape, `buildAuditRecord`,
  `writeAuditSafely` (fail-open), `isNewLoginSession`. Unit-tested.
- **Writer in both runtimes** — `appendAuditLog` in `server/db.ts` and
  `supabase/functions/_shared/db.ts` (service-role insert; hash columns filled by the DB trigger).
- **Log points (both runtimes, in sync):**
  - Every state-changing mutation — `server/routers.ts` + `supabase/functions/_shared/routers.ts`:
    `dealership.create/update`, `compliance.saveAnswer/saveSection`, `subscription.create/updateStatus`,
    `documents.save`, `auth.logout`. (8 mutation sites per runtime.)
  - Auth login + MFA step-up — `server/_core/context.ts` + `supabase/functions/trpc/index.ts`,
    de-duplicated per session via `isNewLoginSession`.
  - Client `logout` wired to the (now-audited) `trpc.auth.logout` — `client/src/hooks/useAuth.ts`
    (it previously called `supabase.auth.signOut()` only, leaving that endpoint dead).
- **Tests** — `server/audit.test.ts` (10 tests): `buildAuditRecord` normalization, `writeAuditSafely`
  success + **fail-open**, `isNewLoginSession` boundaries, action-vocabulary sanity.

## Design decisions (logged per CurrWork's "decide + log the choice")
1. **Append-only via triggers, not RLS** — because `service_role` BYPASSRLS. Triggers + REVOKE.
2. **Hash chain computed in-DB** (BEFORE INSERT trigger + advisory lock), not in app code — so
   integrity holds regardless of which runtime writes, and concurrent inserts can't fork the chain.
3. **Fail-open** (`writeAuditSafely`): an audit-write failure is logged but never breaks the audited
   operation. Rationale: for an initial slice, never take down auth/mutations because logging
   hiccuped. Tradeoff: a mutation can succeed un-audited on a logging outage. **Revisit per-mutation
   fail-closed** for the highest-value mutations if the compliance posture requires it (→ NextWork).
4. **Login capture via a 30-min session-gap heuristic** in the context builder (not a client
   endpoint), so it's identical in both runtimes and doesn't spam per-request. Approximation, not a
   precise login signal — documented; a client post-auth callback could sharpen it later.

## Bug / divergence fixed this session (root cause)
- **Deno runtime never advanced `last_signed_in`.** `supabase/functions/trpc/index.ts` built the
  context without calling `updateUserLastSignedIn` (Node did). Left unfixed, the session-gap login
  heuristic would have mis-fired on the Edge (prev timestamp forever null → every request looks like
  a new login). Root cause: pre-existing Node/Deno context divergence. **Fixed:** added
  `updateUserLastSignedIn` + the same login/step-up logic to the Deno context, bringing both runtimes
  in sync.

## Verified
```
pnpm check → tsc --noEmit: 0 errors
pnpm test  → 11 files, 100 passed (100)      [was 90; +10 in server/audit.test.ts]
pnpm lint  → eslint client/src --max-warnings=0: clean
```
- **Both-runtime parity** (grep): 10 `appendAuditLog` call sites in each runtime; identical
  `AUDIT_ACTIONS.*` usage across `server/` and `supabase/functions/` (excluding the Node-only test).
- **Fail-open confirmed in practice**: `server/auth.logout.test.ts` exercises the real `auth.logout`
  mutation → audit write fails (no DB in test env) → logged `[audit] failed…` and the mutation still
  returns success. The fail-open path is live-tested by an existing test.
- Deno files not tsc/vitest-covered (no `deno` binary) → verified by careful mirroring + grep parity,
  as in sessions 0001/0002.

## Review gate (`/session-review`)
Walked all 6 acceptance criteria: 4 ✅, criterion #2 (DB enforcement) and the Edge writer ⚠️ partial
— code correct-by-review but pending live-DB/branch-deploy validation (inherent human step, not a
code gap). Scope clean (only the `useAuth.ts` client wiring extends beyond CurrWork's named files —
justified: makes logout auditing real). No non-negotiable weakened. **Verdict: PASS.** Note: this was
a same-context review (session's no-subagent constraint) — an **independent verifier pass is
recommended before commit/deploy**, consistent with 0002.

## Open threads (→ NextWork enable/validate runbook)
1. **Apply `0004` to a DB** with `supabase db push` — after `0003` (it references
   `current_user_dealership_ids()`), which the numeric ordering guarantees.
2. **Validate on a staging/branch deploy** (all fail toward the safe side if unmet):
   - `update`/`delete`/`truncate` on `audit_log` are rejected **even as `service_role`** (triggers).
   - `extensions.digest` resolves (pgcrypto in the `extensions` schema — Supabase default).
   - A real mutation writes a row and `row_hash`/`prev_hash` populate (chain links).
   - Authenticated Data-API read is scoped to own dealership/actor by the `audit_log_read_own` policy.
3. **Commit + deploy** on Andrew's go (like 0002): Edge auto-deploys via `deploy-functions.yml`;
   `0004` is a human `db push`.
4. **Consider per-mutation fail-closed** for the highest-value mutations (currently all fail-open).
5. **Surfacing**: no UI to *view* the trail yet, and no hash-chain verification tool/endpoint — both
   feed the examiner-package export (PRD #36). Natural follow-ons once entities land.

## Deployment attempt — 2026-07-21
- Validated `.env` without exposing secrets: the project/API URLs, project ref, pooler host,
  `postgres.<project-ref>` username, port 6543, and `/postgres` database are structurally correct;
  the password embedded in `SUPABASE_DB_URL` matches `SUPABASE_DB_PASSWORD`.
- `supabase migration list` with the `.env` password explicitly injected still failed with SQLSTATE
  `28P01`. A direct `psql` authentication check against the same pooler failed identically, proving
  this is a live database/pooler credential mismatch rather than URL placement or CLI env loading.
- The direct IPv6 database hostname was unavailable from this network, so it could not bypass the
  pooler for a second-path check. No migration was applied and GitHub was deliberately not pushed,
  preserving the required DB-before-Edge deployment order.
