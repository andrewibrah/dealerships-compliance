# 2026-07-21/22 — Session 0004: Core compliance object model (PRD #3)

Active task: `.claude/tasks/CurrWork.md` (Remediation #4), promoted from NextWork this session
(`/session-start`). Base HEAD for this work: `0a4fd25` (after #3 audit trail was committed +
its Supabase policies reconciled). Result committed as `db546a9` on branch `feat/prd3-object-model`
(pushed to origin).

## Mandate
Model the nine first-class PRD #3 entities — Control, Requirement, Risk, Evidence, Task, Policy,
Asset, DataFlow, Attestation — in Drizzle, additively, without breaking the questionnaire/scoring,
and begin migrating off opaque `compliance_answers.answers` JSONB. Run it as a batched
builder→reviewer subagent workflow (user's request), checkpointing after each batch.

## Outcome — SHIPPED (committed on a branch), all 9 entities, all gates green
Built in three independently-authored + independently-reviewed slices; every slice PASS. Nothing
was self-approved (CLAUDE.md non-negotiable). Working tree committed to `feat/prd3-object-model`;
migrations authored but NOT applied (human/live-DB step, see open threads).

## What shipped
- **Requirement** — GLOBAL, versioned §314.4 catalog (NOT tenant-scoped; it's the law, identical
  for every dealer). 45 rows seeded from `SAFEGUARDS_SECTIONS` + a section→§314.4 citation map.
  Source of truth: `shared/requirements.ts` (`REQUIREMENT_CATALOG`). RLS: `enable`+`force` +
  `for select to authenticated using (true)`; seeded BEFORE force-RLS so the seed isn't blocked.
- **Control, Risk, Evidence (+ `evidence_controls` join), Task, Policy, Asset, DataFlow,
  Attestation** — all TENANT-SCOPED crown-jewel data: `dealership_id` FK, reached only through a
  resolved `TenantScope`, RLS tenant policy (`dealership_id in (select current_user_dealership_ids())`),
  every mutation audited. `update*` accessors re-filter `where(and(eq(id), eq(dealershipId)))` and
  writes `Omit` the client dealership id (forced from scope).
- **Migrations** `0005_core_object_model.sql` (Requirement/Control/Risk + seed), `0006_…batch_2.sql`
  (Evidence/join/Task/Policy), `0007_…batch_3.sql` (Asset/DataFlow/Attestation). Each mirrors the
  `0003`/`0004` RLS house style; guarded enum creation; every new table gets its policy in-migration.
- **Both runtimes in sync** (CLAUDE.md non-negotiable): `drizzle/schema.ts`, both `db.ts`, both
  router copies, both `storage.ts` (added `evidenceGetSignedUrl` for a private `evidence` bucket),
  `shared/audit.ts` (+9 `AUDIT_ACTIONS`). Deterministic — no LLM in the path.
- **Migration building block** (not yet wired): `shared/controls.ts` `deriveControlStatus` /
  `deriveControlsFromAnswers` maps answers→ControlStatus, matching `scoring.ts` value semantics
  (unanswered → `unknown`, never guessed negative).
- **Tests** — `server/requirements.test.ts` (catalog integrity: 45/unique/maps-to-question/citation),
  `server/controls.test.ts` (status mapping incl. unknown), `server/requirements-seed.test.ts`
  (drift-guard: the `0005` SQL seed codes must equal `REQUIREMENT_CATALOG`), + batch-2/3 action
  drift guards in `server/audit.test.ts`.

## Design decisions (logged, per CurrWork's "decide + log the choice")
1. **Requirement is GLOBAL, not tenant-scoped** — deviation from CurrWork's "scope each to
   dealership_id". Rationale: it's the FTC rule ("law as data", #5/#6), identical per dealer;
   per-dealer applicability (#7) is evaluated at the Control layer later, not baked into the law.
2. **Seed lives in the migration** (idempotent `on conflict (code) do update`), authored to match
   `REQUIREMENT_CATALOG`; a test guards the two copies against drift.
3. **Backend-only, additive** — no client UI, no file-upload wiring, no scoring cutover this session.
   The questionnaire/JSONB path is untouched and green.
4. **Cross-tenant FK references left at parity** (raw `control_id`/`asset_id`/`policy_id` + forced
   `dealership_id`, no ownership check) — matches slice-1 `risks.create`. No cross-tenant READ leak
   (every read re-scopes by `dealership_id`; refs are never dereferenced to foreign content). The
   composite-FK hardening is a tracked follow-up (below).

## Verified
```
pnpm check → tsc --noEmit: 0 errors
pnpm test  → 14 files, 116 passed (was 100; +16)
pnpm lint  → eslint --max-warnings=0: clean
```
- Three separate reviewer passes (`entity-reviewer`), each walking acceptance criteria with cited
  `path:line`, re-running the gates, and checking scope/non-negotiables. All PASS. This satisfies
  the `/session-review` gate (authoring and review were separate lanes throughout).
- Both-runtime parity verified by reading the Deno copies + grep (equal accessor/procedure/audit
  counts). Deno not tsc/vitest-covered (no `deno` binary) — same constraint as 0001–0003.

## Open threads (→ NextWork)
1. **Apply `0005`/`0006`/`0007` to prod** — ⚠️ `supabase db push` is UNSAFE as-is: the remote
   migration history is timestamped and diverged; the CLI sees numeric `0001–0007` as all-pending
   and would replay `0001–0004` (already applied under timestamped names). Safe path: paste
   `0005/0006/0007` in the Supabase SQL editor (idempotent), then optionally
   `supabase migration repair --status applied 0005 0006 0007`. Reconciling the numeric↔timestamped
   history (repair `0001–0004` or rename files to timestamps) is a separate cleanup.
2. **Create the private `evidence` Storage bucket** (Supabase-managed encryption at rest, same as
   `documents`) — required before `evidence.getUrl` works at runtime.
3. **Composite-FK hardening** — one consolidated migration adding `(dealership_id, <ref>_id) →
   <parent>(dealership_id, id)` on: `risks.control_id`, `tasks.control_id`,
   `evidence_controls.control_id` + `.evidence_id`, `data_flows.source/destination_asset_id`,
   `attestations.policy_id`. (`requirement_id` → global catalog, exempt.) Do before client wiring.
4. **The actual JSONB→Control cutover** — wire `deriveControlsFromAnswers` into the save path and
   move scoring/gaps to read Controls. This is the real "migration off JSONB" and the enabling step
   for #5 citations. Keep the old path green until the new one is proven.
5. **`pnpm db:push`** locally after applying, to sync drizzle-kit generated state.

## After this
**Remediation #5 — Citation-level explainability** (every gap → §314.4 citation + triggering
answer, PRD #19/#62). Now unblocked: `Requirement.citation` is the spine. Naturally pairs with the
JSONB→Control cutover (#4 open thread 4). See NextWork.
