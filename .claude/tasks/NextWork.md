# Next Work — handoff for the next session

## Carryover from #2 (operational, ~15 min — do this first)
Remediation #2 (tenant isolation) shipped and is **deployed** (commit `5f6efe0`; app-layer guard LIVE
in prod). One short operational tail remains before the DB-layer RLS backstop is actually enforcing —
it needs a human + a staging check, so it lives here rather than as a whole task:
1. **Apply `supabase/migrations/0003_tenant_isolation_rls.sql`** to Supabase (`supabase db push`, or
   paste into the SQL editor). Safe anytime — the app runs as `service_role` (BYPASSRLS), so this
   changes nothing until step 3.
2. **Validate on staging:** the `SUPABASE_DB_URL` role can `SET ROLE authenticated`, and two seeded
   tenants cannot read each other with the flag on (both failure modes fail *closed*).
3. **Set `RLS_ENFORCED=true`** (Edge secret in `deploy-functions.yml` + local `.env`) → redeploy.
4. (Optional follow-up) extend `scoped()` to the dealership/subscription paths so *all* business
   queries are authenticated-scoped, not just the crown-jewel tables.
Full detail + rationale: `.claude/tasks/done/0002-tenant-isolation.md`.

---

## Task
**Remediation #3 — Append-only audit trail: an immutable who/what/when record of auth events and
every state-changing mutation, in a tamper-evident store.** PRD #34 / #51 — **Critical**.

## Cold-start context
- The product has **no audit trail today** — only `console.error` (`supabase/functions/trpc/index.ts`
  onError). For a compliance system of record this is the examiner/litigation gap flagged Critical in
  gaps.md (#34, #51).
- This pairs naturally with #2: we just built the tenant-scoping seam (`resolveTenantScope` →
  `TenantScope`), so audit rows can be scoped/attributed with the same `ctx.user` + dealership.
- **Deterministic, no LLM** in this path (compliance non-negotiable).

## Design sketch (decide + log the choice in the `done/` log, like #2)
- **New `audit_log` table** (`drizzle/schema.ts` + a `000X` migration — remember: `ls
  supabase/migrations/` first, next free number is `0004`): `id`, `actor_user_id`, `actor_email`,
  `action` (e.g. `auth.login`, `compliance.saveSection`, `subscription.updateStatus`,
  `pdf.generateWISP`), `entity_type`, `entity_id`, `dealership_id` (tenant scope), `metadata` jsonb,
  `created_at`. Consider a `prev_hash`/`row_hash` chain for the "tamper-evident" half of #51.
- **Append-only is the crux.** RLS with an INSERT-only policy blocks the `authenticated` role, but the
  app connects as `service_role` (BYPASSRLS) — so RLS alone won't stop a delete/update. The real
  append-only guard is a **DB trigger that `raise exception` on UPDATE/DELETE** (fires even for the
  table owner) and/or `REVOKE UPDATE, DELETE`. Validate this actually blocks the service-role path.
- **Both runtimes write identically:** a shared `audit` helper in `shared/` + a writer in **both**
  `db.ts` copies; call it from the mutation procedures in **both** router copies. Keep in sync
  (CLAUDE.md non-negotiable).
- **Log points:** auth events (login / MFA step-up / logout — `server/_core/context.ts` +
  `supabase/functions/trpc/index.ts`) and every state-changing mutation (compliance saveSection,
  dealership create/update, subscription create/updateStatus, document save/generate).

## Relevant files
- `drizzle/schema.ts` — add `audit_log`; `supabase/migrations/0004_*.sql` — table + append-only
  trigger + (if chosen) RLS read policy.
- `server/db.ts` / `supabase/functions/_shared/db.ts` — add the audit writer (both copies).
- `server/routers.ts` / `supabase/functions/_shared/routers.ts` — call audit on each mutation.
- `server/_core/context.ts` / `supabase/functions/trpc/index.ts` — auth-event logging.
- `shared/` — a runtime-neutral audit-event shape/helper (mirror the `shared/tenant-guard.ts` +
  `shared/rls.ts` pattern from #2).

## Watch out for
- **service_role bypasses RLS** — append-only must be enforced by a trigger/GRANT, not RLS alone.
- Don't let audit-write failures break the mutation UX unless the compliance posture requires it —
  decide fail-open vs fail-closed and log the decision.
- Two router copies + two `db.ts` copies stay in sync; both runtimes write identical rows.
- No `deno` binary locally → verify the Edge writer on a Supabase branch deploy.

## After this
**Remediation #4 — Core compliance object model** (Control, Requirement, Risk, Evidence, Task,
Policy, Asset, DataFlow, Attestation) — PRD #3 — High. Unblocks evidence, tasks, citations, risk
assessment. The audit trail from #3 will hang off these entities.
