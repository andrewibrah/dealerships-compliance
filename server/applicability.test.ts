import { describe, it, expect } from 'vitest';
import { calculateSectionScore, calculateOverallScore, type SectionScore } from '@shared/scoring';
import { SAFEGUARDS_SECTIONS } from '@shared/safeguards-questions';
import { REQUIREMENT_CATALOG } from '@shared/requirements';
import {
  getApplicability,
  applicableQuestions,
  applicableRequirements,
  isCitationExemptUnder5000,
  isExemptUnder5000,
  type Applicability,
} from '@shared/applicability';
import { deriveAssessmentFromAnswers, type DerivedAssessment } from '@shared/derivation';
import type { AnswerValue } from '@shared/controls';

type AnswerMap = Record<string, AnswerValue>;

const ALL_IDS = SAFEGUARDS_SECTIONS.flatMap((s) => s.questions.map((q) => q.id));

// The exact codes §314.6(a) exempts for a sub-5,000-consumer dealer: §314.4(b)(1) [q2_1-3],
// (d)(2) [q9_1-3], (h) incl. every (h)(x) [all of section 7], and (i) [q1_3]. Hand-derived
// from the Rule + CITATION_BY_CODE so a catalog drift that changed a citation would fail here.
const EXPECTED_EXEMPT = [
  'q1_3',
  'q2_1', 'q2_2', 'q2_3',
  'q7_1', 'q7_2', 'q7_3', 'q7_4', 'q7_5',
  'q9_1', 'q9_2', 'q9_3',
].sort();

// The authoritative scoring path (shared/scoring.ts) run exactly as the consumers run it,
// but over the in-scope question set for a profile.
function scoringPath(answers: AnswerMap, applicability: Applicability) {
  const sectionScores: SectionScore[] = SAFEGUARDS_SECTIONS.map((section) => {
    const s = calculateSectionScore(answers, applicableQuestions(section.questions, applicability));
    s.section = section.number;
    s.sectionName = section.name;
    return s;
  });
  return calculateOverallScore(sectionScores);
}

// The Control-derived path (shared/derivation.ts) over the same in-scope requirement set.
function derivationPath(answers: AnswerMap, applicability: Applicability): DerivedAssessment {
  return deriveAssessmentFromAnswers(
    applicableRequirements(REQUIREMENT_CATALOG, applicability),
    answers,
  );
}

// Both paths must agree on every score AND on the exact gap set, section by section.
function expectPathsAgree(answers: AnswerMap, applicability: Applicability) {
  const scoring = scoringPath(answers, applicability);
  const derived = derivationPath(answers, applicability);

  expect(derived.overall).toBe(scoring.overall);
  expect(derived.riskLevel).toBe(scoring.riskLevel);

  // Compare only the sections the scoring path treats as in-scope (maxPoints > 0). A fully
  // exempt section has no scoring weight and no derived rows, so it simply is not compared.
  const scoringInScope = scoring.sections.filter((s) => s.maxPoints > 0);
  expect(derived.sections).toHaveLength(scoringInScope.length);
  for (const scoringSection of scoringInScope) {
    const derivedSection = derived.sections.find((s) => s.section === scoringSection.section);
    expect(derivedSection, `derived section ${scoringSection.section}`).toBeDefined();
    expect(derivedSection!.score).toBe(scoringSection.score);
    expect(derivedSection!.maxPoints).toBe(scoringSection.maxPoints);
    expect(derivedSection!.earnedPoints).toBe(scoringSection.earnedPoints);
    expect(derivedSection!.gaps.map((g) => g.title)).toEqual(scoringSection.gaps);
    expect(derivedSection!.criticalGaps.map((g) => g.title)).toEqual(scoringSection.criticalGaps);
  }
}

const allYes: AnswerMap = Object.fromEntries(ALL_IDS.map((id) => [id, 'yes']));
const allNo: AnswerMap = Object.fromEntries(ALL_IDS.map((id) => [id, 'no']));
const mixed: AnswerMap = Object.fromEntries(
  ALL_IDS.map((id, i) => [id, ['yes', 'no', 'partial'][i % 3]]),
);

describe('isCitationExemptUnder5000 — precise §314.6(a) subsection matching', () => {
  it('exempts exactly (b)(1), (d)(2), (h) [+ any (h)(x)], and (i)', () => {
    expect(isCitationExemptUnder5000('§314.4(b)(1)')).toBe(true);
    expect(isCitationExemptUnder5000('§314.4(d)(2)')).toBe(true);
    expect(isCitationExemptUnder5000('§314.4(h)')).toBe(true);
    expect(isCitationExemptUnder5000('§314.4(h)(3)')).toBe(true);
    expect(isCitationExemptUnder5000('§314.4(h)(6)')).toBe(true);
    expect(isCitationExemptUnder5000('§314.4(i)')).toBe(true);
  });

  it('does NOT exempt the general (b)/(d) elements or unrelated subsections', () => {
    expect(isCitationExemptUnder5000('§314.4(b)')).toBe(false);
    expect(isCitationExemptUnder5000('§314.4(b)(2)')).toBe(false);
    expect(isCitationExemptUnder5000('§314.4(d)')).toBe(false);
    expect(isCitationExemptUnder5000('§314.4(a)')).toBe(false);
    expect(isCitationExemptUnder5000('§314.4(c)(3)')).toBe(false);
    expect(isCitationExemptUnder5000('§314.4(e)(1)')).toBe(false);
    expect(isCitationExemptUnder5000('§314.4(f)(2)')).toBe(false);
  });
});

describe('getApplicability — opt-in, safe-default exemption', () => {
  it('exempts exactly the (b)(1)/(d)(2)/(h)/(i) codes for a sub-5,000 profile', () => {
    const a = getApplicability({ consumerCount: 100 });
    expect(a.isExemptUnder5000).toBe(true);
    expect([...a.exemptCodes].sort()).toEqual(EXPECTED_EXEMPT);
    // The in-scope requirement set is exactly the complement of the exempt set.
    const inScope = applicableRequirements(REQUIREMENT_CATALOG, a).map((r) => r.code).sort();
    expect(inScope).toEqual(ALL_IDS.filter((id) => !EXPECTED_EXEMPT.includes(id)).sort());
  });

  it('4,999 is exempt; 5,000 is NOT (fewer than five thousand)', () => {
    expect(isExemptUnder5000({ consumerCount: 4999 })).toBe(true);
    expect(isExemptUnder5000({ consumerCount: 5000 })).toBe(false);
    expect(getApplicability({ consumerCount: 4999 }).exemptCodes.size).toBe(EXPECTED_EXEMPT.length);
    expect(getApplicability({ consumerCount: 5000 }).exemptCodes.size).toBe(0);
  });

  it('exempts NOTHING for a null / undefined / >= 5,000 / NaN profile', () => {
    for (const profile of [
      { consumerCount: null },
      { consumerCount: undefined },
      {},
      { consumerCount: 5000 },
      { consumerCount: 250000 },
      { consumerCount: Number.NaN },
    ]) {
      const a = getApplicability(profile);
      expect(a.isExemptUnder5000).toBe(false);
      expect(a.exemptCodes.size).toBe(0);
      expect(ALL_IDS.every((id) => a.isApplicable(id))).toBe(true);
    }
  });
});

describe('scoring-denominator seam', () => {
  // Regression guard: the DEFAULT (non-exempt) path must be byte-identical to today, where
  // "today" is scoring/derivation over the FULL, unfiltered question + requirement set.
  it('non-exempt profile === today (unfiltered) across scoring AND derivation', () => {
    const identity = getApplicability({ consumerCount: null });
    for (const answers of [allYes, allNo, mixed]) {
      // scoring path with identity applicability == raw per-section scoring
      const rawSections = SAFEGUARDS_SECTIONS.map((section) => {
        const s = calculateSectionScore(answers, section.questions);
        s.section = section.number;
        s.sectionName = section.name;
        return s;
      });
      const rawOverall = calculateOverallScore(rawSections);
      const filtered = scoringPath(answers, identity);
      expect(filtered.overall).toBe(rawOverall.overall);
      expect(filtered.riskLevel).toBe(rawOverall.riskLevel);
      filtered.sections.forEach((s, i) => {
        expect(s.score).toBe(rawSections[i].score);
        expect(s.maxPoints).toBe(rawSections[i].maxPoints);
        expect(s.earnedPoints).toBe(rawSections[i].earnedPoints);
        expect(s.gaps).toEqual(rawSections[i].gaps);
      });
      // derivation with identity applicability == derivation over the full catalog
      const filteredDerived = derivationPath(answers, identity);
      const rawDerived = deriveAssessmentFromAnswers(REQUIREMENT_CATALOG, answers);
      expect(filteredDerived.overall).toBe(rawDerived.overall);
      expect(filteredDerived.gaps.map((g) => g.requirementCode)).toEqual(
        rawDerived.gaps.map((g) => g.requirementCode),
      );
      // and the two identity paths agree with each other
      expectPathsAgree(answers, identity);
    }
  });

  it('exempt profile drops exactly the exempt codes from BOTH paths, which still agree', () => {
    const exempt = getApplicability({ consumerCount: 100 });
    for (const answers of [allYes, allNo, mixed]) {
      // scoring denominator excludes every exempt code and includes every in-scope one
      const scoredIds = SAFEGUARDS_SECTIONS.flatMap((section) =>
        applicableQuestions(section.questions, exempt).map((q) => q.id),
      ).sort();
      expect(scoredIds).toEqual(ALL_IDS.filter((id) => !EXPECTED_EXEMPT.includes(id)).sort());

      // derivation excludes the same set
      const derivedIds = derivationPath(answers, exempt).sections
        .flatMap((s) => s.gaps.map((g) => g.requirementCode))
        .concat(
          applicableRequirements(REQUIREMENT_CATALOG, exempt).map((r) => r.code),
        );
      for (const code of EXPECTED_EXEMPT) {
        expect(derivedIds).not.toContain(code);
      }

      // both scope-aware paths still produce identical scores + gaps
      expectPathsAgree(answers, exempt);
    }
  });
});
