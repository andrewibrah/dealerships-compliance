# gaps.md — Product vs. PRD Gap Analysis

- **Repo:** `dealerships-compliance` (FTC Safeguards Rule compliance SaaS for franchised auto dealers)
- **Stack detected:** TypeScript monorepo. React 19 + Vite + Tailwind 4 + shadcn/radix + wouter (client); tRPC 11 over Express (local dev) and Supabase Deno Edge Functions (production); Drizzle ORM over Supabase Postgres; Supabase Auth (email/password); Stripe billing; pdf-lib document generation; Vitest tests; GitHub Pages (frontend) + Supabase (API) deploy.
- **Analysis date:** 2026-07-21
- **PRD version:** `prd.md`, uncommitted working copy as of 2026-07-21 (68 numbered requirements, groups A–M, with a flagged "critical path to first paying dealer").
- **Method:** Every status below cites a real `path:line`. Anything not locatable in code is **Missing**, never assumed.

---

## 1. Executive summary

The shipped product is a **single-tenant FTC Safeguards self-assessment questionnaire with deterministic scoring and two generated PDFs (WISP, board report), gated behind Stripe billing.** That is a real, coherent slice of the PRD's Rule-Matcher + Builder + basic Dashboard. What is largely absent is everything that makes it a *compliance system of record*: the core object model, an audit trail, evidence storage, MFA, database-level tenant isolation, citation-level explainability, and the risk-assessment / incident-response artifacts the Rule itself mandates.

| Severity | Count | Themes |
|---|---|---|
| **Critical** | 2 | No append-only audit trail (#34, #51). *(MFA #47 closed — TOTP/AAL2 enforced, see `.claude/tasks/done/0001-mfa-enforcement.md`.)* |
| **High** | 10 | Object model (#3), law-as-data (#5/#6), explainability/citations (#19), risk-assessment & IRP generators (#20/#23), evidence repo (#31), RLS/tenant isolation (#46), remediation tasks (#24), multi-tenant groups (#2) |
| **Medium** | ~24 | Adaptive/LLM interview (#10/#11), posture history (#33), recurrence engine (#35), RBAC views (#42), encryption posture doc (#54), retention/deletion (#56), … |
| **Low** | ~28 | Crosswalks (#8), DMS connectors (#59), SSO (#47-part), white-label (#45), eval harness (#63), observability (#67), separate repos (#65), … |
| **Implemented** | 3 | Scope lock (#1), WISP generator (#21), deterministic rule engine separate from LLM (#49) |

**The single most important structural finding:** the app models compliance as `compliance_answers.answers` JSONB blobs keyed by question id (`drizzle/schema.ts:33-47`). PRD #3 demands a first-class object model (Control, Requirement, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation). Almost every High/Critical gap below (evidence, tasks, audit-linking, citations, risk assessment) is blocked or degraded by the absence of that model.

**Latent/dead code worth knowing:** `invokeLLM` (`server/_core/llm.ts:143`), `generateGapNarrative` (`shared/scoring.ts:141`), and `server/email-service.ts` (Resend) are all defined but **never called/imported** anywhere. There is no live LLM path and no live email/notification path today.

---

## 2. Status table

Status legend: **Implemented** / **Partial** / **Missing** / **Divergent**. Severity reflects the *risk of the gap* (Implemented → "—"). Critical-path items (PRD's own list: #1–6, #10–11, #16–21, #23–24, #30, #31–34, #37–38, #46–47, #54) are marked ★.

### A. Foundation decisions

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 1 ★ | Lock scope to FTC Safeguards × franchised auto dealers | Implemented | `shared/safeguards-questions.ts:1-22`; `shared/pdf-generator.ts:171-182` | None | — | Keep; document the scope lock in CLAUDE.md |
| 2 ★ | Multi-tenant from line one: dealer groups own multiple rooftops; rooftop-scoped, group-aggregatable | Divergent | `drizzle/schema.ts:18-31` (one `user_id` owner + `rooftop_count` int); `server/routers.ts:16-31,46-47` (`getDealershipByUserId`, singular) | No group entity; one dealership per user; `rooftop_count` is a number, not scoped data | High | Introduce `dealer_group` → `rooftop` hierarchy; scope all business rows to rooftop, aggregate to group |
| 3 | Core compliance object model (Control, Requirement, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation) | Missing | `drizzle/schema.ts:1-78` (only users/dealerships/compliance_answers/subscriptions/generated_documents); answers are JSONB (`:40`) | None of the 9 objects exist; compliance state is opaque JSON | High | Model the 9 entities in Drizzle; migrate the questionnaire onto Control/Requirement |
| 4 | Trust boundary: software produces a program, not the auditor/lawyer (drives disclaimers/UI) | Partial | `shared/pdf-generator.ts:265` ("Confidential — for internal, board, auditor, and regulator use"); no "not legal advice" surface in UI | No explicit disclaimer/ToS in the app UI; liability posture implicit | Med | Add a persistent "not legal advice / you remain responsible" disclaimer in UI + generated docs |

### B. Regulatory brain — "law as data"

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 5 ★ | Decompose Safeguards into atomic, individually-testable control requirements | Partial | `shared/safeguards-questions.ts:22-380` (9 sections × 5 yes/no questions, weighted) | Questions ≠ controls; no per-control citation/applicability; coarse (45 Qs for all of §314.4) | High | Re-express as a control catalog: each control = citation + test + weight + applicability |
| 6 ★ | Store regulation as versioned structured data (YAML/JSON) — effective dates, citations, applicability | Missing | `shared/safeguards-questions.ts` is a hardcoded TS array; no dates/citations/versioning | Law is code, not data; cannot update the rule without a redeploy | High | Externalize to versioned content (JSON/YAML) with citations, effective dates, applicability conditions |
| 7 | Applicability engine (<5,000-consumer exemption, systems, data types) | Missing | No applicability logic; all 9 sections always render (`client/src/pages/Wizard.tsx:35-38`) | Every dealer gets every question; exemption ignored | Med | Add applicability rules keyed on dealer profile; filter controls before interview |
| 8 | Crosswalk layer (NIST CSF 2.0 / PCI DSS / CMMC), schema-ready | Missing | none | No crosswalk schema | Low | Defer (v2); reserve a `control_mapping` table when object model lands |
| 9 | Regulatory update pipeline (human-reviewed, re-notify tenants) | Missing | none | No update/notify process | Low | Defer; depends on #6 content versioning |

### C. Interviewer node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 10 ★ | Adaptive questionnaire with branching + skip logic | Missing | `client/src/pages/Wizard.tsx:31-38` iterates all sections/questions by index; no branching | Static linear form; asks irrelevant questions | Med | Add a question graph with skip/branch driven by prior answers + applicability (#7) |
| 11 ★ | Conversational LLM front-end over a structured question graph | Missing | `server/_core/llm.ts:143` (`invokeLLM`) never called; Wizard uses fixed buttons (`Wizard.tsx:13-22`) | No conversational layer | Med | Wire an LLM phrasing layer over the graph; graph guarantees coverage |
| 12 | Evidence-aware questioning (don't ask what an integration can detect) | Missing | no integrations (#59/#60) | Every question asked manually | Low | Defer; depends on connectors |
| 13 | Asset + data-flow discovery | Missing | Section 3 asks yes/no about inventory (`safeguards-questions.ts:103-141`) but stores no assets/flows | No Asset/DataFlow capture | Med | Capture assets + data flows as entities (feeds risk assessment #20) |
| 14 ★ | Multi-stakeholder, multi-session; save/resume everywhere | Partial | Save/resume: `compliance_answers` unique on `(dealership_id, section)` (`schema.ts:46`); `Wizard.tsx:44-52` reloads. But one `user_id` per dealership (`schema.ts:20`) | Save/resume works; no multi-stakeholder (QI vs IT) roles | Med | Add per-rooftop membership + roles so multiple stakeholders answer their sections |
| 15 | Confidence + clarification loop (re-ask low-confidence) | Missing | no LLM/confidence anywhere | None | Low | Defer; depends on #11 |

### D. Rule-Matcher node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 16 ★ | Map answers → applicable controls → gaps, deterministically | Partial | `shared/scoring.ts:47-94` (`calculateSectionScore` derives gaps deterministically) | Deterministic ✓, but "applicable" = all questions (no #7); gap = unanswered/"no" | Med | Keep determinism; add applicability so only in-scope controls are matched |
| 17 ★ | Hybrid: deterministic engine for pass/fail, LLM only for phrasing; never hallucinate status | Partial | `shared/scoring.ts` pure/deterministic; LLM path absent (`llm.ts` unused) | Safety property holds (no hallucination possible); the LLM-phrasing half is absent | Low | Add LLM strictly for narrative, never for status; enforce grounding (#62) |
| 18 ★ | Gap severity scoring (mandatory vs best-practice vs informational) | Partial | `shared/scoring.ts:14-18,71-79` (critical/important/standard; `criticalGaps`) | Maps loosely; not tied to regulatory-mandatory vs best-practice taxonomy/citations | Med | Bind severity to control metadata (mandatory vs recommended) from #6 |
| 19 ★ | Explainability: every gap traces to a specific citation + the triggering answer | Partial | Gaps are bare question text (`scoring.ts:71`); section descriptions name elements but no per-gap §314.4 citation | No citation on gaps; "non-negotiable" per PRD | High | Attach §314.4(x) citation + triggering answer to every gap/finding |
| 20 ★ | Written risk assessment generation — first-class artifact | Missing | `shared/pdf-generator.ts` produces WISP + board report only; Section 2 asks *if* one exists (`safeguards-questions.ts:64-101`) but generates none | The Rule mandates a written risk assessment; product doesn't produce it | High | Add a Risk Assessment generator (assets + threats + vulns → written RA doc) |
| 21 ★ | WISP generator | Implemented | `shared/pdf-generator.ts:173-269` (`generateWISP`); `server/pdf-router.ts:20-36` (paid-gated) | None (quality scales with input completeness) | — | Keep; enrich once object model/citations land |

### E. Builder node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 22 | Policy/procedure generation (access control, encryption, MFA, disposal, change mgmt) | Missing | only WISP + board report exist (`pdf-generator.ts:173,274`) | No per-policy generators | Med | Add templated policy generators from control answers + org specifics |
| 23 ★ | Incident Response Plan generator (§314.4(h)) | Missing | Section 7 asks if an IRP exists (`safeguards-questions.ts:261-300`); no generator | Rule-required artifact not produced | High | Add IRP generator (roles, procedure, 30-day breach-notification timeline) |
| 24 ★ | Remediation roadmap: gaps → prioritized, assigned, dated tasks | Partial | `shared/pdf-generator.ts:156-168` (`remediationPriorities`) prints ordered gaps in PDFs | Ordering exists; no persisted Task entity, no owner/due-date/tracking | High | Persist tasks (owner, due date, status, evidence link) tied to controls |
| 25 | Evidence-request checklist auto-generated per open control | Missing | none | No checklist | Med | Generate per-open-control evidence requests (depends on #3/#31) |
| 26 | Document lifecycle: versioning, draft→review→approve, e-sign, immutable "adopted on" | Partial | `generated_documents.version` defaults 1 (`schema.ts:64`) and is **never incremented** (no `version` write in `server/db.ts`); no approval/e-sign/adopted-on | Static version; no workflow/immutability | Med | Add version bump + draft/review/approve states + adopted-on record |

### F. Teacher node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 27 | Per-control plain-language "why this exists / what breach it prevents" | Partial | `safeguards-questions.ts` optional `hint` fields (e.g. `:34,41,75`) | Hints are terse; not "why/what breach it prevents" | Low | Expand control metadata with a "why it matters" narrative field |
| 28 | Role-based training modules (QI vs front-desk vs F&I) | Missing | none | No training | Low | Defer (post-pilot moat) |
| 29 | Staff attestation/acknowledgment tracking (§314.4(e)) | Missing | no attestation entity (`schema.ts`) | Required evidence type missing | Med | Add Attestation entity + acknowledgment tracking |
| 30 ★ | Signature 10-minute output ("here's your risk, why it matters, here's the fix") | Partial | `client/src/pages/Dashboard.tsx:32-44` (score + section results); WISP remediation section | "Why it matters" narrative is thin; `generateGapNarrative` unused (`scoring.ts:141`) | Med | Deliver a concise risk→why→fix summary view/one-pager |

### G. Librarian node

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 31 ★ | Evidence repository (encrypted object storage) | Missing | Supabase Storage used only for generated PDFs (`server/pdf-router.ts:27`, `server/storage.ts`) | No evidence upload/store | High | Add an evidence bucket + `evidence` entity; user-uploaded artifacts |
| 32 | Evidence-to-control linking (one artifact → many controls) | Missing | none | No linking | Med | Join table evidence↔control (depends on #3/#31) |
| 33 ★ | Continuous posture tracking (state over time) | Missing | scores computed on the fly (`Dashboard.tsx:32-44`, `pdf-generator.ts:55-69`); no history table | No historical snapshots; drift invisible | Med | Snapshot posture over time (score history per control/section) |
| 34 ★ | Append-only audit trail of every change (who/what/when) | Missing | no audit table (`schema.ts`); only `console.error` (`supabase/functions/trpc/index.ts:40`) | **Examiner/litigation-critical record absent** | **Critical** | Add append-only, immutable audit log of all state changes |
| 35 | Recurrence engine (annual RA, pen test, QI board report; auto-scheduled + nagged) | Missing | no scheduler; `server/email-service.ts` (Resend) defined but **never imported** | No recurrences/reminders | Med | Add scheduled recurrences + wire notifications |
| 36 | Audit-ready export ("examiner package" / board report) | Partial | board report PDF (`pdf-generator.ts:274-359`) | Board report ✓; no combined examiner package (docs + evidence + audit trail) | Med | Bundle a one-click examiner package once #31/#34 exist |

### H. UI/UX

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 37 ★ | Onboarding that reaches first artifact fast | Partial | flow: `client/src/App.tsx:22-29` (Home→Signup→Wizard→Dashboard→Documents); dealership auto-created "My Dealership" (`server/routers.ts:20-30`) | No guided onboarding; profile is a stub | Med | Add a guided first-run that reaches a first artifact quickly |
| 38 ★ | Dashboard: posture score, open gaps by severity, tasks, upcoming recurrences | Partial | `client/src/pages/Dashboard.tsx:32-44` (score + section results + gaps) | Score/gaps ✓; no tasks, no recurrences | Med | Add task + recurrence widgets (depends on #24/#35) |
| 39 | Interview UX: chat + inline forms hybrid | Divergent | `Wizard.tsx:13-22` fixed buttons; no chat | Forms only | Low | Add chat lane over forms (depends on #11) |
| 40 | Task board with ownership, due dates, evidence-attach in place | Missing | none | No task board | Med | Build once tasks persist (#24) |
| 41 | Document viewer/editor with approval workflow | Partial | `client/src/pages/Documents.tsx` lists docs + signed URLs (`server/routers.ts:219-258`) | List/download ✓; no editor/approval | Low | Add approval surface (depends on #26) |
| 42 | Role-scoped views (owner / QI / staff / auditor) | Missing | only `user`/`admin` roles (`drizzle/schema.ts:6`); `adminProcedure` defined but unused (`server/_core/trpc.ts:30`) | No compliance-role RBAC | Med | Add owner/QI/staff/auditor roles + scoped views |
| 43 | Notifications + reminders (email/in-app) driven by recurrence | Missing | `server/email-service.ts` never imported; no in-app notifications | No live notifications | Low | Wire email-service to recurrence engine (#35) |
| 44 | Mobile-responsive | Partial | Tailwind responsive utilities throughout; a11y program (`client/src/__a11y__/`) | Not verified on device; assume partial | Low | Verify responsive breakpoints on real devices |
| 45 | White-label / branding | Missing | fixed navy/gold theme (`client/src/App.tsx:37-47`) | No tenant branding | Low | Defer (v2) |

### I. Backend / system architecture

| # | Requirement | Status | Evidence (path:line) | Gap | Sev | Recommended action |
|---|---|---|---|---|---|---|
| 46 ★ | Multi-tenant data layer with hard isolation (RLS or per-tenant schema) | Partial (hardened 2026-07-21) | **App-layer tenant-guard shipped + tested**: single funnel `resolveTenantScope` + branded `ScopedDealershipId` with owner re-check (`shared/tenant-guard.ts`); crown-jewel accessors require a `TenantScope` in both runtimes (`server/db.ts`, `supabase/functions/_shared/db.ts`); A-cannot-read-B regression (`server/tenant-guard.test.ts`). **RLS staged, not yet enabled**: policies + `FORCE RLS` + `current_user_dealership_ids()` in `supabase/migrations/0003_tenant_isolation_rls.sql`; flag-gated authenticated-scoping in `scoped()` behind `RLS_ENFORCED` (default off) | DB-level enforcement is written but not applied/enabled; app-layer isolation is now tested defense-in-depth | High | Apply `0003` + validate on staging + flip `RLS_ENFORCED`, then extend scoping to dealership/subscription paths — see `.claude/tasks/NextWork.md`. Detail: `.claude/tasks/done/0002-tenant-isolation.md` |
| 47 ★ | Auth done right: SSO, enforced MFA, RBAC | Partial | **MFA enforced** (enrolled-only): decision `shared/mfa.ts` (`requiresMfaStepUp`); Node gate `server/_core/trpc.ts:13-30`; Deno gate `supabase/functions/_shared/trpc.ts:10-16`; enroll `client/src/components/MfaEnrollment.tsx`; login step-up `client/src/pages/Login.tsx`. Roles still `user`/`admin` only (`schema.ts:6`) | MFA ✓ (TOTP/AAL2). Remaining: no SSO; no compliance-role RBAC (owner/QI/staff/auditor). Policy is *enrolled-only* (a user who never enrolls isn't gated) | High | SSO + RBAC (#42) next; consider enforce-all MFA if the pilot requires it |
| 48 | LLM orchestration (routing, prompt/version mgmt, tool-calling) | Missing | `server/_core/llm.ts:143` is a single gpt-4o-mini chat wrapper, never called | No orchestration; unused wrapper | Low | Build when the LLM path is actually needed (#11/#30) |
| 49 | Deterministic rule-engine service, separate from LLM | Implemented | `shared/scoring.ts` pure module, isolated from `llm.ts` | Cleanly separated (not a standalone service, but decoupled) | — | Keep the separation as LLM features land |
| 50 | Document-generation service (templating → PDF/DOCX) | Partial | `shared/pdf-generator.ts` (PDF only) | No DOCX; not a discrete service | Low | Add DOCX later; keep in `shared/` |
| 51 | Append-only audit-log service (separate store, tamper-evident) | Missing | none (see #34) | Same as #34, service form | **Critical** | Implement alongside #34 |
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
   regression). DB-layer **RLS staged** (`0003_tenant_isolation_rls.sql` + flag-gated `scoped()`) but
   **not yet applied/enabled** — enable runbook in `.claude/tasks/NextWork.md`. See
   `.claude/tasks/done/0002-tenant-isolation.md`.
3. **Append-only audit trail** (immutable, who/what/when; separate store) — PRD #34/#51 — **Critical** — **L**
   *The examiner/litigation record. Start logging auth + all state-changing mutations now.*
4. **Core compliance object model** (Control, Requirement, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation) — PRD #3 — **High** — **L**
   *Unblocks #19, #20, #23, #24, #25, #29, #31–33. Migrate the questionnaire onto Control/Requirement.*
5. **Citation-level explainability** (every gap → §314.4 citation + triggering answer) — PRD #19/#62 — **High** — **M** *(needs #4/#6)*
6. **Written Risk Assessment generator** (first-class, Rule-mandated artifact) — PRD #20/#13 — **High** — **M**
7. **Incident Response Plan generator** (§314.4(h)) — PRD #23 — **High** — **M**
8. **Persisted remediation tasks** (owner, due date, status, evidence link) + task board — PRD #24/#40 — **High** — **M** *(needs #4)*
9. **Evidence repository + evidence-to-control linking** (encrypted storage) — PRD #31/#32 — **High** — **L** *(needs #4)*
10. **Law-as-data**: externalize the regulation to versioned structured content (citations, effective dates, applicability) — PRD #6/#5 — **High** — **L**
11. **Applicability engine** (<5,000-consumer exemption; systems/data types) — PRD #7 — **Med** — **M** *(needs #10)*
12. **Continuous posture tracking** (historical snapshots, drift) — PRD #33 — **Med** — **M**
13. **Recurrence engine + notifications** (annual RA, pen test, QI board report) — PRD #35/#43 — **Med** — **M** *(email-service.ts scaffold exists, unwired)*
14. **Multi-tenant dealer groups + rooftop scoping/aggregation** — PRD #2 — **High** — **L**
15. **PII retention & deletion policy** (self-serve delete, TTLs, documented encryption posture) — PRD #56/#54 — **Med** — **M**

**Deferred long tail (Low):** RBAC compliance roles (#42), adaptive/LLM interview (#10/#11), policy generators (#22), crosswalks (#8), DMS connectors (#59), auto-evidence (#60), SSO (#47-part), white-label (#45), eval harness (#63), observability (#67), separate content package (#65), DOCX (#50), async queue (#52).

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
