/**
 * MFA step-up enforcement — runtime-neutral. Imported by BOTH the Node (Express)
 * and Deno (Edge) context builders + procedure tiers so the decision is identical
 * in both runtimes by construction (see CLAUDE.md: the two router copies must match).
 *
 * Policy: enrolled-only. A user who has a *verified* second factor must reach AAL2
 * before protected data is served. A user with no verified factor is allowed at AAL1.
 */

export type AuthAssuranceLevel = 'aal1' | 'aal2' | null;

/** True when the caller must complete MFA step-up before protected data is served. */
export function requiresMfaStepUp(params: {
  aal: AuthAssuranceLevel;
  hasVerifiedFactor: boolean;
}): boolean {
  return params.hasVerifiedFactor && params.aal !== 'aal2';
}

/** True when the user has at least one *verified* enrolled factor. */
export function hasVerifiedFactor(
  factors: ReadonlyArray<{ status: string }> | null | undefined,
): boolean {
  return (factors ?? []).some((factor) => factor.status === 'verified');
}

/**
 * Read the `aal` claim from a Supabase JWT. The token is only decoded *after* the
 * runtime has already validated it via `auth.getUser(token)`, so the claim is trusted.
 * Uses `atob` + `JSON`, both available in Node 18+ and Deno. Returns `null` on any
 * malformed input rather than throwing.
 */
export function decodeAalFromJwt(token: string | null | undefined): AuthAssuranceLevel {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const remainder = base64.length % 4;
    if (remainder) base64 += '='.repeat(4 - remainder);
    const claims = JSON.parse(atob(base64)) as { aal?: unknown };
    return claims.aal === 'aal1' || claims.aal === 'aal2' ? claims.aal : null;
  } catch {
    return null;
  }
}
