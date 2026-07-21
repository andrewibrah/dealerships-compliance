// Tenant isolation — database-layer (RLS) support (PRD #46).
//
// Runtime-neutral, side-effect-free helpers shared by both runtimes' `withUserScope`
// executors so the JWT claim shape used to drive Postgres RLS is identical by
// construction. The actual transaction (SET LOCAL role + set_config) lives in each
// runtime's `db.ts` because it needs the runtime's Drizzle client; the claim payload
// is built here and unit-tested.
//
// Enforcement is gated by the `RLS_ENFORCED` env flag (default OFF). See the
// `0003_tenant_isolation_rls.sql` migration and the session log for the enable
// runbook — flipping this on before the migration is applied would deny-all, because
// RLS is enabled on every table with (until 0003) zero policies.

export const AUTHENTICATED_ROLE = 'authenticated';

/** Name of the GUC Supabase's `auth.uid()` / `auth.jwt()` read. */
export const JWT_CLAIMS_SETTING = 'request.jwt.claims';

/**
 * Build the JSON claims payload that, once set as `request.jwt.claims`, makes
 * `auth.uid()` resolve to `userId` for the duration of the scoped transaction.
 * Throws on an empty user id — a scoped query with no subject must never run,
 * because it would evaluate policies against a null `auth.uid()`.
 */
export function buildJwtClaims(userId: string): string {
  if (!userId) {
    throw new Error('withUserScope requires a non-empty userId');
  }
  return JSON.stringify({ sub: userId, role: AUTHENTICATED_ROLE });
}

/** Whether authenticated-scoped DB execution is enabled. Reads the flag from a
 *  runtime-provided value so this stays free of `process`/`Deno` globals. */
export function isRlsEnforced(flagValue: string | undefined | null): boolean {
  return (flagValue ?? '').trim().toLowerCase() === 'true';
}
