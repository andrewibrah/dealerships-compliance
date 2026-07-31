# Next Work — handoff for the next session

## Task
**Wave 0 — close out the coordination layer (small, mostly human judgment).** Then **Wave A — the
comms-layer deck** (four verification items, carried over untouched from two sessions ago). Then
**Wave B — Remediation #10, law-as-data**.

Wave 0 first: it is tiny, and it clears a **NEEDS WORK** review verdict on work that is already
live in production.

> **Read `.claude/tasks/done/2026-07-29-1330-coordination-layer.md` before anything else.** It
> carries the strategic reasoning behind the coordination layer, three bugs with root causes, and
> the operator's answers on the authored content. Note that `CurrWork.md` is **stale** — it still
> holds the Supabase comms task that shipped as `3d39a2f`. Promote this file over it.

---

## Wave 0 — close out the coordination layer

### 0.1 Human sign-off on the 45 authored strings — **highest value, blocks the review gate**
`shared/coordination.ts` holds authored `proof` (what artifact closes the gap) and `consequence`
(the regulatory exposure of leaving it open) for all 45 requirements. These now print in
**customer-facing PDFs** — WISP, board report, risk assessment, examiner package — via
`writeGapDetail`.
- The operator already validated owner routing (QI, 22/45), the effort scale, dropping the vendor
  flag, and the enforcement framing. **The prose itself has never been read by a human.**
- Constraint to preserve: consequences cite **the Rule's own text** (what §314.4 makes mandatory,
  what an examiner requests first). **No invented penalty figures, no speculative enforcement
  claims.** `server/coordination.test.ts` enforces that every one of the 45 references the Rule.
- Enforcement framing is scoped to `consequence` lines **only**. The Dashboard banner and landing
  copy stay calibrated — do not let enforcement language leak back into the UI chrome.
- **Acceptance:** a human has read all 45 pairs and corrected what is wrong. This is the §12 move —
  the strings are a first draft of what a real dealership interview would tell you.

### 0.2 Independent review pass
The coordination work was authored and self-reviewed. CLAUDE.md forbids self-approval.
- Dispatch `code-reviewer`/`verifier` in a **separate lane** over `34b4bb5..0b86b62`.
- Focus: the 45 authored strings as compliance-adjacent output, and `writeGapDetail` — it is shared
  by **all seven** generators, which is why `detect_changes` rated it HIGH.

### 0.3 `setState`-during-render in all 8 page guards — ~15 min
Browser-console-confirmed, pre-existing, benign today but it masks real errors.
```
Cannot update a component while rendering a different component → Dashboard / Tasks
```
- Pattern: `if (!isAuthenticated) { setLocation("/login"); return null; }` — a router update during
  render. `client/src/pages/Dashboard.tsx:~207`, `Tasks.tsx:~120`, and 6 more.
- Fix: move each guard into a `useEffect`. **Do not** change the guard's *logic* — branching on
  session rather than on `auth.me` is deliberate (a data 500 must never sign the user out).

### 0.4 Optional: onboarding + success metrics
Both were in the original brief and were **not** delivered — deliberately, per §10 (capability-
building substitutes for market contact). Revisit only if a real operator asks for them.

---

## Wave A — the comms-layer deck (carried over, still untouched)

### A1. Prove a data 500 does not sign the user out
Fixed in code, **never exercised**. `client/src/hooks/useAuth.ts:49` + `SessionDataError.tsx` +
8 page guards.
- **Do:** force `auth.me` to fail; assert the Supabase session survives, no `/login` redirect, and
  `SessionDataError` renders with a working retry.
- **Acceptance:** a test that fails against the old `if (!user)` guard and passes now.
- **Note:** 0.3 touches the same 8 guards. Do A1 *first* or in the same pass, so the test proves the
  refactor did not regress the behaviour.

### A2. Put a number or a test on the batched writes
`upsertDerivedControls` went from up to 45 round-trips to 1; `tasks.deriveFromControls` likewise.
Verified only by types and arithmetic.
- **Do:** a unit test asserting one statement per save (spy the tx), or a timed before/after on a
  real 45-answer save. A number *or* a test — not neither.
- **Watch:** `upsertControls` uses `excluded.*` in ON CONFLICT SET. Confirm a *partial* re-save does
  not clobber untouched controls.

### A3. Independent review of the shared pooled client
Security-sensitive and self-approved. `server/db.ts:70`, `supabase/functions/_shared/db.ts:61`
(`scoped`), `shared/db-options.ts`.
- **Claim to check:** postgres.js reserves a dedicated connection per `transaction()`, and
  `set_config(..., true)` + `set local role` revert at COMMIT/ROLLBACK — so no scoping state
  outlives the transaction or leaks to the next borrower.
- **Do:** a separate reviewer lane; adversarial interleaved-tenant test (`server/tenant-guard.test.ts`
  is the seed, 13 cases). Matters more once `RLS_ENFORCED` is on (#46).

### A4. Close the audit trail (#34/#51) — the last Critical
Authenticated **write** is evidenced in prod. Missing: a **tenant-scoped Data-API read** proving a
tenant sees only its own rows. Then flip #34/#51 in gaps.md and drop Critical 2 → 0.
Detail: `.claude/tasks/done/0003-audit-trail.md`.

---

## Wave B — Remediation #10: law-as-data (PRD #6/#5) — **High**, **L**
Externalize the regulation from TypeScript to versioned structured content: citations, effective
dates, applicability. Today the law is code, so the rule cannot change without a redeploy.

**Constraints that must survive the move:**
- Scoring stays **deterministic and byte-identical**. `server/derivation.test.ts` proves
  `shared/derivation.ts` ≡ `shared/scoring.ts` — that test must still pass.
- The §314.6 exempt set is test-pinned to exactly 12 codes
  (`q1_3,q2_1,q2_2,q2_3,q7_1..q7_5,q9_1,q9_2,q9_3`) — `shared/applicability.ts`.
- Citations are **human-authored, never LLM**. Breach-notification duty is **§314.4(j)**, never
  §314.5 (that is only the effective-date section — a builder got this wrong once already).
- Carry **three** authored per-requirement maps now, not one: `REQUIREMENT_GUIDANCE`
  (`shared/requirements.ts:141`, why/fix) **and** `COORDINATION_BY_CODE`
  (`shared/coordination.ts`, owner/effort/proof/consequence). Both are keyed by requirement code
  and both have completeness + no-orphan tests that will fail loudly if the move drops an entry.

**After this:** #13 recurrence engine, #14 dealer groups. Phase 4 designs (RBAC, onboarding,
recurrence, attestations) are in `.claude/tasks/done/0005-front-facing-phases-1-3.md`.

---

## Cold-start context

Production is **healthy and current**. `main` == `origin/main` at `0b86b62`; both deploys verified
live. 365 tests / 32 files; `check` / `lint` / `build` green.

### The gotcha that will waste your afternoon
**`VITE_API_URL` points at the deployed Supabase Edge Function even in local dev.** The local
Express server (`pnpm dev`) serves the SPA and `/trpc/system.health` — **the SPA's tRPC calls do
not touch it.** So:
- A change to `shared/` used by a *server-side* procedure is **not** exercised by local dev. It runs
  the deployed code until you push.
- "It works in dev" only ever validates client-side rendering. This cost a full misdiagnosis cycle
  last session — see Bug 1 in the done log.

### Other gotchas
- **Watch CI after pushing.** `deploy-frontend.yml` runs `pnpm test`; a failure blocks the Pages
  deploy while `deploy-functions.yml` succeeds independently — leaving the two halves out of sync.
  I shipped on a local green and broke it. Check:
  `curl -s "https://api.github.com/repos/andrewibrah/dealerships-compliance/actions/runs?per_page=4"`
  (`gh` is denied; the public REST API over `curl` works. Logs need auth, but **check-run
  annotations are public** and carry the failing assertion.)
- **Never assume a test's decoder.** `new TextDecoder('windows-1252')` needs full-ICU Node —
  green locally, red on CI. `server/pdf-coordination.test.ts` now uses an explicit CP1252 table.
- **pdf-lib emits HEX strings (`<48656C…> Tj`), not `(literal) Tj`, and encodes WinAnsi, not
  latin1.** A raw byte grep of a PDF finds nothing (streams are Flate-compressed). Reuse `pdfText`
  in `server/pdf-coordination.test.ts` rather than rewriting it.
- **GitNexus incremental `analyze` corrupts its FTS index** (`document for node offset N is missing
  during delete`). Recovery: `gitnexus clean --force && gitnexus analyze` — use the **global**
  binary, because `clean` deletes `.gitnexus/run.cjs` along with the index.
- **`APP_DB_URL`, not `SUPABASE_DB_URL`** for the Edge runtime — the platform injects its own
  reserved value and `supabase secrets set` rejects the `SUPABASE_` prefix.
- **Read `shared/db-options.ts` before touching `max`.** Too low → postgres.js deadlocks against the
  transaction pooler; too high → Supavisor's 200-client cap.
- **Both runtimes stay in sync**: `server/*` ↔ `supabase/functions/_shared/*`. db.ts parity 49/49.
  No `deno` binary locally — mirror exactly and grep parity.
- `pnpm` is not on PATH — use `npx pnpm` or `./node_modules/.bin/pnpm`.
- Migrations are agent-applied and reconciled; `0001`–`0012` recorded, next free number is `0013`.

### Do not "fix" these — they are deliberate
- `Profile.tsx:61`'s cache-wide `utils.invalidate()` is the **logout** path; broad on purpose so the
  next account cannot see the prior tenant's cache. Narrowing it weakens tenant isolation.
- Deep links return **404** on GitHub Pages — accepted, documented in CLAUDE.md. Uptime probes must
  target `/` and `<VITE_API_URL>/trpc/system.health`, never a deep link.
- Per-task `appendAuditLog` calls stay **sequential** — `audit_log` is a SHA-256 chain. Never batch.
- The 30-day horizon bucket is deliberately **effort-dominated**, not urgency-dominated. 23 of 45
  requirements are weight-`critical`; sequencing on urgency put 31 of 45 in month one, which is a
  relabelled gap list, not a plan. A test pins the bucket at ≤18.
- `.claude/game_theory_career_sections/` is **untracked on purpose** — the operator's personal
  strategic thesis, not repo content. It is the spec the coordination layer was built against.

## Carryover (small, unrelated)
1. **4 orphaned `audit_log` rows** reference deleted task ids 1–4. Append-only by design; they
   cannot be removed without breaking the hash chain. Decide whether that is acceptable or whether
   the schema needs a tombstone convention.
2. **Load-test user is permanent in prod** — `loadtest-1785213363@example.com`. Same append-only
   constraint. Banned to 2126.
3. **Fix edge-secret typos** — `STRIPE_SECERT_KEY`, `STRIPE_WEBHOOK_KEY` (dup), `VITE_APP_URP`.
4. **Pin `zod` in the Deno runtime** — `npm:zod` unpinned vs Node's lockfile 3.25.76. This is the
   runtime that actually serves production.
5. **Decide on GitNexus licensing** — `PolyForm-Noncommercial-1.0.0` on a commercial product.
6. **Re-run the whole-branch integrity audit** — still never independently completed.
