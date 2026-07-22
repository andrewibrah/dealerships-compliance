import { describe, it, expect } from 'vitest';
import { deriveControlStatus, deriveControlsFromAnswers } from '@shared/controls';
import { REQUIREMENT_CATALOG } from '@shared/requirements';

describe('deriveControlStatus', () => {
  it('maps the questionnaire string encoding (yes / partial / no)', () => {
    expect(deriveControlStatus('yes')).toBe('implemented');
    expect(deriveControlStatus('partial')).toBe('partial');
    expect(deriveControlStatus('no')).toBe('not_implemented');
  });

  it('treats missing / unanswered / free-text as unknown (never guessed negative)', () => {
    expect(deriveControlStatus(null)).toBe('unknown');
    expect(deriveControlStatus(undefined)).toBe('unknown');
    expect(deriveControlStatus('')).toBe('unknown');
    expect(deriveControlStatus('some typed answer')).toBe('unknown');
  });

  it('tolerates the numeric / boolean forms scoring.ts accepts', () => {
    expect(deriveControlStatus(true)).toBe('implemented');
    expect(deriveControlStatus(1)).toBe('implemented');
    expect(deriveControlStatus(0.5)).toBe('partial');
    expect(deriveControlStatus(false)).toBe('not_implemented');
    expect(deriveControlStatus(0)).toBe('not_implemented');
  });
});

describe('deriveControlsFromAnswers', () => {
  const section1 = REQUIREMENT_CATALOG.filter((r) => r.section === 1);

  it('derives one status per catalog requirement, with missing answers -> unknown', () => {
    const answers = { q1_1: 'yes', q1_3: 'no', q1_4: 'partial' }; // q1_2, q1_5 omitted
    const derived = deriveControlsFromAnswers(answers, section1);

    expect(derived).toEqual([
      { requirementCode: 'q1_1', status: 'implemented' },
      { requirementCode: 'q1_2', status: 'unknown' },
      { requirementCode: 'q1_3', status: 'not_implemented' },
      { requirementCode: 'q1_4', status: 'partial' },
      { requirementCode: 'q1_5', status: 'unknown' },
    ]);
  });

  it('returns all-unknown for an empty / null answer map', () => {
    for (const answers of [{}, null, undefined]) {
      const derived = deriveControlsFromAnswers(answers, section1);
      expect(derived).toHaveLength(section1.length);
      expect(derived.every((c) => c.status === 'unknown')).toBe(true);
    }
  });

  it('ignores answers that do not correspond to a requirement in the given catalog', () => {
    const derived = deriveControlsFromAnswers({ q9_9: 'yes' }, section1);
    expect(derived.map((c) => c.requirementCode)).toEqual(['q1_1', 'q1_2', 'q1_3', 'q1_4', 'q1_5']);
    expect(derived.every((c) => c.status === 'unknown')).toBe(true);
  });
});
