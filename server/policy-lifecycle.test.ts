import { describe, it, expect } from 'vitest';
import {
  bumpsVersion,
  canTransition,
  computePolicyTransition,
  nextStatuses,
  POLICY_STATUSES,
  type PolicyStatus,
} from '@shared/policy-lifecycle';

const NOW = new Date('2026-07-01T12:00:00.000Z');

// Every (from, to) pair that is legal, per the documented lifecycle.
const VALID: [PolicyStatus, PolicyStatus][] = [
  ['draft', 'in_review'],
  ['draft', 'archived'],
  ['in_review', 'approved'],
  ['in_review', 'draft'],
  ['in_review', 'archived'],
  ['approved', 'adopted'],
  ['approved', 'in_review'],
  ['approved', 'draft'],
  ['approved', 'archived'],
];

describe('policy lifecycle — allowed transitions', () => {
  it('accepts exactly the documented forward/revision/archive moves', () => {
    for (const [from, to] of VALID) {
      expect(canTransition(from, to), `${from} -> ${to} should be allowed`).toBe(true);
    }
  });

  it('rejects every move not in the allowed set (self-moves, skips, terminal states)', () => {
    const validSet = new Set(VALID.map(([f, t]) => `${f}->${t}`));
    for (const from of POLICY_STATUSES) {
      for (const to of POLICY_STATUSES) {
        if (validSet.has(`${from}->${to}`)) continue;
        expect(canTransition(from, to), `${from} -> ${to} should be rejected`).toBe(false);
      }
    }
  });

  it('treats adopted and archived as terminal (no outgoing transitions)', () => {
    expect(nextStatuses('adopted')).toEqual([]);
    expect(nextStatuses('archived')).toEqual([]);
  });

  it('cannot archive an adopted policy (adopted is immutable)', () => {
    expect(canTransition('adopted', 'archived')).toBe(false);
  });

  it('cannot skip straight from draft to approved or adopted', () => {
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('draft', 'adopted')).toBe(false);
    expect(canTransition('in_review', 'adopted')).toBe(false);
  });
});

describe('policy lifecycle — version-bump rule', () => {
  it('bumps only when a previously-approved policy re-enters an editable state', () => {
    expect(bumpsVersion('approved', 'draft')).toBe(true);
    expect(bumpsVersion('approved', 'in_review')).toBe(true);
  });

  it('does not bump on forward progress or adoption or early kick-backs', () => {
    expect(bumpsVersion('draft', 'in_review')).toBe(false);
    expect(bumpsVersion('in_review', 'approved')).toBe(false);
    expect(bumpsVersion('in_review', 'draft')).toBe(false); // never approved yet
    expect(bumpsVersion('approved', 'adopted')).toBe(false); // adopt the version you approved
    expect(bumpsVersion('approved', 'archived')).toBe(false);
  });
});

describe('computePolicyTransition', () => {
  it('throws a clear error on a disallowed transition', () => {
    expect(() =>
      computePolicyTransition({ status: 'draft', version: 1, adoptedAt: null }, 'adopted', NOW),
    ).toThrow(/Invalid policy transition: draft -> adopted/);
  });

  it('advances status without touching version on a plain forward move', () => {
    const changes = computePolicyTransition(
      { status: 'draft', version: 1, adoptedAt: null },
      'in_review',
      NOW,
    );
    expect(changes).toEqual({ status: 'in_review', version: 1 });
    expect('adoptedAt' in changes).toBe(false);
  });

  it('stamps adoptedAt exactly once when adopting from approved', () => {
    const changes = computePolicyTransition(
      { status: 'approved', version: 2, adoptedAt: null },
      'adopted',
      NOW,
    );
    expect(changes).toEqual({ status: 'adopted', version: 2, adoptedAt: NOW });
  });

  it('bumps version when an approved policy is sent back for revision', () => {
    expect(
      computePolicyTransition({ status: 'approved', version: 3, adoptedAt: null }, 'draft', NOW),
    ).toEqual({ status: 'draft', version: 4 });
    expect(
      computePolicyTransition({ status: 'approved', version: 3, adoptedAt: null }, 'in_review', NOW),
    ).toEqual({ status: 'in_review', version: 4 });
  });

  it('never overwrites an already-set adoptedAt (defense-in-depth set-once)', () => {
    // adopted is terminal, so this state is unreachable in practice; the guard still refuses to
    // emit a new adoptedAt if one somehow already exists. (The transition itself is invalid, so
    // it throws before ever reaching the stamp — proving adoptedAt can never be re-written.)
    const already = new Date('2020-01-01T00:00:00.000Z');
    expect(() =>
      computePolicyTransition({ status: 'adopted', version: 1, adoptedAt: already }, 'adopted', NOW),
    ).toThrow(/Invalid policy transition/);
  });
});
