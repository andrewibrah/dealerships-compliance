// Tenant isolation — application-layer guard (PRD #46).
//
// Runtime-neutral: imported by both the Node (Express) and Deno (Edge) runtimes so
// tenant scoping is derived identically by construction.
//
// The invariant: a business row is only ever read or written with a dealership id
// that was resolved from the *authenticated caller's* user id. `resolveTenantScope`
// is the single funnel that produces a `ScopedDealershipId`; the crown-jewel data
// accessors (compliance answers, generated documents) accept only a `TenantScope`,
// so — on the typechecked Node side — it is a compile error to touch them with an
// id that did not come from the current session. RLS (see `0003` migration) is the
// database-level backstop; this guard is the tested, app-level first line.

/** A dealership id proven to belong to the authenticated caller. Obtainable only
 *  via `resolveTenantScope` (or the explicit `serviceRoleScope` escape hatch). */
declare const scopedDealershipBrand: unique symbol;
export type ScopedDealershipId = number & { readonly [scopedDealershipBrand]: true };

export interface TenantScope {
  readonly userId: string;
  readonly dealershipId: ScopedDealershipId;
}

/** Minimal dealership shape the funnel needs. Real `Dealership` rows satisfy it. */
export interface TenantDealershipRef {
  id: number;
  userId: string;
}

/** The two lookups `resolveTenantScope` depends on. The `db` module satisfies this
 *  structurally in both runtimes; tests inject a fake. Generic over the dealership
 *  row type so the resolved scope can carry the full row for callers that need it. */
export interface TenantLookup<D extends TenantDealershipRef = TenantDealershipRef> {
  getDealershipByUserId(userId: string): Promise<D | null>;
  createDefaultDealership(userId: string): Promise<D>;
}

export interface ResolveOptions {
  /** Create the caller's default dealership if none exists (used by the save paths
   *  that legitimately provision on first write). Reads pass `false`. */
  createIfMissing?: boolean;
}

/**
 * Resolve the authenticated caller's tenant scope. Returns `null` when the caller
 * has no dealership (and `createIfMissing` is not set). Never returns a scope for a
 * dealership the caller does not own — the ownership re-check is defense-in-depth
 * against a `getDealershipByUserId` implementation regression that returns a foreign
 * row. This is the ONLY place a `ScopedDealershipId` is minted from a user id.
 */
export async function resolveTenantScope<D extends TenantDealershipRef>(
  lookup: TenantLookup<D>,
  userId: string | null | undefined,
  opts: ResolveOptions = {},
): Promise<(TenantScope & { dealership: D }) | null> {
  if (!userId) return null;

  let dealership = await lookup.getDealershipByUserId(userId);
  if (!dealership && opts.createIfMissing) {
    dealership = await lookup.createDefaultDealership(userId);
  }
  if (!dealership) return null;

  // Defense-in-depth: the lookup is supposed to filter by userId; refuse to hand
  // back a scope if it ever yields a dealership owned by someone else.
  if (dealership.userId !== userId) return null;

  return { userId, dealershipId: dealership.id as ScopedDealershipId, dealership };
}

/**
 * Assert that a dealership id supplied by the *client* (e.g. an update mutation that
 * echoes back an id) matches the caller's resolved scope. Throws on mismatch.
 */
export function assertScopeOwns(scope: TenantScope, dealershipId: number): void {
  if ((scope.dealershipId as number) !== dealershipId) {
    throw new Error('Forbidden: dealership does not belong to the authenticated user');
  }
}

/**
 * Explicit escape hatch for non-session contexts that legitimately act without a
 * caller-derived scope: the Stripe webhook (server-to-server, no user JWT) and
 * tests. Every call is a greppable, deliberate assertion that tenant-guard/RLS is
 * being intentionally bypassed under the service role.
 */
export function serviceRoleScope(userId: string, dealershipId: number): TenantScope {
  return { userId, dealershipId: dealershipId as ScopedDealershipId };
}
