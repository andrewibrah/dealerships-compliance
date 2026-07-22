# Next Work — handoff for the next session

## Carryover from #4 (operational — do first; needs a human + live infra)
Remediation #4 (object model) is **code-complete, committed, and pushed**: branch
`feat/prd3-object-model` (`db546a9`), all 9 PRD #3 entities + the `evidence_controls` join, both
runtimes, migrations `0005–0007`, 116 tests green. NOT merged to main; migrations NOT applied. Full
detail: `.claude/tasks/done/0004-object-model.md`.
1. **Apply `0005`/`0006`/`0007` to prod — NOT via `supabase db push`.** `supabase migration list`
   shows the remote history is timestamped and diverged; the CLI sees numeric `0001–0007` as all
   pending and would replay `0001–0004` (already live under timestamped names). Safe path: paste
   `0005/0006/0007` into the Supabase SQL editor (all idempotent), then optionally
   `supabase migration repair --status applied 0005 0006 0007`. (Reconciling the numeric↔timestamped
   history — repair `0001–0004` or rename files to timestamps — is a separate cleanup.)
2. **Create the private `evidence` Storage bucket** (same posture as `documents`) — needed before
   `evidence.getUrl` works at runtime.
3. **Merge `feat/prd3-object-model` → main** (opens the edge auto-deploy) once 1–2 are done, so the
   new procedures have their tables. No client calls them yet (backend-only), so there's no rush/breakage.
4. **`pnpm db:push`** locally to sync drizzle-kit generated state after applying.
5. **Composite-FK hardening** (one small migration `0008`): add `(dealership_id, <ref>_id) →
   <parent>(dealership_id, id)` on `risks.control_id`, `tasks.control_id`,
   `evidence_controls.control_id` + `.evidence_id`, `data_flows.source/destination_asset_id`,
   `attestations.policy_id`. (`requirement_id` → global catalog, exempt.) No live leak today; do it
   before these links get client wiring.

---

## Task
**Remediation #5 — Citation-level explainability, on top of the JSONB→Control cutover.** Every gap
must trace to a specific **§314.4 citation + the triggering answer** (PRD #19 — "non-negotiable" per
PRD — and #62 grounding). PRD #19/#62 — **High**. This rests on #4's `Requirement.citation` spine and
naturally pairs with finishing the migration the object model only *began*.

## Cold-start context
- **The enabling half is the cutover.** #4 modeled the entities but the questionnaire still writes/reads
  `compliance_answers.answers` JSONB; `shared/controls.ts` (`deriveControlsFromAnswers`) exists but is
  **not wired** into the save path or scoring. Do the cutover first, then hang citations off it:
  1. On `compliance.saveSection`/`saveAnswer`, ALSO upsert derived `Control` rows (status per
     Requirement) via `upsertControl` — additively, behind the existing JSONB write.
  2. Move gap derivation to read `Control` + its `Requirement` (which carries `citation`, `weight`,
     `section`), keeping `shared/scoring.ts` deterministic and its tests green.
- **Then explainability (#19):** every gap/finding surfaces `§314.4(x)` (from `Requirement.citation`)
  + the triggering answer (the Control's status + the answer that set it). Surface in the Dashboard
  gap list and the WISP/board PDFs (`shared/pdf-generator.ts`).
- **Citations are coarse today** — `Requirement.citation` is section-level (see `shared/requirements.ts`
  `CITATION_BY_SECTION`). #5 is the moment to refine to per-requirement subsections where they differ
  (e.g. §314.4(c)(1) access controls vs (c)(5) MFA within "Access Controls"). Keep it grounded — cite
  the Rule, never generate a citation via LLM (compliance non-negotiable).

## Design sketch (decide + log the choice in the `done/` log)
- **No new tables likely** — this is wiring + refinement over #4's schema. If per-requirement citations
  need more structure, extend `Requirement` (a nullable `subsection`/richer `citation`) via a small
  migration `0009` (confirm next free number; remember the numeric↔timestamped caveat above).
- **Keep the old JSONB path green** until the Control-derived path is proven — this is a migration,
  not a rewrite. Tests: `server/scoring.test.ts`, `server/controls.test.ts`.
- **Deterministic** end-to-end: status + gap + citation are all data-derived. No LLM in the path.

## Relevant files
- `shared/controls.ts` (`deriveControlsFromAnswers` — wire this in), `server/db.ts` +
  `supabase/functions/_shared/db.ts` (`upsertControl`, `listControls`), both router copies
  (`compliance.saveSection`/`saveAnswer`).
- `shared/scoring.ts` (deterministic gap derivation — the thing to migrate onto Controls) + its test.
- `shared/requirements.ts` (`REQUIREMENT_CATALOG`, `CITATION_BY_SECTION` — refine per-requirement) +
  `server/requirements-seed.test.ts` / `server/requirements.test.ts` (update if the catalog changes;
  the seed drift-guard fails if `0005`'s seed and the catalog diverge).
- `shared/pdf-generator.ts`, `client/src/pages/Dashboard.tsx` (surface the citation + triggering answer).
- `.claude/tasks/done/0004-object-model.md` — the entities/accessors you build on.

## Watch out for
- **Don't break scoring or the Wizard.** Keep JSONB authoritative until Control-derived scoring passes
  the same tests. The Wizard writes JSONB; the cutover is additive first, swap second.
- **Both runtimes / two copies** stay in sync (schema, both `db.ts`, both routers, audit actions).
- **RLS**: any new/changed table keeps `enable`+`force` + a tenant (or read-all for global) policy in
  the same migration — a FORCE-RLS table with no policy denies all authenticated access.
- **No `deno` / no live DB locally** → verify Edge by mirroring + grep parity; verify migrations on a
  branch/SQL-editor apply, not `db push` (see carryover #1).
- **Citation accuracy is a compliance claim** — every §314.4 citation must be correct and grounded.

## After this
**Remediation #6 — Written Risk Assessment generator** (PRD #20/#13) — now unblocked: the `Risk`,
`Asset`, and `DataFlow` entities exist to drive it. Then #7 IRP generator (§314.4(h)), #8 task board
on the `Task` entity.
