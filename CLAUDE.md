# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Express + Vite dev server on port 3000 (tsx watch)
pnpm check        # TypeScript type check (noEmit, covers client + server + shared)
pnpm test         # Vitest test suite (server/**/*.test.ts)
pnpm test -- --run scoring.test.ts  # Run a single test file
pnpm build        # Vite frontend build + esbuild server bundle → dist/
pnpm start        # Production (node dist/index.js) — dev/self-host only
pnpm format       # Prettier
pnpm db:push      # drizzle-kit generate + migrate (run after schema changes)
pnpm run vercel-build   # Frontend-only static build (used by GitHub Pages deploy)
```

## Architecture

This is a **compliance SaaS app** (FTC Safeguards Rule engine) for automotive dealerships. Monorepo source roots:

```
client/src/            React SPA (Vite, Tailwind, shadcn/radix, wouter)
server/                Express + tRPC backend (LOCAL DEV ONLY — see below)
supabase/functions/    Production API: Deno Edge Functions (trpc, stripe-webhook, handle-signup)
shared/                Code shared by client, server, and edge functions
                       (scoring, safeguards questions, PDF generation, constants)
drizzle/               Schema (source of truth) + migration files
supabase/migrations/   SQL migrations applied to the Supabase Postgres database
```

### Deployment topology (important)

- **Frontend**: GitHub Pages (`.github/workflows/deploy-frontend.yml`), served from
  `https://andrewibrah.github.io/dealerships-compliance`. `VITE_API_URL` points at the Supabase
  Edge Function base URL.
- **API**: Supabase Edge Function `supabase/functions/trpc` serves all tRPC traffic in production.
  The Express server in `server/` is used for local development only.
- **The tRPC router exists in two copies that must stay in sync**:
  `server/routers.ts` (Node, provides the `AppRouter` type the client is compiled against) and
  `supabase/functions/_shared/routers.ts` (Deno, actually runs in production). If you change a
  procedure's input/output in one, change the other. Runtime-neutral logic (scoring, questions,
  PDF generation) lives in `shared/` and is imported by both (Deno resolves bare imports like
  `pdf-lib` via `supabase/functions/import_map.json`).

### API Layer (tRPC)

All client–server communication goes through tRPC. The client (`client/src/lib/trpc.ts` +
`client/src/main.tsx`) attaches the Supabase session access token as a `Bearer` header.
Procedure types in `server/_core/trpc.ts` / `supabase/functions/_shared/trpc.ts`:
`publicProcedure`, `protectedProcedure` (requires `ctx.user`), `adminProcedure`.

Do **not** query business tables (`compliance_answers`, `dealerships`, …) with the browser
Supabase client — RLS is enabled with no policies, and the schema is dealership-keyed, not
user-keyed. The Supabase client in `client/src/lib/supabase.ts` is for **auth only**.

### Auth

Supabase Auth (email/password) on the frontend (`useAuth` in `client/src/hooks/useAuth.ts`).
The backend validates the bearer token with Supabase and upserts the app user row
(`server/_core/context.ts`, `supabase/functions/trpc/index.ts`). `role='admin'` is granted when
the email matches the `ADMIN_EMAIL` env var.

### Database

Drizzle ORM over Supabase Postgres (`postgres-js` with `SUPABASE_DB_URL`; this bypasses RLS).
Schema source of truth: `drizzle/schema.ts`; applied SQL lives in `supabase/migrations/`.
Five tables: `users`, `dealerships`, `complianceAnswers`, `subscriptions`, `generatedDocuments`.
DB helpers: `server/db.ts` (Node) and `supabase/functions/_shared/db.ts` (Deno) — keep in sync.

Key upsert: `complianceAnswers` is unique on `(dealership_id, section)`.

### Compliance flow

Wizard (`client/src/pages/Wizard.tsx`) saves per-section answers via
`trpc.compliance.saveSection` (the backend auto-creates a default dealership on first save).
Dashboard (`client/src/pages/Dashboard.tsx`) loads the same rows via `trpc.compliance.getAnswers`
and recomputes scores/gaps client-side using `shared/scoring.ts` + `shared/safeguards-questions.ts`.

### Documents / PDF

`shared/pdf-generator.ts` (pdf-lib) builds the WISP and board report from saved answers.
`pdf` routers (`server/pdf-router.ts`, `supabase/functions/_shared/pdf-router.ts`) gate generation
on an active paid subscription, upload to the Supabase Storage `documents` bucket, store the
storage key in `generated_documents.storage_path`, and return short-lived signed URLs.

### Stripe

Checkout sessions are created via `trpc.stripe.createCheckoutSession` (Pricing page).
`supabase/functions/stripe-webhook` maintains the `subscriptions` row from subscription events;
checkout must set `subscription_data.metadata` (dealershipId, plan) because the webhook reads
metadata off the Stripe subscription object.

### Environment Variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Supabase project + auth validation |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage uploads / signed URLs |
| `SUPABASE_DB_URL` | Postgres connection (Drizzle) |
| `ADMIN_EMAIL` | Email granted `role='admin'` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe API + webhook signature |
| `STRIPE_CORE_PRICE_ID` / `STRIPE_MANAGED_PRICE_ID` | Stripe Price IDs |
| `OPENAI_API_KEY` | LLM gap narratives (`server/_core/llm.ts`, optional) |
| `RESEND_API_KEY` | Transactional email (optional) |
| `VITE_APP_URL` | Public frontend URL (Stripe redirects) |
| `VITE_API_URL` | Edge function base URL used by the client |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Browser Supabase auth client |

Edge function secrets are set by `.github/workflows/deploy-functions.yml`.
