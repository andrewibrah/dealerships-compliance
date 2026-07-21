# 0000 — Bootstrap (2026-07-21)

## Ran
Read `prd.md` in full and parsed it into 68 atomic, individually-testable requirements (groups
A–M). Mapped the codebase with `path:line` evidence: stack, deploy topology, data model, tRPC API
surface (both router copies), auth/RBAC, the FTC Safeguards domain logic (questions, scoring,
PDF generation), migrations/RLS, and the client pages. Assigned every PRD item a status
(Implemented / Partial / Missing / Divergent) backed by a citation. Installed `gaps.md`, rewrote
`CLAUDE.md` as the operating manual, and stood up the self-governing session workflow.

**No application code was modified.** Only artifacts and `.claude/` system files were created.

## Findings (summary)
See **gaps.md** for the full status table + evidence. Counts by severity (gaps only):

- **Critical: 3** — no MFA (#47); no append-only audit trail (#34/#51).
- **High: 10** — object model (#3), law-as-data (#5/#6), citation explainability (#19),
  risk-assessment (#20) & IRP (#23) generators, evidence repo (#31), RLS/tenant isolation (#46),
  remediation tasks (#24), multi-tenant groups (#2).
- **Medium: ~24**, **Low: ~28**, **Implemented: 3** (#1 scope lock, #21 WISP, #49 deterministic
  rule engine separate from LLM).

**Headline:** the shipped product is a single-tenant Safeguards self-assessment with deterministic
scoring and two PDFs (WISP, board report) behind Stripe billing — a real slice of Rule-Matcher +
Builder + Dashboard. Missing is the *system-of-record* layer: the core object model (#3), audit
trail (#34), evidence storage (#31), MFA (#47), DB-level tenant isolation (#46), and the
Rule-mandated risk-assessment (#20) / incident-response (#23) artifacts.

**Latent/dead code:** `invokeLLM` (`server/_core/llm.ts:143`), `generateGapNarrative`
(`shared/scoring.ts:141`), and `server/email-service.ts` (Resend) are all defined but never
called/imported — there is no live LLM path and no live notification path today.

**Out-of-PRD scope found:** the entire Stripe billing subsystem, an unused `admin`/`adminProcedure`
tier, and a substantial accessibility program (`ACCESSIBILITY-AUDIT.md` + `__a11y__` tests + CI
guard) — none of which appear in prd.md. See gaps.md §4.

## Created
- `gaps.md` — gap analysis (status table, prioritized remediation order, out-of-PRD).
- `CLAUDE.md` — AI operating manual (rewritten; see decision below).
- `.claude/tasks/CurrWork.md` — Step 1 spec (MFA enforcement), from remediation #1.
- `.claude/tasks/NextWork.md` — handoff (remediation #2 RLS; #3 audit trail after).
- `.claude/tasks/done/0000-bootstrap.md` — this log.
- `.claude/commands/session-start.md`, `.claude/commands/session-end.md` — the loop's slash commands.

## Key decisions
- **Step 1 = MFA (#47), not the object model or audit trail.** Rationale: it is the only *Critical*
  gap that is fully self-contained (Supabase has native TOTP MFA), demo-blocking per the PRD, and
  dependency-free. The object model (#3) is foundational but an L that many items depend on; audit
  trail (#34) is Critical but benefits from the object model and a separate tamper-evident store.
  MFA delivers the highest risk-reduction per unit effort with zero prerequisites → cleanest first move.
- **Remediation ordered by severity, then dependency**, honoring the compliance ground rule that
  auth / encryption / tenant-isolation / audit-logging outrank cosmetic gaps. MFA → RLS isolation →
  audit trail → object model → citations/artifacts.
- **CLAUDE.md was rewritten, not discarded.** The prior CLAUDE.md was architecture-only. I folded
  all of its still-accurate content (commands, deploy topology, dual-router rule, data model, auth,
  env table) into the new manual's "Stack & architecture" section, then added the source-of-truth,
  non-negotiables, and session-lifecycle sections the template requires. No architectural facts
  were lost; the file is now a superset.
- **Evidence-only statuses.** Anything I could not locate in code is marked Missing (e.g. audit
  trail, evidence repo, MFA), never assumed present.

## Handoff
Step 1 (MFA enforcement) is loaded in `.claude/tasks/CurrWork.md`. Run `/session-start` to begin
implementation. (On the first real session, `/session-start` will promote NextWork.md over
CurrWork.md — since NextWork currently holds remediation #2, either run Step 1 directly from the
current CurrWork now, or accept the promotion to start on #2. If you want to implement Step 1/MFA,
do it before the next `/session-start`, or copy CurrWork's intent forward.)
