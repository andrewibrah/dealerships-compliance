# 2026-07-21 — Step 1: Enforce MFA (TOTP / AAL2) — PRD #47

Active task: `.claude/tasks/CurrWork.md` (bootstrap exception — no promotion; the only `done/` log
was `0000-bootstrap.md`).

## Decisions
- **Enforcement policy: enrolled-only.** A user who has a *verified* second factor must reach AAL2
  before protected tRPC procedures serve data. Users with no verified factor are allowed at AAL1
  under this policy (chosen by the user over "enforce-all"). Documented so a future session can
  tighten to enforce-all if desired.
- **Prerequisite confirmed:** TOTP (App Authenticator) is **Enabled** in the Supabase project
  `AAND-Web-Compliance` (Auth → Multi-Factor; max 10 factors). Verified via dashboard screenshot.
- **Design:** the enforcement *decision* is a pure, runtime-neutral function in `shared/mfa.ts`
  (`requiresMfaStepUp` + `decodeAalFromJwt` + `hasVerifiedFactor`), imported by BOTH the Node
  (Express) and Deno (Edge) context builders + procedure tiers so enforcement is identical by
  construction. Server-side AAL is read from the (already-validated) JWT's `aal` claim; the verified
  factor is read from `getUser()`'s `user.factors`.

## Actions
- Read the full auth path in both runtimes; confirmed `auth.me` / `auth.logout` are *public*
  procedures (unaffected), gating lives in `protectedProcedure`.
- Confirmed supabase-js@2.103.3 types: `User.factors` (`status: 'verified'|'unverified'`),
  `AuthenticatorAssuranceLevels = 'aal1'|'aal2'`, `enroll` overloaded per factorType →
  `data.totp.qr_code/secret/uri`, `challengeAndVerify({ factorId, code })`,
  `listFactors → data.totp` (verified), `getAuthenticatorAssuranceLevel → currentLevel/nextLevel`.
- Implemented the pure decision + both-runtime enforcement + client enrollment + login step-up.

## Files changed
- **`shared/mfa.ts`** (new) — `requiresMfaStepUp`, `hasVerifiedFactor`, `decodeAalFromJwt`
  (runtime-neutral: `atob` + `JSON`; imported by both runtimes).
- **`shared/const.ts`** — added `MFA_REQUIRED_ERR_MSG = 'Multi-factor authentication required (10003)'`.
- **`server/_core/context.ts`** — `TrpcContext` gains `aal` + `hasVerifiedFactor`; computed from the
  validated JWT's `aal` claim and `getUser().factors`.
- **`server/_core/trpc.ts`** — `protectedProcedure` rejects with `MFA_REQUIRED_ERR_MSG` when
  `requiresMfaStepUp`.
- **`supabase/functions/_shared/trpc.ts`** — Deno `Context` + `protectedProcedure` mirror the Node
  enforcement (same `requiresMfaStepUp`, same message string).
- **`supabase/functions/trpc/index.ts`** — Deno `createContext` computes `aal` + `hasVerifiedFactor`.
- **`client/src/components/MfaEnrollment.tsx`** (new) — enroll/verify/remove TOTP; status reflected.
- **`client/src/pages/Profile.tsx`** — renders `<MfaEnrollment/>` below the profile form.
- **`client/src/pages/Login.tsx`** — after password sign-in, if session is AAL1 with `nextLevel:aal2`
  and a verified TOTP factor exists, show a code form and `challengeAndVerify` to reach AAL2 before
  routing. Redirect effect guarded by `!mfaFactorId && !submitting` so an AAL1 session isn't bounced
  to the dashboard mid-step-up. Preserved the A11Y-02-tested email/password structure.
- **`server/mfa.test.ts`** (new) — 15 tests: `requiresMfaStepUp` truth table, real
  `protectedProcedure` end-to-end (aal1+factor rejected / aal2 allowed / no-factor allowed /
  unauth rejected / TRPCError), `hasVerifiedFactor`, `decodeAalFromJwt`.
- **`server/auth.logout.test.ts`** — added the two new required `TrpcContext` fields to its literal.

## Verification
- `pnpm check` → PASS (tsc noEmit, 0 errors).
- `pnpm lint` → PASS (eslint `--max-warnings=0`, jsx-a11y guard clean incl. new components).
- `pnpm test` → PASS (78 tests, 9 files; MFA suite 15/15; a11y contrast harness auto-covered the
  new amber CTAs — 33 in amber-cta).

## Open threads / follow-ups
- **Policy is enrolled-only**: a user who never enrolls is never MFA-gated. Tightening to
  enforce-all (mandatory enrollment gate) is a deliberate future step if the pilot demands it.
- **Recovery codes**: relying on Supabase defaults; no custom recovery-code UX (out of scope).
- **Deno enforcement isn't unit-tested in CI** (Vitest can't import the `npm:`-specifier Deno files);
  it's guaranteed by importing the *same* `shared/mfa.ts` decision the Node suite covers.
- SSO + compliance-role RBAC remain the open sub-gaps of PRD #47 (see gaps.md).
