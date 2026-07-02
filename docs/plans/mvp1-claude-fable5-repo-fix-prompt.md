# MVP1 Repo Scan + Claude/Fable 5 Fix Prompt

## Repo scan verdict

This repo is MVP1 for a dealership FTC Safeguards Rule compliance SaaS.

The intended customer workflow is:
1. Dealer signs up/logs in.
2. Dealer completes a 9-section FTC Safeguards assessment.
3. App scores risk/compliance gaps.
4. Dealer upgrades to a paid plan.
5. App generates useful owner/board outputs: WISP PDF, annual board compliance report, gap remediation priorities, document vault.

Current reality:
- The technical spine exists: React/Vite frontend, Supabase auth, tRPC/Express backend, Drizzle/Postgres schema, Stripe routes, PDF generation, Supabase Storage wrapper, test/build scripts.
- But MVP1 is split-brain: parts use direct Supabase client from the browser, parts use tRPC/backend, and the database schema does not match the direct browser queries.
- Customer-facing output is not yet strong enough for a dealership owner to trust or pay for. The dashboard scores answers, but documents/payments/output flows are mostly unwired or thin.

Evidence inspected:
- package.json
- CLAUDE.md
- STATUS.md
- DECISIONS.md
- drizzle/schema.ts
- supabase/migrations/0001_init_schema.sql
- supabase/migrations/0002_auth_trigger.sql
- server/routers.ts
- server/db.ts
- server/pdf-router.ts
- server/pdf-generator.ts
- server/stripe-router.ts
- server/storage.ts
- server/_core/context.ts
- client/src/App.tsx
- client/src/hooks/useAuth.ts
- client/src/lib/supabase.ts
- client/src/lib/trpc.ts
- client/src/pages/Home.tsx
- client/src/pages/Signup.tsx
- client/src/pages/Login.tsx
- client/src/pages/Dashboard.tsx
- client/src/pages/Wizard.tsx
- client/src/pages/Documents.tsx
- client/src/lib/scoring.ts
- client/src/data/safeguards-questions.ts

Verification run:
- `corepack pnpm run check` passed.
- `corepack pnpm run test` passed: 2 test files, 6 tests.
- `corepack pnpm run build` passed, with warnings:
  - `%VITE_ANALYTICS_ENDPOINT%` and `%VITE_ANALYTICS_WEBSITE_ID%` missing in index.html.
  - Huge bundle/chunk warnings; output includes many syntax/language assets and a 1.85 MB app chunk.

Highest-priority defects / optimization targets:
1. Data model mismatch breaks the assessment loop.
   - `client/src/pages/Wizard.tsx` and `client/src/pages/Dashboard.tsx` query/upsert `compliance_answers.user_id` and conflict on `user_id,section`.
   - Actual schema uses `dealership_id, section` with no `user_id` column.
   - This is likely the most important MVP1 correctness bug.

2. Architecture is split between direct Supabase access and tRPC.
   - Auth is Supabase client based, user hydration is tRPC/server based, compliance answers are direct browser Supabase based, PDF/documents are tRPC/backend based.
   - Pick one coherent operating model: preferably Supabase Auth + backend/tRPC for protected business writes and document generation, with frontend using typed tRPC hooks for dealership/compliance/subscription/document workflows.

3. Home route is still scaffold/demo content.
   - `client/src/pages/Home.tsx` renders “Example Page”, spinner, sample markdown, sample button.
   - For MVP1 this must become the public landing page or redirect logic. Right now first impression is not sellable.

4. Document generation is not wired in the customer UI.
   - `client/src/pages/Documents.tsx` hardcodes `hasSubscription=false`, has TODOs for `trpc.pdf.generateWISP`, `trpc.pdf.generateBoardReport`, and uses fake `setTimeout` generation.
   - Backend PDF generation exists but outputs thin PDFs and may store public URLs.

5. RLS is enabled without visible policies.
   - `supabase/migrations/0001_init_schema.sql` enables RLS on all public tables, but no SELECT/INSERT/UPDATE policies appear in inspected migrations.
   - If browser direct Supabase remains, reads/writes can fail. If backend service-role only is chosen, client direct access should be removed for business data.

6. Pricing/Stripe path is incomplete.
   - `client/src/pages/Pricing.tsx` has TODO for checkout.
   - Backend Stripe routes exist, but frontend does not appear to call them.

7. Output value is underbuilt.
   - Current PDFs are generic summaries, not dealership-owner-ready compliance artifacts.
   - The owner wants clear risk, liability, immediate actions, board-ready language, and “what do I do this week?” not just a score.

8. Bundle is bloated.
   - Build includes large Streamdown/mermaid/syntax highlighting assets, likely pulled into the public Home demo or showcase/chat path.
   - MVP1 should reduce initial JS, code-split heavy demo/showcase/chat dependencies, and remove scaffold/demo imports from the landing path.

Recommended MVP1 product identity:
- Old identity: “compliance questionnaire with generic scoring and aspirational document buttons.”
- Better identity: “Dealership owner compliance command center: identify FTC Safeguards gaps, produce board/vendor/auditor-ready evidence, and convert each gap into a prioritized remediation plan.”

---

# Exact prompt to paste into Claude / Fable 5

<role>
You are Fable 5, acting as the world-class senior product engineer, security architect, SaaS founder, and ruthless MVP1 shipper for this codebase.

You are not here to merely lint or beautify. You are here to make this MVP1 technically coherent, owner-useful, and customer-trustworthy for automotive dealerships trying to satisfy the FTC Safeguards Rule.
</role>

<context>
Repository path:
/Users/me/Desktop/partner/11_Codebases/dealerships-compliance

This is a compliance SaaS app for automotive dealerships. The product goal is to help a dealership complete an FTC Safeguards Rule assessment, understand risk/gaps, upgrade to a paid plan, and generate useful owner/board/auditor outputs such as a WISP and annual compliance report.

Stack observed:
- React SPA with Vite, Tailwind, shadcn/radix, wouter.
- Supabase Auth on frontend.
- tRPC/Express backend with protected procedures.
- Drizzle/Postgres schema.
- Supabase migrations/functions also present.
- Stripe routes exist.
- PDF generation exists with pdf-lib.
- Tests/build/check currently pass.

Important inspected files:
- CLAUDE.md
- package.json
- drizzle/schema.ts
- supabase/migrations/0001_init_schema.sql
- supabase/migrations/0002_auth_trigger.sql
- server/routers.ts
- server/db.ts
- server/pdf-router.ts
- server/pdf-generator.ts
- server/stripe-router.ts
- server/storage.ts
- server/_core/context.ts
- client/src/App.tsx
- client/src/hooks/useAuth.ts
- client/src/lib/supabase.ts
- client/src/lib/trpc.ts
- client/src/pages/Home.tsx
- client/src/pages/Signup.tsx
- client/src/pages/Login.tsx
- client/src/pages/Dashboard.tsx
- client/src/pages/Wizard.tsx
- client/src/pages/Documents.tsx
- client/src/pages/Pricing.tsx
- client/src/lib/scoring.ts
- client/src/data/safeguards-questions.ts

Current verification:
- `corepack pnpm run check` passes.
- `corepack pnpm run test` passes: 2 files, 6 tests.
- `corepack pnpm run build` passes, but warns about missing `%VITE_ANALYTICS_ENDPOINT%`, `%VITE_ANALYTICS_WEBSITE_ID%`, and oversized chunks.
</context>

<objective>
Scan the repo deeply, identify the highest-leverage MVP1 fixes, implement the fixes that can be safely completed now, and leave the app in a more coherent, shippable state with tests/check/build passing.

Optimize for three outcomes:
1. Tech/software quality: coherent data flow, fewer split-brain paths, safer auth/data access, maintainable code.
2. Owner output: dashboard and generated documents must tell a dealership owner exactly where risk is, what matters, and what to do next.
3. Customer satisfaction: first impression, signup-to-assessment path, document generation path, and paid value must feel real rather than scaffolded.
</objective>

<constraints>
- Do not commit, push, or rewrite git history.
- Do not read or print secrets from `.env`, `supabase.env`, or credential files.
- Do not make destructive database or deployment changes without explicit approval.
- Do not invent APIs, tables, policies, or imports. Inspect actual files first.
- Keep changes focused on MVP1 coherence and customer value. Avoid broad rewrites unless a narrower fix cannot work.
- Preserve passing `corepack pnpm run check`, `corepack pnpm run test`, and `corepack pnpm run build`.
- Prefer typed tRPC/backend for protected business data unless you deliberately choose and implement a complete Supabase RLS policy path.
- If a choice has real product/security tradeoffs, state the choice and why before implementing the chosen path.
</constraints>

<first_scan_requirements>
Before editing, inspect and understand:
1. Actual schema and migrations.
2. Frontend auth/session flow.
3. tRPC provider/client setup and whether frontend mutations/queries are currently wired.
4. Compliance answer read/write paths.
5. Dashboard scoring path.
6. Document generation frontend and backend paths.
7. Stripe frontend/backend paths.
8. Public landing/home route.
9. Build bundle warning causes.
10. Existing tests and scoring assumptions.

Trace symbols to definitions/usages. Do not guess.
</first_scan_requirements>

<known_high_priority_issues_to_validate>
Validate these suspected issues and fix if confirmed:

1. Compliance answers schema mismatch:
- Frontend `Wizard.tsx` and `Dashboard.tsx` directly query Supabase `compliance_answers.user_id` and upsert with conflict `user_id,section`.
- Actual schema/migration uses `dealership_id` and unique `(dealership_id, section)`.
- This likely breaks saving/loading answers and must be fixed first.

2. Split-brain data access:
- Frontend uses Supabase direct data access for compliance.
- Backend/tRPC already has compliance procedures and dealership creation logic.
- Choose a single clean path and wire the customer flow through it.

3. Home route scaffold:
- `client/src/pages/Home.tsx` still says “Example Page.”
- Replace with a real MVP1 landing page or auth-aware redirect.

4. Documents page fake generation:
- `Documents.tsx` hardcodes `hasSubscription=false`, TODOs PDF mutations, and fake `setTimeout` generation.
- Wire to actual subscription status and PDF generation if backend is ready. If backend storage/payment env is required, handle errors clearly in UI.

5. RLS/policy risk:
- RLS is enabled but inspected migrations show no policies.
- If browser direct Supabase writes are kept, add appropriate policies and tests/docs. If moving to tRPC, remove client business-table writes to avoid RLS mismatch.

6. Output quality:
- `pdf-generator.ts` produces thin generic PDFs.
- Improve generated WISP/board report content using actual answers/scores/gaps where feasible.
- Add owner-facing next actions and priority remediation language.

7. Bundle bloat:
- Build pulls many large language/mermaid/Katex/syntax assets.
- Identify whether scaffold/demo imports such as Streamdown or ComponentShowcase are causing initial bundle bloat. Code-split or remove from MVP landing path if safe.

8. Repo organization / cleanup:
- Identify stale scaffold/demo files, dead routes, duplicate auth hooks, obsolete docs, abandoned migration notes, build artifacts, and confusing parallel systems.
- Clean or quarantine only what is clearly unused and safe. Do not delete useful history or current user work blindly.
- Make the repo easier for the next engineer/model to understand: update docs where they are stale, remove misleading claims, and keep source roots aligned with the chosen architecture.
</known_high_priority_issues_to_validate>

<execution_method>
Work in this order:

1. Baseline:
   - Run `git status --short` only to understand current dirty files; do not lecture about dirty state.
   - Run or inspect `corepack pnpm run check`, `corepack pnpm run test`, and optionally `corepack pnpm run build` if not already done.

2. Repo map:
   - Read actual source files, migrations, hooks, pages, routers, and tests.
   - Build a short mental map of data flow: auth -> user -> dealership -> answers -> scores -> documents -> subscription.

3. Decide the MVP1 spine:
   - Choose whether protected business data goes through tRPC/backend or direct Supabase+RLS.
   - For this repo, prefer tRPC/backend unless there is strong evidence otherwise, because routers already exist and schema is dealership-centric.

4. Implement the minimum coherent fix set:
   - Make assessment save/load work against the actual schema.
   - Make dashboard scores load from the same source as wizard saves.
   - Make customer routes no longer show obvious scaffold/demo surfaces.
   - Wire document generation/subscription status enough to be truthful and usable, or show clear disabled/error states with real reasons.
   - Improve owner-facing output where feasible without overbuilding.

5. Clean and organize the repo:
   - Remove or isolate obvious scaffold/demo surfaces from MVP production paths.
   - Delete dead files only after confirming they are not imported, routed, referenced by config, or needed for deployment.
   - Consolidate duplicate patterns where safe, especially auth/compliance data access hooks.
   - Update stale docs such as STATUS/DECISIONS/CLAUDE notes if they contradict the actual architecture.
   - Keep cleanup surgical: no mass formatting, no broad renames, no dependency churn unless it directly improves MVP1 clarity or build size.

6. Tests:
   - Add or update tests for scoring/data transformation where practical.
   - At minimum, run `corepack pnpm run check`, `corepack pnpm run test`, and `corepack pnpm run build` after changes.

7. Self-review:
   - Inspect your own diff.
   - Check for accidental secret exposure, broken imports, dead TODOs in touched MVP paths, and type holes.
   - If a fix requires production env/database access, leave a precise blocker and do not fake success.
</execution_method>

<quality_bar>
The work is not done until:
- A new user can land on a credible page, sign up/log in, reach the wizard, answer questions, and see dashboard score changes based on the same saved data path.
- The data path matches the schema.
- Obvious scaffold/demo content is removed from primary MVP paths.
- Paid/document outputs are either actually wired or truthfully blocked with clear UI and exact backend/env requirements.
- The owner sees not only a percentage, but priority gaps and next actions.
- The repo is easier to navigate: stale scaffold/demo paths are removed or isolated, misleading docs are corrected, and duplicate/conflicting data-access patterns are reduced.
- `corepack pnpm run check`, `corepack pnpm run test`, and `corepack pnpm run build` pass or any blocker is reported exactly with logs.
</quality_bar>

<deliverables>
Final response must include:
1. One-sentence verdict: what MVP1 is now after your changes.
2. Files changed.
3. Fixes implemented, grouped by customer impact / tech impact / owner-output impact.
4. Commands run and exact pass/fail results.
5. Remaining risks/blockers, especially database/env/deployment issues.
6. Highest-leverage next step.

Do not paste giant code blocks. Give concise engineering receipts.
</deliverables>

<style>
- Sharp, senior, direct.
- No hype.
- No fake certainty.
- Fix real root causes, not symptoms.
</style>
