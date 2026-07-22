import { describe, it, expect } from 'vitest';
import { calculateSectionScore, calculateOverallScore, type SectionScore } from '@shared/scoring';
import { SAFEGUARDS_SECTIONS } from '@shared/safeguards-questions';
import { REQUIREMENT_CATALOG } from '@shared/requirements';
import {
  deriveAssessmentFromAnswers,
  joinControlsWithRequirements,
  deriveAssessment,
  type DerivedAssessment,
} from '@shared/derivation';
import type { AnswerValue } from '@shared/controls';

type AnswerMap = Record<string, AnswerValue>;

const ALL_IDS = SAFEGUARDS_SECTIONS.flatMap((s) => s.questions.map((q) => q.id));

// The authoritative path (shared/scoring.ts), run exactly as the Dashboard runs it:
// per-section calculateSectionScore, then calculateOverallScore over the section scores.
function scoringPath(answers: AnswerMap) {
  const sectionScores: SectionScore[] = SAFEGUARDS_SECTIONS.map((section) => {
    const s = calculateSectionScore(answers, section.questions);
    s.section = section.number;
    s.sectionName = section.name;
    return s;
  });
  return calculateOverallScore(sectionScores);
}

// The Control-derived path (shared/derivation.ts): derive Control statuses from the same
// answers against the global catalog, then produce scores + explainable gaps.
function derivationPath(answers: AnswerMap): DerivedAssessment {
  return deriveAssessmentFromAnswers(REQUIREMENT_CATALOG, answers);
}

// Both paths must agree on every score AND on the exact gap set, section by section.
function expectEquivalent(answers: AnswerMap) {
  const scoring = scoringPath(answers);
  const derived = derivationPath(answers);

  expect(derived.overall).toBe(scoring.overall);
  expect(derived.riskLevel).toBe(scoring.riskLevel);
  expect(derived.sections).toHaveLength(scoring.sections.length);

  for (const scoringSection of scoring.sections) {
    const derivedSection = derived.sections.find((s) => s.section === scoringSection.section);
    expect(derivedSection, `derived section ${scoringSection.section}`).toBeDefined();
    expect(derivedSection!.score).toBe(scoringSection.score);
    expect(derivedSection!.maxPoints).toBe(scoringSection.maxPoints);
    expect(derivedSection!.earnedPoints).toBe(scoringSection.earnedPoints);
    // scoring.ts records gaps/criticalGaps as the raw question text; the derived path carries
    // the same set as gap objects whose title IS the question text — assert identical in order.
    expect(derivedSection!.gaps.map((g) => g.title)).toEqual(scoringSection.gaps);
    expect(derivedSection!.criticalGaps.map((g) => g.title)).toEqual(scoringSection.criticalGaps);
  }
}

describe('derivation <-> scoring equivalence', () => {
  const allYes: AnswerMap = Object.fromEntries(ALL_IDS.map((id) => [id, 'yes']));
  const allNo: AnswerMap = Object.fromEntries(ALL_IDS.map((id) => [id, 'no']));
  const allPartial: AnswerMap = Object.fromEntries(ALL_IDS.map((id) => [id, 'partial']));
  const unanswered: AnswerMap = {};
  const mixed: AnswerMap = Object.fromEntries(
    ALL_IDS.map((id, i) => [id, i % 3 === 0 ? 'yes' : i % 3 === 1 ? 'no' : 'partial']),
  );
  // Realistic sparse input: a few answered, the rest unanswered (-> unknown -> gap).
  const sparse: AnswerMap = { q1_1: 'yes', q2_1: 'no', q4_1: 'partial', q7_3: 'yes', q9_3: 'partial' };

  it('agrees when every answer is yes (fully compliant, no gaps)', () => {
    expectEquivalent(allYes);
    expect(derivationPath(allYes).gaps).toHaveLength(0);
  });

  it('agrees when every answer is no (every requirement is a gap)', () => {
    expectEquivalent(allNo);
    expect(derivationPath(allNo).gaps).toHaveLength(REQUIREMENT_CATALOG.length);
  });

  it('agrees when every answer is partial', () => {
    expectEquivalent(allPartial);
  });

  it('agrees when nothing is answered (all unknown, every requirement a gap)', () => {
    expectEquivalent(unanswered);
    expect(derivationPath(unanswered).gaps).toHaveLength(REQUIREMENT_CATALOG.length);
  });

  it('agrees on a mixed yes/no/partial map', () => {
    expectEquivalent(mixed);
  });

  it('agrees on a sparse map (answered + unanswered)', () => {
    expectEquivalent(sparse);
  });
});

describe('derivation explainability (the value scoring.ts cannot express)', () => {
  it('tags every gap with its §314.4 citation and the triggering answer', () => {
    const answers: AnswerMap = { q2_1: 'no', q4_1: 'partial' }; // rest unanswered -> unknown
    const { gaps } = derivationPath(answers);

    const byCode = new Map(gaps.map((g) => [g.requirementCode, g]));

    // A "no" answer -> not_implemented gap, citation from the refined catalog.
    expect(byCode.get('q2_1')).toMatchObject({
      status: 'not_implemented',
      triggeringAnswer: 'no',
      citation: '§314.4(b)(1)',
      section: 2,
    });
    // A "partial" answer -> partial gap.
    expect(byCode.get('q4_1')).toMatchObject({
      status: 'partial',
      triggeringAnswer: 'partial',
      citation: '§314.4(c)(5)',
      section: 4,
    });
    // An unanswered requirement -> unknown gap with an undefined triggering answer.
    expect(byCode.get('q1_1')).toMatchObject({
      status: 'unknown',
      triggeringAnswer: undefined,
      citation: '§314.4(a)',
    });
  });

  it('excludes a not_applicable control from the denominator and from gaps', () => {
    // not_applicable only arises from a manually-set Control, so build the join directly.
    const rows = joinControlsWithRequirements(REQUIREMENT_CATALOG, {});
    const section1 = rows.filter((r) => r.requirement.section === 1);
    // Force the first requirement to not_applicable; leave the rest unknown.
    section1[0] = { ...section1[0], status: 'not_applicable' };
    const assessment = deriveAssessment(section1);
    const s1 = assessment.sections.find((s) => s.section === 1)!;

    // The N/A requirement is neither a gap nor part of the max — only the 4 unknowns remain.
    expect(s1.gaps.map((g) => g.requirementCode)).not.toContain(section1[0].requirement.code);
    expect(s1.gaps).toHaveLength(4);
  });
});
