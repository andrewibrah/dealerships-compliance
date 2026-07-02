# dealerships Compliance Engine - Decisions Log

> **SUPERSEDED (2026):** The Manus scaffold decisions below (Manus OAuth, Manus built-in
> LLM, MySQL/TiDB) no longer reflect the shipped stack. Production runs on Supabase Auth +
> Supabase Postgres + Stripe, deployed via GitHub Pages (frontend) and Supabase Edge
> Functions (API). Entries retained for historical context.

## [2026-04-14] - Phase 1 - Project Initialization
**Decision: Use tRPC + Express backend template**
- Context: CLAUDE.md specifies React 18 + Vite frontend with Supabase backend. Manus provides a web-db-user template with tRPC, Express, and Manus OAuth.
- Choice: Leverage the provided template (tRPC + Express + Drizzle ORM + Manus Auth) instead of manual Supabase integration.
- Alternatives considered: Raw Supabase client library, custom REST API.
- Tradeoff: tRPC provides end-to-end type safety and automatic client generation. Supabase auth will be replaced with Manus OAuth (built-in).

## [2026-04-14] - Phase 1 - Database Provider
**Decision: Use MySQL (via Drizzle ORM) instead of Supabase PostgreSQL**
- Context: Template uses Drizzle ORM with MySQL/TiDB. CLAUDE.md specified Supabase (PostgreSQL).
- Choice: Stick with template's MySQL + Drizzle for consistency with provided scaffolding.
- Alternatives considered: Migrate to Supabase PostgreSQL.
- Tradeoff: MySQL is fully supported by template. Schema migration is simpler with Drizzle. Supabase would require custom client setup.

## [2026-04-14] - Phase 1 - Design Direction
**Decision: Professional, trust-focused design with dark accent colors**
- Context: No specific style provided. Product targets auto dealerships (B2B, regulatory).
- Choice: Dark navy/slate background with gold/amber accents for trust and professionalism. Clean typography, minimal visual clutter.
- Alternatives considered: Blue corporate, green compliance, red urgency.
- Tradeoff: Dark theme reduces eye strain for long compliance sessions. Gold accents signal premium/compliance expertise.

## [2026-04-14] - Phase 1 - Component Library
**Decision: Use shadcn/ui + Tailwind CSS 4**
- Context: Template includes shadcn/ui and Tailwind 4. CLAUDE.md specifies Tailwind CSS.
- Choice: Full shadcn/ui for form inputs, dialogs, cards. Tailwind 4 for layout and custom styling.
- Alternatives considered: Headless UI only, custom components.
- Tradeoff: shadcn/ui provides accessibility and consistency out of the box. Reduces custom CSS.

## [2026-04-14] - Phase 1 - Routing Strategy
**Decision: Flat route structure with wouter (lightweight router)**
- Context: Template uses wouter. CLAUDE.md specifies React Router.
- Choice: Use wouter for simplicity. Routes: /, /signup, /login, /dashboard, /wizard, /documents, /pricing, /landing.
- Alternatives considered: React Router DOM, Next.js.
- Tradeoff: wouter is lighter and sufficient for this app. React Router would add bundle size.

## [2026-04-14] - Phase 1 - PDF Generation
**Decision: Use pdf-lib (client-side) for WISP and board report generation**
- Context: CLAUDE.md specifies pdf-lib. Template does not include it.
- Choice: Install pdf-lib. Generate PDFs client-side after dealer completes wizard.
- Alternatives considered: Server-side PDF generation (pdfkit), cloud service (PDFShift).
- Tradeoff: Client-side keeps server load low. pdf-lib has good documentation and is lightweight.

## [2026-04-14] - Phase 1 - Email Service
**Decision: Use Resend for transactional email**
- Context: CLAUDE.md specifies Resend. No email service in template.
- Choice: Install Resend SDK. Create email templates for welcome, compliance reminder, annual renewal.
- Alternatives considered: SendGrid, AWS SES, Mailgun.
- Tradeoff: Resend has good React integration and free tier. Requires API key in environment.

## [2026-04-14] - Phase 1 - Payment Processing
**Decision: Use Stripe for $199/month subscription**
- Context: CLAUDE.md specifies Stripe. Template does not include it.
- Choice: Install Stripe SDK. Create one product with $199/month pricing. Implement webhook for subscription events.
- Alternatives considered: Paddle, LemonSqueezy, custom billing.
- Tradeoff: Stripe is industry standard. Requires webhook setup and environment keys.

## [2026-04-14] - Phase 1 - LLM Integration for Gap Narratives
**Decision: Use Anthropic Claude API for gap analysis narratives**
- Context: CLAUDE.md specifies Anthropic Claude API for gap narrative generation.
- Choice: Use Manus built-in LLM (which uses Claude). Call from server-side tRPC procedure.
- Alternatives considered: OpenAI, local LLM.
- Tradeoff: Manus LLM is pre-configured. No additional API key needed.

## [2026-04-14] - Phase 1 - Compliance Scoring Algorithm
**Decision: Weighted scoring with critical/important/standard weights**
- Context: CLAUDE.md specifies: critical (3pts), important (2pts), standard (1pt). Sections 4,5,7 are 1.5x weighted (highest FTC enforcement).
- Choice: Implement scoring.js with calculateSectionScore() and calculateOverallScore() functions.
- Alternatives considered: Simple average, custom weights per section.
- Tradeoff: Weighted scoring reflects FTC enforcement priorities. More complex but more accurate.

## [2026-04-14] - Phase 1 - 9 FTC Safeguards Sections
**Decision: Map all 9 sections to wizard steps**
- Context: CLAUDE.md specifies 9 sections from 16 CFR Part 314.
- Choice: Step0=Profile, Step1-9=Sections 1-9. Each section has 5-10 questions.
- Alternatives considered: Combine sections, reduce questions.
- Tradeoff: Full coverage ensures compliance. Longer wizard but more thorough.

## [2026-04-14] - Phase 1 - Database Schema
**Decision: Create tables for dealerships, compliance_answers, generated_documents, subscriptions**
- Context: Need to store dealer profiles, answers per section, generated PDFs, subscription status.
- Choice: Extend Drizzle schema with dealerships, compliance_answers, generated_documents, subscriptions tables.
- Alternatives considered: Flat structure, NoSQL.
- Tradeoff: Normalized schema is more maintainable. Queries are efficient.

## [2026-04-14] - Phase 1 - Authentication
**Decision: Use Manus OAuth (built-in) instead of Supabase Auth**
- Context: Template includes Manus OAuth. CLAUDE.md specified generic auth.
- Choice: Use Manus OAuth for login/signup. No additional setup needed.
- Alternatives considered: Supabase Auth, Auth0.
- Tradeoff: Manus OAuth is pre-configured. Simpler than alternatives.

## [2026-07-01] - MVP1 Coherence Pass
**Decision: Single data spine through tRPC; browser Supabase client is auth-only**
- Context: Wizard/Dashboard queried `compliance_answers.user_id` directly from the browser — a column that does not exist (schema keys on `dealership_id`), and RLS is enabled with no policies, so those calls could never work.
- Choice: All business data flows through tRPC (`compliance.saveSection` / `getAnswers`), which already existed on both the Express dev server and the production Supabase Edge Function. Client Supabase SDK is used only for auth/session.
- Alternatives considered: Writing RLS policies and keeping direct browser access.
- Tradeoff: tRPC keeps end-to-end types and one authorization path; avoids maintaining a parallel RLS policy surface.

**Decision: Runtime-neutral domain code lives in `shared/`**
- Context: Scoring/questions lived in `client/src`, PDF generation in `server/` only, and the production edge router had no `pdf` router at all.
- Choice: Moved scoring, safeguards questions, and a rewritten pdf-generator to `shared/`, imported by client (Vite), dev server (Node/esbuild), and edge functions (Deno via `import_map.json`). Added `pdf` router to the edge function and aligned edge Stripe router signatures with `server/routers.ts` (the type source for the client).
- Tradeoff: The two router copies (`server/routers.ts`, `supabase/functions/_shared/routers.ts`) still must be kept in sync manually; documented in CLAUDE.md.

**Decision: Store storage keys, serve signed URLs; fix Stripe metadata propagation**
- Context: PDFs were saved with public URLs on a private-by-default bucket, and the webhook read `metadata` from the Stripe subscription object while checkout only set it on the session — so paid subscriptions never activated.
- Choice: `generated_documents.storage_path` stores the storage key; download URLs are signed per-request (1h TTL). Checkout now sets `subscription_data.metadata` so the webhook can resolve the dealership.
