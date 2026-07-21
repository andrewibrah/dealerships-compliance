# Current Work — Step 1: Enforce MFA (TOTP / AAL2)

## Objective
Add enforced multi-factor authentication (TOTP) to the app so that a user with a paid, security-
sensitive account must present a second factor. Concretely: let a user **enroll** a TOTP factor,
**challenge/verify** it at login, and **require AAL2** (second factor satisfied) before protected
tRPC procedures will serve business data. This closes PRD #47's MFA requirement — the single
Critical, self-contained, demo-blocking gap.

## Why now
- **Severity: Critical.** PRD #47 states plainly: "a security product without MFA is dead on the
  demo." We are selling security to security-anxious buyers post-CDK; shipping without MFA
  undermines the entire value proposition.
- **Dependency: none.** Supabase Auth has native TOTP MFA (`enroll` / `challenge` / `verify`,
  and AAL in the JWT). This work does **not** depend on the core object model (remediation #4) or
  any other gap, so it is the cleanest high-value first move. It is remediation item #1 in gaps.md.

## In scope
- Supabase TOTP factor **enrollment** UI + flow (QR / secret) — e.g. on the Profile page.
- **Challenge + verify** at login when the user has an enrolled factor (AAL1 → AAL2 step-up).
- Backend enforcement: `protectedProcedure` (or a new `mfaProcedure`) rejects requests whose
  Supabase session is not **AAL2** when the user has an enrolled factor. Verify the token's
  assurance level server-side in **both** `server/_core/context.ts` (Node) and
  `supabase/functions/trpc/index.ts` (Deno) — they must stay in sync.
- A clear unauthenticated/aal1 error surfaced to the client (reuse `UNAUTHED_ERR_MSG` pattern in
  `shared/const.ts`, or add an MFA-specific message).
- Tests for the enforcement decision (see acceptance criteria).

## Out of scope
- SSO / SAML (PRD #47, later phase).
- Compliance-role RBAC — owner/QI/staff/auditor (PRD #42).
- SMS/WebAuthn factors — TOTP only for this step.
- Recovery codes UX polish beyond what Supabase provides out of the box (note it as a follow-up).
- Any change to the compliance/scoring/PDF domain.

## Relevant files
- `client/src/hooks/useAuth.ts:18-33` — session bootstrap; where AAL/MFA state should surface.
- `client/src/lib/supabase.ts` — the auth-only browser client; MFA APIs (`supabase.auth.mfa.*`) live here.
- `client/src/pages/Login.tsx` — add the challenge/verify step.
- `client/src/pages/Profile.tsx` — natural home for factor enrollment.
- `server/_core/context.ts:13-48` — Node token→user; must check assurance level.
- `server/_core/trpc.ts:13-45` — `protectedProcedure` middleware; enforcement point.
- `supabase/functions/trpc/index.ts:16-38` — Deno context; mirror the Node enforcement.
- `supabase/functions/_shared/trpc.ts` — Deno procedure tiers; mirror `protectedProcedure`.
- `shared/const.ts` — error messages (`UNAUTHED_ERR_MSG`, `NOT_ADMIN_ERR_MSG`).
- Supabase project setting: TOTP factor must be enabled in the Auth config (note for the user — a
  dashboard/CLI step, not code).

## Plan
1. Confirm Supabase Auth MFA (TOTP) is enabled for the project (dashboard/CLI). If not, flag it to
   the user as a prerequisite — do not proceed to enforcement without it.
2. Enrollment: on Profile, add `supabase.auth.mfa.enroll({ factorType: 'totp' })` → show QR/secret
   → `challenge` + `verify` to activate. Handle the already-enrolled case.
3. Login step-up: after password sign-in, if `getAuthenticatorAssuranceLevel()` returns
   `currentLevel: 'aal1'` with `nextLevel: 'aal2'`, prompt for the TOTP code and verify to reach aal2.
4. Server enforcement: in both context builders, read the token's `aal` (via `getUser` / decoded
   claim) and the user's factor list; if a factor is enrolled but the session is not aal2, treat as
   unauthorized for protected procedures. Keep Node and Deno identical.
5. Surface a clear client error and route the user back to the MFA challenge.
6. Tests: cover the enforcement decision (aal1-with-factor → rejected; aal2 → allowed; no-factor →
   allowed under current policy or rejected under enforce-all policy — pick one and document it).
7. Update gaps.md #47 status and note SSO/RBAC as the remaining #47 sub-gaps.

## Acceptance criteria
- [ ] A user can enroll a TOTP factor and see it reflected on Profile.
- [ ] A user with an enrolled factor is challenged for a code at login and reaches an aal2 session.
- [ ] Protected tRPC procedures reject an aal1 session when the user has an enrolled factor, in
      **both** the Express and Edge runtimes.
- [ ] The MFA enforcement decision is covered by a Vitest test.
- [ ] `pnpm check` and `pnpm test` pass.
- [ ] gaps.md #47 updated (MFA closed; SSO + RBAC noted as remaining).
- [ ] `done/` log written; a fresh NextWork.md authored (remediation #2: RLS tenant isolation).
