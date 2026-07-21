import { describe, it, expect } from 'vitest';
import {
  resolveTenantScope,
  assertScopeOwns,
  serviceRoleScope,
  type TenantLookup,
  type TenantScope,
} from '@shared/tenant-guard';
import { buildJwtClaims, isRlsEnforced, AUTHENTICATED_ROLE } from '@shared/rls';

// A minimal dealership row, structurally compatible with the real Drizzle `Dealership`.
type FakeDealership = { id: number; userId: string; name: string };

function makeStore(seed: FakeDealership[]) {
  const rows: FakeDealership[] = [...seed];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  const store: TenantLookup<FakeDealership> = {
    async getDealershipByUserId(userId) {
      return rows.find((r) => r.userId === userId) ?? null;
    },
    async createDefaultDealership(userId) {
      const row: FakeDealership = { id: nextId++, userId, name: 'My Dealership' };
      rows.push(row);
      return row;
    },
  };
  return { store, rows };
}

// A fake tenant-partitioned "compliance_answers" table. The ONLY read key is a
// dealershipId carried by a TenantScope — mirroring db.getComplianceAnswers(scope),
// which reads `where dealership_id = scope.dealershipId`.
const ANSWERS_BY_DEALERSHIP: Record<number, string[]> = {
  1: ['tenant-A-secret-answer'],
  2: ['tenant-B-secret-answer'],
};
function readComplianceAnswers(scope: TenantScope): string[] {
  return ANSWERS_BY_DEALERSHIP[scope.dealershipId] ?? [];
}

describe('resolveTenantScope — the single tenant funnel', () => {
  it('resolves the caller to their own dealership id', async () => {
    const { store } = makeStore([
      { id: 1, userId: 'user-a', name: 'A Motors' },
      { id: 2, userId: 'user-b', name: 'B Motors' },
    ]);

    const a = await resolveTenantScope(store, 'user-a');
    const b = await resolveTenantScope(store, 'user-b');

    expect(a?.dealershipId).toBe(1);
    expect(a?.userId).toBe('user-a');
    expect(b?.dealershipId).toBe(2);
    // The resolved scope carries the full row for callers that need it.
    expect(a?.dealership.name).toBe('A Motors');
  });

  it('REGRESSION: tenant A cannot read tenant B compliance answers', async () => {
    const { store } = makeStore([
      { id: 1, userId: 'user-a', name: 'A Motors' },
      { id: 2, userId: 'user-b', name: 'B Motors' },
    ]);

    const scopeA = await resolveTenantScope(store, 'user-a');
    expect(scopeA).not.toBeNull();

    const visibleToA = readComplianceAnswers(scopeA!);
    expect(visibleToA).toEqual(['tenant-A-secret-answer']);
    expect(visibleToA).not.toContain('tenant-B-secret-answer');

    // There is no user-a input that yields a scope for dealership 2: the funnel
    // always derives the id from the caller, so B's data is unreachable to A.
    expect(scopeA!.dealershipId).toBe(1);
  });

  it('returns null when the caller has no dealership and createIfMissing is unset', async () => {
    const { store } = makeStore([{ id: 1, userId: 'user-a', name: 'A Motors' }]);
    expect(await resolveTenantScope(store, 'user-c')).toBeNull();
  });

  it('provisions the default dealership when createIfMissing is set', async () => {
    const { store, rows } = makeStore([{ id: 1, userId: 'user-a', name: 'A Motors' }]);

    const scope = await resolveTenantScope(store, 'user-c', { createIfMissing: true });

    expect(scope).not.toBeNull();
    expect(scope!.userId).toBe('user-c');
    expect(rows.find((r) => r.userId === 'user-c')).toBeTruthy();
    expect(scope!.dealership.name).toBe('My Dealership');
  });

  it('DEFENSE-IN-DEPTH: refuses a scope for a dealership the caller does not own', async () => {
    // Simulates a getDealershipByUserId regression that returns a foreign row.
    const buggy: TenantLookup<FakeDealership> = {
      async getDealershipByUserId() {
        return { id: 99, userId: 'someone-else', name: 'Not Yours' };
      },
      async createDefaultDealership() {
        throw new Error('should not be called');
      },
    };
    expect(await resolveTenantScope(buggy, 'user-a')).toBeNull();
  });

  it('returns null for an empty / missing user id', async () => {
    const { store } = makeStore([{ id: 1, userId: 'user-a', name: 'A Motors' }]);
    expect(await resolveTenantScope(store, '')).toBeNull();
    expect(await resolveTenantScope(store, null)).toBeNull();
    expect(await resolveTenantScope(store, undefined)).toBeNull();
  });
});

describe('assertScopeOwns', () => {
  const scope = serviceRoleScope('user-a', 1);

  it('passes when the client-supplied id matches the scope', () => {
    expect(() => assertScopeOwns(scope, 1)).not.toThrow();
  });

  it('throws when the client-supplied id does not match the scope', () => {
    expect(() => assertScopeOwns(scope, 2)).toThrow(/does not belong/i);
  });
});

describe('serviceRoleScope escape hatch', () => {
  it('mints a scope for non-session contexts (webhooks/tests)', () => {
    const scope = serviceRoleScope('svc-user', 7);
    expect(scope.userId).toBe('svc-user');
    expect(scope.dealershipId).toBe(7);
  });
});

describe('rls claim builder', () => {
  it('builds JWT claims that carry the subject and authenticated role', () => {
    const claims = JSON.parse(buildJwtClaims('user-a')) as { sub: string; role: string };
    expect(claims.sub).toBe('user-a');
    expect(claims.role).toBe(AUTHENTICATED_ROLE);
  });

  it('refuses to build claims for an empty subject (would null out auth.uid())', () => {
    expect(() => buildJwtClaims('')).toThrow();
  });

  it('parses the RLS_ENFORCED flag case-insensitively, defaulting off', () => {
    expect(isRlsEnforced('true')).toBe(true);
    expect(isRlsEnforced('TRUE')).toBe(true);
    expect(isRlsEnforced(' true ')).toBe(true);
    expect(isRlsEnforced('false')).toBe(false);
    expect(isRlsEnforced('')).toBe(false);
    expect(isRlsEnforced(undefined)).toBe(false);
    expect(isRlsEnforced(null)).toBe(false);
  });
});
