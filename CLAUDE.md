# Dealerships Compliance Engine — AI Operating Manual

## What this is
A compliance SaaS web app that operationalizes the **FTC Safeguards Rule (16 CFR Part 314)** for
franchised automotive dealerships. Today it delivers a weighted self-assessment across the 9
Safeguards elements, deterministic gap scoring, and two generated PDFs (WISP + board report),
gated behind Stripe billing. It serves the dealership's **Qualified Individual** and owners who
must produce and maintain a written information security program.

## Source of truth
- **prd.md** — intended scope (68 numbered requirements, groups A–M, with a flagged "critical path
  to first paying dealer"). If code and PRD disagree, **PRD wins** unless a `.claude/tasks/done/`
  log records a deliberate, justified deviation.
- **gaps.md** — the current delta between the shipped product and the PRD (status table +
  prioritized remediation order + out-of-PRD scope). Re-read it at the start of every session.

## Stack & architecture

**Detected stack:** TypeScript monorepo — React 19 + Vite + Tailwind 4 + shadcn/radix + wouter
(client); tRPC 11 (Express locally, Supabase Deno Edge Functions in prod); Drizzle ORM over
Supabase Postgres; Supabase Auth (email/password); Stripe; pdf-lib; Vitest.

**Commands:**
```bash
pnpm dev          # Express + Vite dev server on port 3000 (tsx watch)
pnpm check        # TypeScript type check (noEmit; client + server + shared)
pnpm test         # Vitest suite (server/**/*.test.ts, client/src/__a11y__/**)
pnpm test -- --run scoring.test.ts   # single test file
pnpm build        # Vite frontend build + esbuild server bundle → dist/
pnpm lint         # eslint client/src --max-warnings=0 (jsx-a11y guard)
pnpm format       # Prettier
pnpm db:push      # drizzle-kit generate + migrate (run after schema changes)
pnpm run vercel-build   # frontend-only static build (GitHub Pages deploy)
```

**Source roots:**
```
client/src/            React SPA (Vite, Tailwind, shadcn/radix, wouter)
server/                Express + tRPC backend — LOCAL DEV ONLY
supabase/functions/    Production API: Deno Edge Functions (trpc, stripe-webhook, handle-signup)
shared/                Runtime-neutral code shared by client, server, edge (scoring, questions, PDF, const)
drizzle/               Schema (source of truth) + generated migration
supabase/migrations/   SQL applied to Supabase Postgres
```

**Deployment topology (important):**
- **Frontend** → GitHub Pages (`.github/workflows/deploy-frontend.yml`), served from
  `https://andrewibrah.github.io/dealerships-compliance`. `VITE_API_URL` points at the Edge Function base.
- **API** → Supabase Edge Function `supabase/functions/trpc` serves all tRPC traffic in prod;
  the Express server in `server/` is local dev only.
- **Database connections go through `APP_DB_URL`, not `SUPABASE_DB_URL`.** The Edge platform
  injects its own reserved `SUPABASE_DB_URL` and the CLI refuses to override any `SUPABASE_`-prefixed
  secret, so `APP_DB_URL` is the override both runtimes read first. It must point at the Supavisor
  **transaction-mode** pooler (port **6543**). Connection options are centralized in
  `shared/db-options.ts` — read the measurements in that file before changing `max`: too low
  deadlocks postgres.js against the pooler, too high exhausts Supavisor's 200-client ceiling.
- **Deep links return HTTP 404 — accepted, deliberate (2026-07-27).** GitHub Pages has no SPA
  rewrite, so `/dashboard`, `/login`, `/evidence`, `/signup` all return a **404 status**; the
  `client/public/404.html` shim boots the SPA so browsers behave correctly, but crawlers, uptime
  monitors and link previews see the 404. Only `/` and `/index.html` return 200.
  **Uptime monitoring must therefore probe `/` (frontend) and
  `<VITE_API_URL>/trpc/system.health` (API) — never a deep link.** Revisit only if SEO or link
  previews start mattering; the fix is moving the frontend to a host with SPA rewrites.
- **The tRPC router exists in two copies that must stay in sync:** `server/routers.ts` (Node, the
  `AppRouter` type the client compiles against) and `supabase/functions/_shared/routers.ts` (Deno,
  what actually runs). Change a procedure in one → change it in the other. Runtime-neutral logic
  lives in `shared/` and is imported by both (Deno resolves bare imports via
  `supabase/functions/import_map.json`). DB helpers likewise doubled: `server/db.ts` /
  `supabase/functions/_shared/db.ts`.

**Data model** (`drizzle/schema.ts`) — five tables: `users`, `dealerships`, `complianceAnswers`
(JSONB `answers` keyed by question id; unique on `(dealership_id, section)`), `subscriptions`,
`generatedDocuments`. Drizzle connects via `SUPABASE_DB_URL` with the service role, which
**bypasses RLS**. RLS is enabled on all tables with **no policies** — tenant isolation is currently
enforced only at the application layer (every query filters through `getDealershipByUserId`).

**Auth** — Supabase Auth (email/password) on the client (`client/src/hooks/useAuth.ts`). The
backend validates the bearer token and upserts the app user row (`server/_core/context.ts`,
`supabase/functions/trpc/index.ts`). `role='admin'` is granted when the email matches `ADMIN_EMAIL`.
Procedure tiers in `server/_core/trpc.ts`: `publicProcedure`, `protectedProcedure` (requires
`ctx.user`), `adminProcedure` (defined, currently unused). **No MFA today.**

**Compliance flow** — Wizard (`client/src/pages/Wizard.tsx`) saves per-section answers via
`trpc.compliance.saveSection` (backend auto-creates a default dealership on first save). Dashboard
(`client/src/pages/Dashboard.tsx`) recomputes scores/gaps client-side from `shared/scoring.ts` +
`shared/safeguards-questions.ts`. PDFs (`shared/pdf-generator.ts`) build the WISP and board report
from saved answers; `server/pdf-router.ts` gates generation on an active paid subscription and
serves short-lived signed URLs from the Supabase Storage `documents` bucket.

**Do not** query business tables with the browser Supabase client — the browser client is
**auth-only** (`client/src/lib/supabase.ts`); all business data flows through tRPC.

**Env vars:** `SUPABASE_URL` / `SUPABASE_ANON_KEY` (auth), `SUPABASE_SERVICE_ROLE_KEY` (storage),
`APP_DB_URL` (the database URL both runtimes actually use — transaction-mode pooler, port 6543;
set as an edge secret because `SUPABASE_`-prefixed names are reserved), `SUPABASE_DB_URL` (fallback,
and what `psql`/Drizzle use locally), `ADMIN_EMAIL`, `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` /
`STRIPE_CORE_PRICE_ID` / `STRIPE_MANAGED_PRICE_ID`, `OPENAI_API_KEY` (powers the two display-only
LLM surfaces via `shared/llm-provider.ts`; `ANTHROPIC_API_KEY` is an optional alternative — with
neither, both surfaces pass through to deterministic text), `RESEND_API_KEY`
(unused today), `VITE_APP_URL`, `VITE_API_URL`, `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
Edge secrets are set by `.github/workflows/deploy-functions.yml`.

**Also on disk:** `STATUS.md` (phase log), `DECISIONS.md` (decision log; early Manus/MySQL entries
are superseded), `ACCESSIBILITY-AUDIT.md` (a11y program).

## Conventions (inferred from the codebase, not invented)
- **TypeScript everywhere**, ES modules (`"type": "module"`), path aliases `@/*` (client) and
  `@shared/*`. Two-space indent; Prettier + ESLint (`--max-warnings=0`, jsx-a11y guard).
- **All client↔server traffic is tRPC.** Add a procedure by editing **both** router copies and (if
  the logic is runtime-neutral) putting it in `shared/`. Keep `server/db.ts` and the Deno `db.ts` in sync.
- **Compliance status is deterministic.** Scoring lives in pure functions in `shared/scoring.ts`.
  Never route pass/fail through an LLM.
- **Schema changes** go in `drizzle/schema.ts` (source of truth), then `pnpm db:push`; add the SQL
  under `supabase/migrations/` for the deployed database.
- **Migrations are applied directly by the agent** — the Supabase CLI and `psql` are available and
  the project is linked (`SUPABASE_DB_URL` / `SUPABASE_ACCESS_TOKEN` in `.env`). Apply a migration
  with `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql`, then record
  it in `supabase_migrations.schema_migrations`. Author every migration **idempotently**
  (`if not exists` / guarded `do $$`) so a re-run is a no-op. The old "human-applies-via-SQL-editor,
  never `supabase db push`" rule is **retired**: the numeric↔timestamped history divergence was
  reconciled on 2026-07-25, `0001`–`0012` are all recorded, and `supabase migration list --linked`
  shows local and remote in sync with nothing pending.
- **Tests** are Vitest: `server/*.test.ts` for domain logic, `client/src/__a11y__/*` for accessibility.
- Match the surrounding file's style; make surgical changes tied to the active task.

## Non-negotiables
- This is a **compliance product.** Never weaken auth, encryption, tenant isolation, or
  audit-logging to make something easier.
- Every compliance claim in generated output must trace to code or PRD (a §314.4 citation or a
  saved answer) — no ungrounded generation in the compliance path.
- **No unrequested scope.** Work only the current task in `.claude/tasks/CurrWork.md`.
- Application code changes happen **only after** the user confirms the restated task (see lifecycle).

## Session lifecycle (self-governing loop)
Operated by `/session-start`, `/session-review`, and `/session-end`.

**ON SESSION START**
1. Read CLAUDE.md, prd.md, gaps.md, and the latest 1–2 logs in `.claude/tasks/done/`.
2. Promote the handoff: copy `.claude/tasks/NextWork.md` over `.claude/tasks/CurrWork.md`. The
   handoff becomes the active task.
3. Restate the task + acceptance criteria to the user and wait for go-ahead before touching app code.

**WHILE WORKING**
- Execute ONLY what CurrWork.md specifies.
- Continuously append actions, decisions, files changed, and any bug + root cause to today's log:
  `.claude/tasks/done/<YYYY-MM-DD-HHMM>-<slug>.md`.

**BEFORE SESSION END (review gate)**
- Run `/session-review`: a separate review pass that walks CurrWork.md's acceptance criteria with
  cited evidence, runs `pnpm check` / `pnpm test` / `pnpm lint`, checks the diff for scope creep and
  for any weakening of the non-negotiables, and returns **PASS** or a **NEEDS WORK** punch list.
  Authoring and review are separate passes — don't self-approve. Only proceed to session end on PASS.

**ON SESSION END**
1. Finalize today's `done/` log: outcome, what shipped, what's verified, open threads, bugs + root cause.
2. Author a fresh `.claude/tasks/NextWork.md`: next task, cold-start context, relevant files,
   gotchas, and what comes after.
3. Update gaps.md status for anything closed.

**Bootstrap exception:** the first run had no NextWork.md to promote — it authored CurrWork.md and
NextWork.md directly. See `.claude/tasks/done/0000-bootstrap.md`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dealerships-compliance** (1736 symbols, 4659 relationships, 139 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/dealerships-compliance/context` | Codebase overview, check index freshness |
| `gitnexus://repo/dealerships-compliance/clusters` | All functional areas |
| `gitnexus://repo/dealerships-compliance/processes` | All execution flows |
| `gitnexus://repo/dealerships-compliance/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
