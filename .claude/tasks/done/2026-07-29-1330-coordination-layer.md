# 2026-07-29 — Coordination layer: from assessment engine to remediation plan

## Outcome: **SHIPPED to production, review gate NOT passed**

Four commits merged and deployed (`34b4bb5`, `15b2c21`, `2c471a3`, `0b86b62`). All checks green,
both deploys verified live. `/session-review` returned **NEEDS WORK** — not on the code, which is
clean, but because the work was self-authored and one item needs human sign-off. **Do not treat
this session as closed.** See "Open threads".

## Provenance — this task did NOT come from CurrWork.md

`.claude/tasks/CurrWork.md` still holds the *Supabase comms-layer audit*, which shipped last
session as `3d39a2f`. The session-start promotion never ran. Today's work came from a direct
operator prompt: a strategy brief (senior product strategist / behavioural / game-theory framing)
pointing at `.claude/game_theory_career_sections/` — 12 numbered `.txt` files holding the
operator's own strategic thesis for the product. Those files are **untracked on purpose** (personal
career strategy, not repo content) but they are the spec this session was built against.

## Strategic diagnosis (the "why" behind every change)

Read against the 12 sections, the product was strong at what the thesis says is *not* the
bottleneck and absent at what it says *is*:

1. **It was an assessment engine, not a coordination mechanism (§7).** It answered *what is broken*
   and *why it matters*, then stopped. It never said who owns it, what proves it closed, or what
   fits in 30 days. Derived tasks shipped with `owner: ''` — literally unowned.
2. **The UI sold fear (§6, §9).** The Dashboard led with "significant penalties"; the landing page
   led with enforcement. That forfeits the asset §6 names — the ability to say *this is adequate*.
3. **Pricing framed a transaction, not a repeated game (§3)**, and claimed two features the code
   does not have.

## What shipped

| Commit | Change |
|---|---|
| `34b4bb5` | `shared/coordination.ts` — authored coordination metadata for all 45 requirements (accountable owner, effort, proof-of-closure artifact, consequence). `horizonFor()` sequences 30/60/90. Task derivation assigns owner + proof/consequence. `/tasks` → grouped "Remediation Plan". Dashboard: penalty banner → calibrated posture line + "next 30 days" card + posture delta. Home/Pricing repositioned. |
| `15b2c21` | Coordination facts carried into **every generated artifact** via `writeGapDetail` (the single renderer behind all seven PDFs) + `/summary`. |
| `2c471a3` | Operator review applied — vendor field removed entirely; all 45 consequence lines reframed as regulatory exposure. |
| `0b86b62` | CI fix — hermetic PDF text extractor (see Bug 2). |

**Sequencing was calibrated against real data, not assumed.** The first horizon matrix put 31 of 45
items in "next 30 days" because 23 requirements carry the `critical` scoring weight — urgency alone
does not discriminate. Made effort dominate; worst case is now **15 / 23 / 7**. A test pins the
30-day bucket at ≤18.

## Operator review (interactive Q&A, 2026-07-29) — the authored content is now partly validated

| Question | Answer | Action |
|---|---|---|
| Who really owns day-to-day Safeguards work? (22/45 → QI) | **QI is correct** | No change |
| Is "Under a day" realistic for 18 of 45? | **Realistic** | No change |
| Does flagging "Needs DMS vendor" help or excuse delay? | **Drop it** | `VendorParty`, `VENDOR_LABEL`, `participantsLine` deleted — not left dead |
| What actually moves a dealer principal to spend? | **FTC enforcement** | All 45 consequence lines rewritten as regulatory exposure |

**Scope of the enforcement reframe is deliberate and must be preserved:** it applies to the
`consequence` lines **only**. The Dashboard banner and landing copy stay calibrated and
non-alarmist — that was the whole point of removing the penalty banner. Every consequence line
cites the Rule's own text (what §314.4 makes mandatory, what an examiner requests first) with **no
invented penalty figures**; `server/coordination.test.ts` enforces that on all 45.

## Bugs found + root cause

### Bug 1 — derived tasks persisted with empty owner and no proof text (FIXED)
**Symptom:** after the first `Generate tasks from gaps`, all 4 rows had `owner=''` and no
proof/consequence, despite the code being correct and tests green.
**Root cause:** `VITE_API_URL=https://<ref>.supabase.co/functions/v1`. **The SPA's tRPC calls go to
the deployed Supabase Edge Function even in local dev** — the local Express server serves only the
static SPA and `/trpc/system.health`. So task derivation ran the *deployed* (unchanged)
`shared/task-derivation.ts`. Everything that rendered correctly did so because it is computed
client-side in the freshly built bundle.
**This is the single most misleading thing about this repo's local setup.** "It works in dev" says
nothing about any server-side change.
**Fix:** deploy. Verified after: 4 rows, `owner='Qualified Individual'`, proof + consequence present.

### Bug 2 — I broke the GitHub Pages deploy (FIXED)
**Symptom:** `Deploy Frontend` failed on `2c471a3`; production ran a stale frontend ~2 hours. The
edge-function deploy on the same push succeeded, so the two halves were out of sync.
**Root cause:** `server/pdf-coordination.test.ts` decoded WinAnsi via
`new TextDecoder('windows-1252')`, which requires a **full-ICU Node build**. Passed locally
(Node 26, full ICU), failed on CI.
**Process root cause:** I shipped on a local green without watching CI.
**Fix:** explicit 32-entry CP1252 C1 table written as `\u` escapes, with placeholders for the five
undefined slots (`0x81, 0x8D, 0x8F, 0x90, 0x9D`) so indices stay byte-aligned; a test pins the
length at 32.

### Bug 3 — a defect I reported that did not exist (CORRECTED)
I claimed the PDFs rendered "1–2 weeks" as "12 weeks" and nearly rewrote the labels to "fix" it.
**The PDFs were always correct.** My extractor decoded latin1, where `0x96` (WinAnsi en dash) is an
invisible control char. Caught by hex-dumping the actual bytes before changing product code.
**Lesson worth keeping: verify the harness before believing the harness.**

## Verified (evidence, not assertion)

- `pnpm check` / `pnpm lint` (`--max-warnings=0`) / `pnpm build` clean; **365 tests, 32 files**
  (was 283/30 at session start).
- **Rendered PDF text**, not just green assertions — inflated the Flate streams and decoded the
  operands. `writeGapDetail` output confirmed as
  `Accountable: … / Proof of completion: … / Effort: 1–2 weeks · Target: days 31–60`.
- **Browser-driven journey** (agent-browser, local Chrome): login → dashboard → generate → grouped
  plan, against the real production tenant.
- **Both deploys verified live**, not assumed: `Deploy Frontend 0b86b62 success`,
  `Deploy Edge Functions 2c471a3 success`; live bundle grepped — vendor badge absent, coordination
  card present, repositioned hero present.
- **Database-level**, after re-derive: 4 rows, correct owners, `has_proof`/`has_conseq` true, no
  duplicate `control_id`s.

## Production data touched

- Deleted 4 stale `tasks` rows (ids 1–4) inside a transaction, then re-derived → ids 5–8, correct.
  **Necessary because derivation dedupes on `control_id`:** the stale rows would otherwise have
  been permanent, since re-running returns `[]` for controls that already have a task.
- **Better call I did not make:** `tasks.update` exists — patching `owner`/`description` in place
  would have achieved the same end state with no production deletion and no orphaned audit rows.
- **Residue (permanent):** 4 orphaned `audit_log` entries referencing task ids 1–4. `audit_log` is
  append-only with a SHA-256 `prev_hash → row_hash` chain; removing them would break the chain.

## Open threads

1. **The 45 authored `proof`/`consequence` strings need human sign-off** — highest value item.
   They now print in customer-facing PDFs, and the enforcement reframe put regulatory language
   there. Every line cites §314.4 rather than asserting penalties, and a test enforces that, but
   they were written by inference. `shared/coordination.ts`.
2. **Review gate is NEEDS WORK** — self-authored, so this session cannot self-approve.
3. **Onboarding + success metrics** were in the brief and were **not** delivered. Deliberate:
   §10 warns that capability-building substitutes for market contact. Flagged, not silently dropped.
4. **`setState`-during-render in all 8 page guards** — browser-console-confirmed, pre-existing.

## Files changed

`shared/coordination.ts` (new), `shared/task-derivation.ts`, `shared/pdf-generator.ts`,
`client/src/pages/{Dashboard,Tasks,Home,Pricing,Summary}.tsx`,
`server/{coordination,remediation-plan,pdf-coordination}.test.ts` (new),
`server/task-derivation.test.ts`.

**Untouched on purpose:** no auth, tenant-isolation, schema, migration, or router changes. Both
router copies stay in sync because no procedure changed — `shared/` is imported by both runtimes.
