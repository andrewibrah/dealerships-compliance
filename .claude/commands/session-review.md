Run the SESSION REVIEW protocol — a verification gate to run AFTER the work and BEFORE
`/session-end`. This is a review pass, not an authoring pass: **report findings, do not fix them
here.** If the review fails, hand the punch list back so the fix is a deliberate next step.

1. **Re-read the spec.** Load `.claude/tasks/CurrWork.md` and walk its **Acceptance criteria**
   one by one. For each, mark ✅ met / ❌ not met / ⚠️ partial, and cite the `path:line` (or the
   command output) that proves it. No criterion is "done" on assertion alone — cite evidence.

2. **Run the objective checks** and paste the real output:
   - `pnpm check` (types), `pnpm test` (suite), `pnpm lint` (jsx-a11y guard).
   - If any fail, the review **fails** — capture the failure verbatim.

3. **Scope check (surgical-changes rule).** Review `git diff` (and `git status`). Every changed
   line must trace to CurrWork's objective. Flag anything in the **Out of scope** list, drive-by
   refactors, or edits to files the task never named.

4. **Compliance non-negotiables** (from CLAUDE.md) — verify the change did NOT weaken any of these,
   and flag any that apply to this task:
   - Auth / encryption / tenant isolation / audit-logging not weakened.
   - Every compliance claim in generated output traces to code or a §314.4 citation or a saved answer.
   - Compliance status stays deterministic (no pass/fail routed through an LLM).
   - If a tRPC procedure changed: **both** router copies (`server/routers.ts` +
     `supabase/functions/_shared/routers.ts`) and **both** `db.ts` copies stay in sync, and **both**
     runtimes (Express + Deno) enforce identically.

5. **Correctness/security review of the diff.** Skim for the usual defects (unhandled errors,
   auth/RBAC gaps, cross-tenant leaks, secrets in code). For a security-sensitive change (auth,
   isolation, audit), recommend a separate reviewer/verifier pass rather than self-approving.

6. **Verdict.** Output one of:
   - **PASS** — all acceptance criteria met, checks green, scope clean → proceed to `/session-end`.
   - **NEEDS WORK** — a numbered punch list of exactly what's missing, each with the file to touch.

Show me the criteria table, the check output, and the verdict. Do not modify code in this pass.
