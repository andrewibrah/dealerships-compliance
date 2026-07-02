# dealerships Compliance Engine - Status Log

## Current Phase: MVP1 coherence pass (2026-07-01)

**Status:** Core customer loop wired end-to-end on a single data path.

**Completed:**
- All compliance answer reads/writes go through tRPC (`compliance.getAnswers` / `compliance.saveSection`);
  removed direct browser Supabase queries that targeted a nonexistent `compliance_answers.user_id` column.
- Scoring + safeguards questions + PDF generation moved to `shared/` and used by client, dev server, and edge functions.
- Production edge function (`supabase/functions/trpc`) now includes the `pdf` router; WISP and board report
  are generated from actual saved answers with gaps and remediation priorities, stored in Supabase Storage,
  served via signed URLs.
- Documents page wired to real subscription status, PDF mutations, and the generated-documents list.
- Pricing page wired to `stripe.createCheckoutSession`; checkout sets `subscription_data.metadata` so the
  webhook can maintain the `subscriptions` row (this was previously broken — paid users would never unlock).
- Home page replaced scaffold "Example Page" with a real landing page; scaffold components
  (ComponentShowcase, AIChatBox, ManusDialog, Map, DashboardLayout, duplicate `_core` useAuth) and the
  `streamdown` dependency removed. Initial JS bundle dropped from ~1.85 MB to ~950 kB.
- Tests now exercise the real `shared/scoring.ts` module plus PDF generation smoke tests (9 tests).

**Verification:**
- `pnpm check`, `pnpm test`, `pnpm build` all pass.

**Known gaps / next:**
- Edge function changes are not locally testable (no Deno installed); verify the `trpc` function deploy
  and exercise generate-WISP in production after next push to main.
- No dealership profile UI yet — dealerships are auto-created as "My Dealership" on first save/upgrade;
  WISP quality improves once dealers can enter name/address/QI.
- `managed` plan has a price ID env var but no UI presence.
- RLS is enabled with no policies (intentional: all business data access is service-role via the edge
  function; browser Supabase client is auth-only).

---

## Notes
- Auth: Supabase Auth (email/password). Data: Supabase Postgres via Drizzle. API: tRPC on Supabase Edge
  Functions (production) / Express (local dev). See CLAUDE.md for the full topology.
- Design direction: Dark navy/slate with gold accents for professional, trust-focused appearance.
- Historical phase logs and early template decisions (Manus OAuth, MySQL) are superseded — see DECISIONS.md.
