import { describe, it, expect } from 'vitest';
import { computePosture, shouldRecordPosture } from '@shared/posture';
import { REQUIREMENT_CATALOG } from '@shared/requirements';
import type { AnswerValue } from '@shared/controls';

// The 12 requirement codes 16 CFR §314.6(a) exempts for institutions with <5,000 consumers:
// §314.4(b)(1), (d)(2), (h), (i). Mirrors shared/applicability.ts (kept independent here so a
// drift in the engine is caught).
const EXEMPT_CODES = new Set([
  'q1_3', 'q2_1', 'q2_2', 'q2_3', 'q7_1', 'q7_2', 'q7_3', 'q7_4', 'q7_5', 'q9_1', 'q9_2', 'q9_3',
]);

const allYes: Record<string, AnswerValue> = {};
for (const r of REQUIREMENT_CATALOG) allYes[r.code] = 'yes';

describe('computePosture', () => {
  it('all-yes with no exemption → overall 100 and every section 100', () => {
    const p = computePosture(REQUIREMENT_CATALOG, allYes, {});
    expect(p.overallScore).toBe(100);
    expect(Object.keys(p.sectionScores).length).toBe(9);
    for (const s of Object.values(p.sectionScores)) expect(s).toBe(100);
  });

  it('no answers → overall 0 with a valid risk band', () => {
    const p = computePosture(REQUIREMENT_CATALOG, {}, {});
    expect(p.overallScore).toBe(0);
    expect(['critical', 'high', 'medium', 'low']).toContain(p.riskLevel);
  });

  it('a set consumerCount >= 5000 exempts nothing (all 9 sections scored)', () => {
    const p = computePosture(REQUIREMENT_CATALOG, allYes, { consumerCount: 10000 });
    expect(Object.keys(p.sectionScores).length).toBe(9);
    expect(p.overallScore).toBe(100);
  });

  it('§314.6 exemption (<5000) drops the exempt requirements from the denominator', () => {
    // Fail ONLY the exempt controls, pass everything else. A non-exempt dealer sees those gaps
    // (< 100); an exempt dealer excludes them entirely, so every remaining in-scope control is
    // 'yes' → 100. Proves the exempt set leaves the score denominator.
    const answers: Record<string, AnswerValue> = {};
    for (const r of REQUIREMENT_CATALOG) answers[r.code] = EXEMPT_CODES.has(r.code) ? 'no' : 'yes';
    const nonExempt = computePosture(REQUIREMENT_CATALOG, answers, { consumerCount: 10000 });
    const exempt = computePosture(REQUIREMENT_CATALOG, answers, { consumerCount: 100 });
    expect(nonExempt.overallScore).toBeLessThan(100);
    expect(exempt.overallScore).toBe(100);
    expect(exempt.overallScore).toBeGreaterThan(nonExempt.overallScore);
  });
});

describe('shouldRecordPosture (dedup)', () => {
  it('first-ever snapshot always records', () => {
    expect(shouldRecordPosture(null, 42)).toBe(true);
    expect(shouldRecordPosture(undefined, 0)).toBe(true);
  });

  it('records only when the overall score changes', () => {
    expect(shouldRecordPosture(42, 42)).toBe(false);
    expect(shouldRecordPosture(42, 43)).toBe(true);
    expect(shouldRecordPosture(0, 1)).toBe(true);
  });
});
