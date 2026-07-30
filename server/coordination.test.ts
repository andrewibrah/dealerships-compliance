import { describe, it, expect } from 'vitest';
import {
  COORDINATION_BY_CODE,
  COORDINATION_FALLBACK,
  EFFORT_LABEL,
  HORIZON_LABEL,
  OWNER_LABEL,
  getCoordination,
  horizonFor,
  type Effort,
  type OwnerRole,
} from '@shared/coordination';
import { REQUIREMENT_CATALOG } from '@shared/requirements';
import { priorityForWeight, type TaskPriority } from '@shared/task-derivation';

const OWNERS: OwnerRole[] = [
  'ownership',
  'qualified_individual',
  'gm_controller',
  'it_msp',
  'hr_training',
];
const EFFORTS: Effort[] = ['quick', 'moderate', 'project'];
const PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

describe('COORDINATION_BY_CODE coverage', () => {
  it('has an entry for every requirement in the catalog', () => {
    const missing = REQUIREMENT_CATALOG.filter((r) => !COORDINATION_BY_CODE[r.code]).map(
      (r) => r.code
    );
    expect(missing, `requirements with no coordination entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no entry for a code that is not in the catalog (no orphans)', () => {
    const codes = new Set(REQUIREMENT_CATALOG.map((r) => r.code));
    const orphans = Object.keys(COORDINATION_BY_CODE).filter((code) => !codes.has(code));
    expect(orphans, `orphan coordination entries: ${orphans.join(', ')}`).toEqual([]);
  });

  it('covers all 45 requirements', () => {
    expect(Object.keys(COORDINATION_BY_CODE)).toHaveLength(45);
  });
});

describe('COORDINATION_BY_CODE content', () => {
  it.each(Object.entries(COORDINATION_BY_CODE))('%s is well-formed', (code, coordination) => {
    expect(OWNERS, `${code} owner`).toContain(coordination.owner);
    expect(EFFORTS, `${code} effort`).toContain(coordination.effort);
    // Proof and consequence are the credibility of the plan — never blank, never a stub.
    expect(coordination.proof.trim().length, `${code} proof`).toBeGreaterThan(20);
    expect(coordination.consequence.trim().length, `${code} consequence`).toBeGreaterThan(20);
  });

  it('names exactly one accountable owner per requirement (shared ownership stalls gaps)', () => {
    for (const [code, coordination] of Object.entries(COORDINATION_BY_CODE)) {
      expect(typeof coordination.owner, code).toBe('string');
    }
  });

  it('carries no outside-party dependency (every item is internally owned)', () => {
    // A named external dependency reads as a ready-made reason to defer, and the dealership owns
    // the obligation under the Rule regardless of who it delegates the work to. Deliberate.
    for (const [code, coordination] of Object.entries(COORDINATION_BY_CODE)) {
      expect(coordination, code).not.toHaveProperty('vendor');
    }
  });

  it('frames every consequence as regulatory exposure, not inconvenience', () => {
    // Confirmed with the operator (2026-07-29): enforcement is what moves a dealer principal.
    // Scoped to these lines only — the UI banners stay calibrated.
    const grounded = Object.entries(COORDINATION_BY_CODE).filter(([, c]) =>
      /§314\.4|Rule|examiner|mandatory|notif/i.test(c.consequence),
    );
    expect(grounded.length).toBe(Object.keys(COORDINATION_BY_CODE).length);
  });

  it('routes designation and contract authority to ownership, training to HR', () => {
    expect(COORDINATION_BY_CODE.q1_1.owner).toBe('ownership');
    expect(COORDINATION_BY_CODE.q6_1.owner).toBe('ownership');
    for (const code of ['q8_1', 'q8_2', 'q8_3', 'q8_4', 'q8_5']) {
      expect(COORDINATION_BY_CODE[code].owner, code).toBe('hr_training');
    }
  });
});

describe('getCoordination', () => {
  it('returns the authored entry for a known code', () => {
    expect(getCoordination('q4_1')).toBe(COORDINATION_BY_CODE.q4_1);
  });

  it('falls back honestly for an unknown code rather than fabricating an owner', () => {
    expect(getCoordination('q99_9')).toBe(COORDINATION_FALLBACK);
  });
});

describe('horizonFor', () => {
  it('never parks critical work past 60 days', () => {
    for (const effort of EFFORTS) {
      expect(horizonFor('critical', effort)).toBeLessThanOrEqual(60);
    }
  });

  it('admits ONLY urgent work that is genuinely short into the next 30 days', () => {
    expect(horizonFor('critical', 'quick')).toBe(30);
    expect(horizonFor('high', 'quick')).toBe(30);
    // Effort dominates: urgent-but-multi-week work is scheduled honestly, not promised.
    expect(horizonFor('critical', 'moderate')).toBe(60);
    expect(horizonFor('high', 'moderate')).toBe(90);
  });

  it('never promises a 30+ day project inside 30 days', () => {
    for (const priority of PRIORITIES) {
      if (priority === 'critical') continue; // critical projects are pulled to 60, tested above
      expect(horizonFor(priority, 'project')).toBe(90);
    }
    expect(horizonFor('critical', 'project')).toBe(60);
  });

  it('keeps the 30-day bucket a minority of the catalog (a plan, not a relabelled gap list)', () => {
    const inFirst30 = REQUIREMENT_CATALOG.filter(
      (r) => horizonFor(priorityForWeight(r.weight), getCoordination(r.code).effort) === 30
    );
    // Worst case — every one of the 45 controls is a gap. Even then the first month must be a
    // short, finishable list rather than a third of the Rule.
    expect(inFirst30.length).toBeGreaterThan(0);
    expect(inFirst30.length).toBeLessThanOrEqual(18);
  });

  it('is deterministic and total over (priority, effort)', () => {
    for (const priority of PRIORITIES) {
      for (const effort of EFFORTS) {
        const first = horizonFor(priority, effort);
        expect([30, 60, 90]).toContain(first);
        expect(horizonFor(priority, effort)).toBe(first);
      }
    }
  });
});

describe('labels', () => {
  it('labels every enum value', () => {
    for (const owner of OWNERS) expect(OWNER_LABEL[owner]).toBeTruthy();
    for (const effort of EFFORTS) expect(EFFORT_LABEL[effort]).toBeTruthy();
    for (const horizon of [30, 60, 90] as const) expect(HORIZON_LABEL[horizon]).toBeTruthy();
  });
});
