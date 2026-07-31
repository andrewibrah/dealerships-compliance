# gaps.md — Product vs. PRD Gap Analysis

- **Repo:** `dealerships-compliance` (FTC Safeguards Rule compliance SaaS for franchised auto dealers)
- **Stack detected:** TypeScript monorepo. React 19 + Vite + Tailwind 4 + shadcn/radix + wouter (client); tRPC 11 over Express (local dev) and Supabase Deno Edge Functions (production); Drizzle ORM over Supabase Postgres; Supabase Auth (email/password); Stripe billing; pdf-lib document generation; Vitest tests; GitHub Pages (frontend) + Supabase (API) deploy.
- **Analysis date:** 2026-07-21 (last updated 2026-07-29 after the coordination-layer session)
- **PRD version:** `prd.md`, uncommitted working copy as of 2026-07-21 (68 numbered requirements, groups A–M, with a flagged "critical path to first paying dealer").
- **Method:** Every status below cites a real `path:line`. Anything not locatable in code is **Missing**, never assumed.

---

## 1. Executive summary

*(Updated 2026-07-27.)* The shipped product is now a **single-tenant FTC Safeguards compliance system of record**: a scope-aware self-assessment (§314.6 exemption honoured) whose answers persist as first-class `Control` rows; deterministic, citation-grounded gap analysis where every finding carries its §314.4 citation + the triggering answer + why-it-matters + the fix; seven generated artifacts (WISP, board report, Written Risk Assessment, Security Architecture Assessment, Incident Response Plan, five policy types, Examiner Package); a remediation task board derived idempotently from open controls; an evidence repository with tenant-scoped uploads and control linking; posture history over time; an append-only audit trail; MFA; and an app-layer tenant guard with RLS live on every table — all gated behind Stripe billing.

What remains is chiefly **structural rather than functional**: the regulation is still TypeScript rather than versioned content (#5/#6), tenancy is single-owner with no dealer-group/rooftop hierarchy (#2) and no compliance-role RBAC (#42), there is no recurrence/notification engine (#35/#43), and data retention/deletion is undefined (#56).

| Severity | Count | Themes |
|---|---|---|
| **Critical** | 2 | Audit trail #34/#51 is deployed with DB enforcement validated. **Advanced 2026-07-28:** a real authenticated production flow wrote and verified an `audit_log` row (login via `createContext`), so the authenticated-**write** half is now evidenced; a tenant-scoped Data-API **read** remains. *(MFA #47 closed — see `.claude/tasks/done/0001-mfa-enforcement.md`.)* |
| **High** | 3 | law-as-data (#5/#6), RLS/tenant isolation (#46 — policies live, flag-gated), multi-tenant groups (#2) |
| **Medium** | ~19 | Recurrence engine (#35/#43), RBAC views (#42), encryption posture doc (#54), retention/deletion (#56), attestation flow (#29), onboarding (#37), … |
| **Low** | ~26 | Crosswalks (#8), DMS connectors (#59), SSO (#47-part), eval harness (#63), observability (#67), separate repos (#65), … |
| **Implemented** | 21 | Scope lock (#1), object model (#3), applicability (#7), adaptive/LLM interview (#10/#11), explainability (#19), risk assessment (#20), WISP (#21), policy generators (#22), IRP (#23), tasks + board (#24/#40), evidence checklist (#25), doc lifecycle (#26), teaching content (#27), signature output (#30), evidence repo + linking (#31/#32), posture history (#33), examiner package (#36), dashboard (#38), interview UX (#39), rule engine (#49), white-label (#45), responsive (#44), trust-boundary disclaimer (#4) |

**The single most important structural finding (now CLOSED, 2026-07-27):** the app modeled compliance as `compliance_answers.answers` JSONB blobs keyed by question id. PRD #3's object model was modeled on 2026-07-22, and the **JSONB→Control cutover is now wired** (`2d09da1`): `compliance.saveSection`/`saveAnswer` upsert derived `Control` rows in both runtimes, and `shared/derivation.ts` — proven byte-equivalent to `shared/scoring.ts` by `server/derivation.test.ts` — is the gap/citation spine. Everything it blocked (citations #19, risk assessment #20, IRP #23, tasks #24, evidence #31/#32, checklist #25, posture #33) shipped in the same session and is merged to `main`.

**Coordination layer (2026-07-29) — out-of-PRD, strategy-driven.** The product answered *what is
broken* and *why it matters* but never *who owns it, what proves it closed, or what fits in 30
days* — derived tasks shipped with `owner: ''`. `shared/coordination.ts` now carries authored
metadata for all 45 requirements (accountable owner role, effort, proof-of-closure artifact,
regulatory consequence) plus a deterministic 30/60/90 sequencer. It reaches the task board, the
Dashboard, `/summary`, **and every generated PDF** via `writeGapDetail` — the single renderer behind
all seven artifacts. The Dashboard's penalty banner was replaced by a calibrated posture statement
(confirmed / open / genuinely unknown), and Home/Pricing were repositioned onto uncertainty
reduction and the reassessment cycle, dropping two claims the code does not support (email
reminders, priority support). Shipped as `34b4bb5`, `15b2c21`, `2c471a3`, `0b86b62`; 365 tests.
**Not PRD-numbered scope** — it deepens #24/#30/#40 rather than closing a new row.
**Review status: NEEDS WORK** — self-authored; the 45 authored `proof`/`consequence` strings now
print in customer-facing PDFs and have not been read by a human. Detail:
`.claude/tasks/done/2026-07-29-1330-coordination-layer.md`.

**Platform/reliability status (2026-07-28).** A full audit + repair of the Supabase↔webapp
communication layer shipped (`3d39a2f`). The production connection leak is fixed: `getDb()`
constructed a Postgres client per call and never released it (~7 leaked per dashboard load), which
exhausted the database at ~9 requests. Both runtimes now share one pooled client via
`shared/db-options.ts` (transaction-mode pooler through **`APP_DB_URL`** — the platform-injected
`SUPABASE_DB_URL` cannot be overridden). Measured on the deployed Edge Function: **0/30 concurrent
calls succeeded before, 240/240 after**, with connection count flat. Also fixed: a data-layer 500 no
longer signs a user out (8 page guards now branch on session, not on `auth.me`), React Query
staleness, and two N+1 write paths (45 sequential round-trips per save → 1). Deep-link 404s on
GitHub Pages were **deliberately accepted** and documented in CLAUDE.md with required uptime-probe
targets. None of this is PRD-numbered scope — it is the platform underneath it. Detail:
`.claude/tasks/done/2026-07-27-1400-supabase-comms-audit.md`.

**Deployment status (2026-07-27):** migrations `0001`–`0012` are applied to the linked Supabase project and reconciled in `supabase_migrations.schema_migrations` (`supabase migration list --linked` shows nothing pending); 17 tables; RLS enabled+forced with a policy on every tenant table; both storage buckets (`documents`, `evidence`) are **private**.

**Latent/dead code worth knowing:** `invokeLLM` (`server/_core/llm.ts:143`), `generateGapNarrative` (`shared/scoring.ts:141`), and `server/email-service.ts` (Resend) are all still defined but **never called/imported**. Note the LLM path is no longer absent — but it deliberately bypasses `_core/llm.ts`: the two display-only surfaces (`shared/interview-phrasing.ts`, `shared/architecture-narrative.ts`) go through `shared/llm-provider.ts` (OpenAI primary, Anthropic fallback, deterministic passthrough with neither). `email-service.ts` remains the seed for the recurrence engine (#35/#43).

---

## 2. Status table

Status legend: **Implemented** / **Partial** / **Missing** / **Divergent**. Severity reflects the *risk of the gap* (Implemented → "—"). Critical-path items (PRD's own list: #1–6, #10–11, #16–21, #23–24, #30, #31–34, #37–38, #46–47, #54) are marked ★.

### A. Foundation decisions

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 1 ★ | Lock scope to FTC Safeguards × franchised auto dealers | Implemented | `shared/safeguards-questions.ts:1-22`; `shared/pdf-generator.ts:171-182` | None | — | Keep; document the scope lock in CLAUDE.md |
| 2 ★ | Multi-tenant from line one: dealer groups own multiple rooftops; rooftop-scoped, group-aggregatable | Divergent | `drizzle/schema.ts:18-31` (one `user_id` owner + `rooftop_count` int); `server/routers.ts:16-31,46-47` (`getDealershipByUserId`, singular) | No group entity; one dealership per user; `rooftop_count` is a number, not scoped data | High | Introduce `dealer_group` → `rooftop` hierarchy; scope all business rows to rooftop, aggregate to group |
| 3 | Core compliance object model (Control, Requirement, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation) | Implemented (2026-07-27) | All 9 entities + `evidence_controls` join in `drizzle/schema.ts`; migrations `0005–0012` APPLIED to prod; JSONB→Control cutover wired in both runtimes (`2d09da1`); `shared/derivation.ts` is the gap/citation spine | None | — | Keep; `shared/scoring.ts` stays the displayed scorer (proven equivalent) |
| 4 | Trust boundary: software produces a program, not the auditor/lawyer (drives disclaimers/UI) | Implemented (2026-07-27) | App-wide `<footer>` (`client/src/components/AppFooter.tsx`) on every page + `ASSESSMENT_DISCLAIMER` embedded top+bottom of every generated PDF (`shared/pdf-generator.ts`) | None | — | Keep; revisit wording with counsel |

### B. Regulatory brain — "law as data"

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 5 ★ | Decompose Safeguards into atomic, individually-testable control requirements | Partial | `shared/requirements.ts` — 45-row `REQUIREMENT_CATALOG` (v2), each with a per-requirement §314.4 citation, weight, and authored why/fix; Controls persisted per requirement | Catalog is derived from the 45 questions and still lives in TS, not versioned content (see #6) | High | Externalize with #6; split any question covering two obligations |
| 6 ★ | Store regulation as versioned structured data (YAML/JSON) — effective dates, citations, applicability | Missing | `shared/safeguards-questions.ts` is a hardcoded TS array; no dates/citations/versioning | Law is code, not data; cannot update the rule without a redeploy | High | Externalize to versioned content (JSON/YAML) with citations, effective dates, applicability conditions |
| 7 | Applicability engine (<5,000-consumer exemption, systems, data types) | Implemented (2026-07-27) | `shared/applicability.ts` encodes §314.6(a) — exempts exactly §314.4(b)(1),(d)(2),(h),(i) (12 codes); opt-in via nullable `dealerships.consumer_count` (migration `0010`); Wizard skips out-of-scope questions | Opt-in only; broader applicability (systems/data types) still open under #6 | Low | Extend once law-as-data (#6) expresses applicability as data |
| 8 | Crosswalk layer (NIST CSF 2.0 / PCI DSS / CMMC), schema-ready | Missing | none | No crosswalk schema | Low | Defer (v2); reserve a `control_mapping` table when object model lands |
| 9 | Regulatory update pipeline (human-reviewed, re-notify tenants) | Missing | none | No update/notify process | Low | Defer; depends on #6 content versioning |

### C. Interviewer node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 10 ★ | Adaptive questionnaire with branching + skip logic | Implemented (2026-07-27) | `client/src/pages/Wizard.tsx` skips applicability-excluded questions with a visible "§314.6 does not apply" affordance; radiogroup a11y preserved | Skips are applicability-driven; no answer-conditional branching yet | Low | Add answer-conditional branches only where the Rule warrants |
| 11 ★ | Conversational LLM front-end over a structured question graph | Implemented (2026-07-27) | `interview.rephrase` (both runtimes) → `shared/interview-phrasing.ts` via `shared/llm-provider.ts` (OpenAI primary). DISPLAY-ONLY: returns `{ text }` only, passthrough without a key, untrusted context delimiter-wrapped | Structured buttons remain the only state writers (by design) | — | Keep the guardrail; never let the model set a value |
| 12 | Evidence-aware questioning (don't ask what an integration can detect) | Missing | no integrations (#59/#60) | Every question asked manually | Low | Defer; depends on connectors |
| 13 | Asset + data-flow discovery | Partial | `assets` + `data_flows` entities (migration `0007`) + tenant-scoped CRUD both runtimes; consumed by the Risk Assessment + Security Architecture generators | Entities + consumers exist; still no dedicated capture UI | Med | Build the asset/data-flow capture UX |
| 14 ★ | Multi-stakeholder, multi-session; save/resume everywhere | Partial | Save/resume: `compliance_answers` unique on `(dealership_id, section)` (`schema.ts:46`); `Wizard.tsx:44-52` reloads. But one `user_id` per dealership (`schema.ts:20`) | Save/resume works; no multi-stakeholder (QI vs IT) roles | Med | Add per-rooftop membership + roles so multiple stakeholders answer their sections |
| 15 | Confidence + clarification loop (re-ask low-confidence) | Missing | no LLM/confidence anywhere | None | Low | Defer; depends on #11 |

### D. Rule-Matcher node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 16 ★ | Map answers → applicable controls → gaps, deterministically | Implemented (2026-07-27) | `shared/derivation.ts` (proven ≡ `scoring.ts` in `server/derivation.test.ts`) over the applicability-filtered catalog; Controls upserted on save in both runtimes | None | — | Keep deterministic |
| 17 ★ | Hybrid: deterministic engine for pass/fail, LLM only for phrasing; never hallucinate status | Partial | `shared/scoring.ts` pure/deterministic; LLM path absent (`llm.ts` unused) | Safety property holds (no hallucination possible); the LLM-phrasing half is absent | Low | Add LLM strictly for narrative, never for status; enforce grounding (#62) |
| 18 ★ | Gap severity scoring (mandatory vs best-practice vs informational) | Partial | `shared/scoring.ts:14-18` weights + `criticalGaps`; each gap now carries its own §314.4 citation via `shared/derivation.ts` | Severity is weight-derived, still not a mandatory/recommended taxonomy from the rule text | Med | Bind severity to control metadata from #6 |
| 19 ★ | Explainability: every gap traces to a specific citation + the triggering answer | Implemented (2026-07-27) | Every gap on the Dashboard, `/summary`, WISP, board report and Examiner Package renders §314.4 citation + triggering answer + why-it-matters + fix (`shared/derivation.ts`, `REQUIREMENT_GUIDANCE`, `writeGapDetail`) | None — no gap renders as bare question text anywhere | — | Keep; citations are human-authored, never LLM |
| 20 ★ | Written risk assessment generation — first-class artifact | Implemented (2026-07-27) | `generateRiskAssessment` (`shared/pdf-generator.ts`) + `pdf.generateRiskAssessment` both runtimes, paid-gated, disclaimer embedded; driven by Risk/Asset/DataFlow + answers | Quality scales with entity capture (#13) | — | Enrich as the asset/data-flow UX lands |
| 21 ★ | WISP generator | Implemented | `shared/pdf-generator.ts:173-269` (`generateWISP`); `server/pdf-router.ts:20-36` (paid-gated) | None (quality scales with input completeness) | — | Keep; enrich once object model/citations land |

### E. Builder node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 22 | Policy/procedure generation (access control, encryption, MFA, disposal, change mgmt) | Implemented (2026-07-27) | `shared/policy-templates.ts` (`POLICY_DEFINITIONS`) + `generatePolicy` (`shared/pdf-generator.ts`) + `pdf.generatePolicy` both runtimes; creates a draft `policies` row + PDF; cites (c)(1)/(c)(3)/(c)(5)/(c)(6)/(c)(7) | Posture is honest — no/partial/unanswered never render as "in place" | — | Add more policy types as needed |
| 23 ★ | Incident Response Plan generator (§314.4(h)) | Implemented (2026-07-27) | `shared/incident-response.ts` covers all seven §314.4(h) elements + the FTC breach-notification duty at **§314.4(j)** (≥500 consumers, 30 days); `pdf.generateIncidentResponsePlan` both runtimes, paid-gated | None | — | Keep; §314.5 is only the effective-date section — never cite it for the duty |
| 24 ★ | Remediation roadmap: gaps → prioritized, assigned, dated tasks | Implemented (2026-07-27; **coordination layer added 2026-07-29**) | `shared/task-derivation.ts` (open control → task, priority from weight, **idempotent** on `controlId`) + `tasks.deriveFromControls` both runtimes, audited. `shared/coordination.ts` now supplies an accountable owner role (never `owner: ''`), an effort estimate, the artifact that proves closure, and the regulatory consequence of delay; `horizonFor()` sequences work into 30/60/90 (effort-dominated — worst case 15/23/7) | None | — | Keep; wire evidence-attach in place next |
| 25 | Evidence-request checklist auto-generated per open control | Implemented (2026-07-27) | `shared/evidence-checklist.ts` — one grounded request per open control (citation + `REQUIREMENT_GUIDANCE.fix`), applicability-aware; rendered on `/evidence` | None | — | Keep |
| 26 | Document lifecycle: versioning, draft→review→approve, e-sign, immutable "adopted on" | Implemented (2026-07-27) | `shared/policy-lifecycle.ts` state machine (draft→in_review→approved→adopted, archived from any non-adopted; adopted terminal) + `policies.transition` both runtimes, audited; `adoptedAt` set-once and unreachable via `create`/`update` (`.strict()`, `server/policy-guard.test.ts`); `/policies` viewer | No e-signature | Low | Add e-sign if a pilot requires it |

### F. Teacher node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 27 | Per-control plain-language "why this exists / what breach it prevents" | Implemented (2026-07-27) | `REQUIREMENT_GUIDANCE` (`shared/requirements.ts:141`) — authored `whyItMatters` + `fix` for all 45; surfaced on Dashboard gaps, `/summary`, `/architecture`, `/evidence` checklist, and in PDFs | None (authored content, never LLM) | — | Keep |
| 28 | Role-based training modules (QI vs front-desk vs F&I) | Missing | none | No training | Low | Defer (post-pilot moat) |
| 29 | Staff attestation/acknowledgment tracking (§314.4(e)) | Partial | `attestations` entity + audited CRUD both runtimes (`server/routers.ts:930-1000`) | Entity + CRUD exist; still **zero client UI** (send → attest → record) | Med | Build the collection flow — design in NextWork Phase 4.4 |
| 30 ★ | Signature 10-minute output ("here's your risk, why it matters, here's the fix") | Implemented (2026-07-27; **extended 2026-07-29**) | `/summary` one-pager (`client/src/pages/Summary.tsx`) — top gaps as risk → why → fix → **who is accountable → what proves it closed → effort/target horizon**, printable; same grounded spine as the Dashboard | None | — | Keep |

### G. Librarian node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 31 ★ | Evidence repository (encrypted object storage) | Implemented (2026-07-27) | Private `evidence` bucket created; `evidence.getUploadUrl` mints a **server-derived** scoped key `evidence/<dealershipId>/<uuid>-<sanitized>` (path-traversal tested); `/evidence` upload + download via signed URLs; `evidence.create` rejects a path outside the tenant prefix | None | — | Keep; Supabase-managed encryption at rest |
| 32 | Evidence-to-control linking (one artifact → many controls) | Implemented (2026-07-27) | `evidence_controls` join + `evidence.linkControl`/`listForControl`, surfaced per open control on `/evidence`; composite `(dealership_id, control_id)` FK added in migration `0008` | None | — | Keep |
| 33 ★ | Continuous posture tracking (state over time) | Implemented (2026-07-27) | `posture_snapshots` (migration `0011`, RLS in-migration) written on save in both runtimes with a dedup rule (only when the overall score changes), audited; Dashboard sparkline (`role="img"` + aria-label) | None | — | Keep |
| 34 ★ | Append-only audit trail of every change (who/what/when) | Partial (deployed 2026-07-21; write-path evidenced 2026-07-28) | `audit_log` (`drizzle/schema.ts`) + remote migration `20260721172940_audit_log`; append-only triggers + SHA-256 chain validated transactionally as `service_role`; all three Edge Functions deployed; `shared/audit.ts` unit-tested | Authenticated **write** verified in prod 2026-07-28 (login audit row confirmed by query); tenant-scoped Data-API **read** still unverified | **Critical** | Run an authenticated mutation/read smoke test, then close — see `.claude/tasks/done/0003-audit-trail.md` |
| 35 | Recurrence engine (annual RA, pen test, QI board report; auto-scheduled + nagged) | Missing | no scheduler; `server/email-service.ts` (Resend) defined but **never imported** | No recurrences/reminders | Med | Add scheduled recurrences + wire notifications |
| 36 | Audit-ready export ("examiner package" / board report) | Implemented (2026-07-27) | `generateExaminerPackage` — cover + posture + document manifest + evidence index + a **real** audit-trail extract (`listAuditLog`, select-only, dealership-filtered; unit-tested for no fabrication); paid-gated both runtimes | Single PDF rather than a zip bundle (deliberate — no new dependency) | — | Add a zip bundle only if an examiner asks |

### H. UI/UX

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 37 ★ | Onboarding that reaches first artifact fast | Partial | flow: `client/src/App.tsx:22-29` (Home→Signup→Wizard→Dashboard→Documents); dealership auto-created "My Dealership" (`server/routers.ts:20-30`) | No guided onboarding; profile is a stub | Med | Add a guided first-run that reaches a first artifact quickly |
| 38 ★ | Dashboard: posture score, open gaps by severity, tasks, upcoming recurrences | Implemented (2026-07-27) | `client/src/pages/Dashboard.tsx` — score card, section grid, grounded priority gaps, open-task widget, posture trend, nav to summary/architecture/evidence | Upcoming recurrences still missing (depends on #35) | Med | Add the recurrence widget with #35 |
| 39 | Interview UX: chat + inline forms hybrid | Implemented (2026-07-27) | Optional conversational mode in `client/src/pages/Wizard.tsx` displaying LLM-rephrased question text; structured radiogroup/forms remain the ONLY state writers; degrades to plain forms without a key | None | — | Keep the guardrail |
| 40 | Task board with ownership, due dates, evidence-attach in place | Implemented (2026-07-27; **re-shaped 2026-07-29**) | `client/src/pages/Tasks.tsx` — now a **Remediation Plan** grouped into 30/60/90-day horizons + Closed, each row carrying the accountable role, effort badge, proof-of-closure and consequence; inline status/owner/due edit retained | Evidence-attach from the task row not yet wired (evidence links to controls) | Low | Surface control-linked evidence on the task row |
| 41 | Document viewer/editor with approval workflow | Implemented (2026-07-27) | `client/src/pages/Policies.tsx` shows status/version/adoptedAt with lifecycle actions via `policies.transition`; `/documents` lists + signs generated PDFs | No in-app editor (content is generated) | Low | Add editing only if dealers ask |
| 42 | Role-scoped views (owner / QI / staff / auditor) | Missing | only `user`/`admin` roles (`drizzle/schema.ts:6`); `adminProcedure` defined but unused (`server/_core/trpc.ts:30`) | No compliance-role RBAC | Med | Add owner/QI/staff/auditor roles + scoped views |
| 43 | Notifications + reminders (email/in-app) driven by recurrence | Missing | `server/email-service.ts` never imported; no in-app notifications | No live notifications | Low | Wire email-service to recurrence engine (#35) |
| 44 | Mobile-responsive | Implemented (2026-07-27) | 375px pass: `flex-wrap` + gap on the Dashboard header container AND its 5-button action row, plus Tasks/Documents/Policies/Summary/Evidence headers and the Wizard radiogroup | Verified by class audit, not on a physical device | Low | Spot-check on a real handset |
| 45 | White-label / branding | Implemented (2026-07-27) | Nullable `dealerships.logo_url` (migration `0012`, no default) + labelled `type=url` Profile field + Dashboard header brand; degrades to name-only. Scheme pinned to http(s) server-side in both runtimes (`logoUrlSchema`, `server/logo-url-guard.test.ts`) | Logo is client-rendered only — never fetched into PDFs (deliberate) | — | Add full theming only if a dealer group asks |

### I. Backend / system architecture

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 46 ★ | Multi-tenant data layer with hard isolation (RLS or per-tenant schema) | Partial (hardened 2026-07-21) | **App-layer tenant-guard shipped + tested**: single funnel `resolveTenantScope` + branded `ScopedDealershipId` with owner re-check (`shared/tenant-guard.ts`); crown-jewel accessors require a `TenantScope` in both runtimes (`server/db.ts`, `supabase/functions/_shared/db.ts`); A-cannot-read-B regression (`server/tenant-guard.test.ts`). **RLS applied** as remote migration `20260721172935_tenant_isolation_rls`; flag-gated authenticated-scoping remains behind `RLS_ENFORCED` (default off) | Policies are live, but application role-switch enforcement remains off pending authenticated staging validation | High | Validate two authenticated tenants on staging, then flip `RLS_ENFORCED`; extend scoping to dealership/subscription paths. Detail: `.claude/tasks/done/0002-tenant-isolation.md` |
| 47 ★ | Auth done right: SSO, enforced MFA, RBAC | Partial | **MFA enforced** (enrolled-only): decision `shared/mfa.ts` (`requiresMfaStepUp`); Node gate `server/_core/trpc.ts:13-30`; Deno gate `supabase/functions/_shared/trpc.ts:10-16`; enroll `client/src/components/MfaEnrollment.tsx`; login step-up `client/src/pages/Login.tsx`. Roles still `user`/`admin` only (`schema.ts:6`) | MFA ✓ (TOTP/AAL2). Remaining: no SSO; no compliance-role RBAC (owner/QI/staff/auditor). Policy is *enrolled-only* (a user who never enrolls isn't gated) | High | SSO + RBAC (#42) next; consider enforce-all MFA if the pilot requires it |
| 48 | LLM orchestration (routing, prompt/version mgmt, tool-calling) | Missing | `server/_core/llm.ts:143` is a single gpt-4o-mini chat wrapper, never called | No orchestration; unused wrapper | Low | Build when the LLM path is actually needed (#11/#30) |
| 49 | Deterministic rule-engine service, separate from LLM | Implemented | `shared/scoring.ts` pure module, isolated from `llm.ts` | Cleanly separated (not a standalone service, but decoupled) | — | Keep the separation as LLM features land |
| 50 | Document-generation service (templating → PDF/DOCX) | Partial | `shared/pdf-generator.ts` (PDF only) | No DOCX; not a discrete service | Low | Add DOCX later; keep in `shared/` |
| 51 | Append-only audit-log service (separate store, tamper-evident) | Partial (deployed 2026-07-21) | DB-enforced append-only blocks UPDATE/DELETE/TRUNCATE as `service_role`; two-row SHA-256 `prev_hash→row_hash` chain validated and rolled back cleanly; Edge Functions active | Authenticated production write verified 2026-07-28; the tenant-scoped read half remains | **Critical** | Complete the authenticated smoke test (see #34) |
| 52 | Async job/queue for long-running agent tasks | Missing | all synchronous (`supabase/functions/trpc/index.ts`) | No queue | Low | Defer until generation/sync is long-running |
| 53 | Integration connectors behind a stable internal API | Missing | none | No connector layer | Low | Defer (depends on #59/#60) |

### J. Security of the product itself

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 54 ★ | Encryption at rest + in transit, everywhere | Partial | Supabase-managed at-rest + TLS (platform default); signed URLs 1h TTL (`server/pdf-router.ts:68`, `server/storage.ts`); no app-level field encryption | Relies on platform defaults; undocumented; no field-level encryption of sensitive answers | Med | Document the encryption posture; assess field-level encryption for sensitive NPI |
| 55 | Dogfood own SOC 2 | Missing | none | No SOC 2 program | Low | Defer (post-pilot) |
| 56 | PII handling, data-retention, deletion policy | Missing | `ON DELETE CASCADE` FKs exist (`migrations/0001:21,37`) but no retention/deletion policy or user-facing deletion | No lifecycle policy | Med | Define retention + deletion (self-serve delete, TTLs) |
| 57 | Secrets mgmt, dependency/vuln scanning, secure SDLC | Partial | secrets via env + Actions (`.github/workflows/deploy-functions.yml`); CI gates lint/typecheck/tests (commit `8e294ec`) | No dependency/vuln scanning in CI | Low | Add dependency + vuln scanning to CI |
| 58 | Prompt-injection defense (treat tenant content as untrusted) | Missing | no LLM ingestion of tenant docs today | Not yet applicable; will be with #11/#31 | Low | Add when tenant content flows into the LLM |

### K. Integrations

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 59 | DMS connectors (CDK, Reynolds & Reynolds, Dealertrack) | Missing | `dms_vendor` is free text (`drizzle/schema.ts:25`) | No connectors | Low | Defer (post-pilot differentiator) |
| 60 | Evidence auto-collection (IdP / MDM / email security) | Missing | none | No auto-evidence | Low | Defer |
| 61 | Vendor/service-provider oversight module (§314.4(f)) | Partial | Section 6 vendor questions (`safeguards-questions.ts:222-259`) | Questions ✓; no vendor registry/oversight module | Low | Add a vendor registry + oversight tracking |

### L. AI reliability + guardrails

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 62 | Grounding + citation enforcement (no ungrounded generation) | Partial | no generative compliance path (safe by omission); but gaps carry no citations (#19) | Citations absent; enforcement not yet needed | Med | Enforce grounding once LLM lands; deliver citations via #19 |
| 63 | Eval harness (dealer profiles → expected gaps) | Missing | unit tests for scoring/PDF only (`server/scoring.test.ts`, `server/pdf-generator.test.ts`) | No profile-based eval set | Low | Add an eval harness before touching prompts |
| 64 | Confidence thresholds → human-in-the-loop escalation | Missing | none | No HITL | Low | Defer (depends on #11) |

### M. Code structure / engineering

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 65 | Separate, independently-versioned repos/packages (regulatory-content, rule-engine, agent-orchestration, web-app, doc-gen) | Divergent | single monorepo; `shared/` bundles scoring + questions + pdf | Content not independently versioned (blocks #6/#9) | Low | At minimum, isolate regulatory content as a versioned package |
| 66 | Test strategy split by layer (unit 100% rule engine, eval LLM, integration connectors) | Partial | Vitest unit tests (`server/scoring.test.ts`, `pdf-generator.test.ts`, `auth.logout.test.ts`, `client/src/__a11y__/*`) | Rule-engine unit tests exist (not verified 100%); no eval/integration layers | Low | Assert 100% rule-engine coverage; add eval + integration tiers |
| 67 | Observability (structured logging, tracing, per-tenant LLM cost/latency) | Missing | `console.error` only (`supabase/functions/trpc/index.ts:40`) | No structured logging/tracing/cost | Low | Add structured logging + tracing; per-tenant cost when LLM lands |
| 68 | CI/CD, IaC, env separation, feature flags | Partial | `.github/workflows/deploy-frontend.yml`, `deploy-functions.yml`; CI gates (commit `8e294ec`) | No IaC, no feature flags, single environment | Low | Add staging env + feature flags; consider IaC |

---

## 3. Prioritized remediation order

Sequenced by **severity first, dependency second** (compliance ground rule: auth, encryption, tenant isolation, audit-logging, and data-integrity outrank cosmetic gaps). Effort tags: **S** ≤ ~½ day · **M** ~1–3 days · **L** ~1–2 weeks. Item #1 is realized as `.claude/tasks/CurrWork.md`.

1. ~~**Enforce MFA (TOTP / AAL2)** on auth + protected procedures — PRD #47 — **Critical** — **M**~~
   ✅ **Done (2026-07-21)** — enrolled-only TOTP enforcement in both runtimes; enrollment + login
   step-up UI. See `.claude/tasks/done/0001-mfa-enforcement.md`. Remaining #47 sub-gaps: SSO, RBAC.
2. **Tenant isolation, defense-in-depth** — PRD #46 — **High** — **M** — 🟡 **In progress (2026-07-21)**
   App-layer **tenant-guard shipped + tested** (`resolveTenantScope` funnel + branded scope + A≠B
   regression). DB-layer **RLS applied** (remote migration `20260721172935_tenant_isolation_rls`),
   while flag-gated `scoped()` remains disabled pending authenticated staging validation. See
   `.claude/tasks/done/0002-tenant-isolation.md`.
3. **Append-only audit trail** (immutable, who/what/when; separate store) — PRD #34/#51 — **Critical** — **L** — 🟡 **Deployed (2026-07-21), pending authenticated smoke test**
   Append-only enforced by triggers (not RLS — `service_role` is BYPASSRLS) + SHA-256 hash chain;
   every mutation + auth event logged in both runtimes. DB triggers/hash chain and Edge deployment
   are live; an authenticated user-flow/Data-API smoke test remains. See `.claude/tasks/done/0003-audit-trail.md`.
4. ~~**Core compliance object model** (Control, Requirement, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation) — PRD #3 — **High** — **L**~~
   ✅ **Modeled (2026-07-22)** — all 9 entities + `evidence_controls` join across `drizzle/schema.ts`,
   migrations `0005–0007`, both runtimes, audited, RLS. Branch `feat/prd3-object-model` (`db546a9`).
   Remaining tail (→ next): JSONB→Control **cutover** (wire `deriveControlsFromAnswers` + move scoring),
   apply `0005–0007` to prod, create the `evidence` bucket, composite-FK hardening. See
   `.claude/tasks/done/0004-object-model.md`. *(Unblocks #19, #20, #23, #24, #25, #29, #31–33.)*
5. ~~**Citation-level explainability** (every gap → §314.4 citation + triggering answer) — PRD #19/#62~~
   ✅ **Done (2026-07-27)** — `2d09da1`/`e4bc047`.
6. ~~**Written Risk Assessment generator** — PRD #20/#13~~ ✅ **Done (2026-07-27)** — `a788c5a`.
7. ~~**Incident Response Plan generator** (§314.4(h)) — PRD #23~~ ✅ **Done (2026-07-27)** — `f9e8635`
   (breach duty cites **§314.4(j)**; a review caught an initial §314.5 error).
8. ~~**Persisted remediation tasks** + task board — PRD #24/#40~~ ✅ **Done (2026-07-27)** — `a9b39ec`.
9. ~~**Evidence repository + evidence-to-control linking** — PRD #31/#32~~ ✅ **Done (2026-07-27)** — `b4c377b`.
10. **Law-as-data**: externalize the regulation to versioned structured content (citations, effective
    dates, applicability) — PRD #6/#5 — **High** — **L** ← **NEXT** (see `.claude/tasks/NextWork.md`)
11. ~~**Applicability engine** (<5,000-consumer exemption) — PRD #7~~ ✅ **Done (2026-07-27)** — `faf18c5`;
    §314.6(a) exempt set is opt-in and test-pinned to 12 codes.
12. ~~**Continuous posture tracking** — PRD #33~~ ✅ **Done (2026-07-27)** — `104ead5`.
13. **Recurrence engine + notifications** (annual RA, pen test, QI board report) — PRD #35/#43 — **Med** — **M** *(`server/email-service.ts` scaffold still unwired; design in NextWork Phase 4.3)*
14. **Multi-tenant dealer groups + rooftop scoping/aggregation** — PRD #2 — **High** — **L** *(sequence with RBAC #42 — both reshape tenancy)*
15. **PII retention & deletion policy** (self-serve delete, TTLs, documented encryption posture) — PRD #56/#54 — **Med** — **M**
16. **Attestation collection flow** — PRD #29 — **Med** — **S** *(entity + audited CRUD already shipped; UI only — design in NextWork Phase 4.4)*

**Deferred long tail (Low):** RBAC compliance roles (#42), guided onboarding (#37), crosswalks (#8), DMS connectors (#59), auto-evidence (#60), SSO (#47-part), eval harness (#63), observability (#67), separate content package (#65), DOCX (#50), async queue (#52), training modules (#28), vendor registry (#61).

---

## 4. Out-of-PRD (undocumented scope found in code)

Present in the codebase but **not** in prd.md's 68 items:

- **Stripe billing subsystem** — `subscriptions` table (`drizzle/schema.ts:49-58`), `server/stripe-router.ts`, `supabase/functions/stripe-webhook/index.ts`, `client/src/pages/Pricing.tsx`, and paid-gating of PDF generation (`server/pdf-router.ts:7-16`). A whole revenue/monetization layer the PRD never mentions. Business-critical; should be reflected back into the PRD.
- **`admin` role + `adminProcedure`** — `drizzle/schema.ts:6`, `server/_core/trpc.ts:30-45`. Defined but **used by zero procedures** (grep). The PRD's RBAC (#42) describes owner/QI/staff/auditor, not admin.
- **Accessibility program** — `ACCESSIBILITY-AUDIT.md`, `client/src/__a11y__/*.test.tsx`, and an `eslint-plugin-jsx-a11y` CI regression guard (commit `0a21b2f`). Substantial, valuable, and entirely outside the PRD.
- **Dead / unwired scaffolding** (defined, never called — decide keep vs delete):
  - `server/_core/llm.ts` (`invokeLLM`, gpt-4o-mini wrapper) — never invoked.
  - `shared/scoring.ts:141` (`generateGapNarrative`) — never imported.
  - `server/email-service.ts` (Resend welcome/reminder/renewal templates) — never imported.
- **Two hand-maintained tRPC router copies** — `server/routers.ts` (Node, type source) and `supabase/functions/_shared/routers.ts` (Deno, runtime). Must be kept in sync manually; a divergence risk not captured as a PRD requirement.
- **`system.health` endpoint** (`supabase/functions/_shared/routers.ts:205-207`) — ops utility, not in PRD.
- **Board Report generator** (`shared/pdf-generator.ts:274`) — closest to PRD #36; useful, effectively an early slice of the "board report" export.

---

*Cross-links: this file is the live delta referenced by [CLAUDE.md](CLAUDE.md) and seeds `.claude/tasks/CurrWork.md`. Source of truth for intended scope is [prd.md](prd.md).*
