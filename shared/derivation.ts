// Control-derived gap & score derivation (PRD #5 explainability spine).
//
// Pure and dependency-free (mirrors shared/scoring.ts / shared/controls.ts). This is the
// Control-first path to the same numbers shared/scoring.ts produces from raw answers, but
// it hangs a §314.4 citation + the triggering answer off every gap — the explainability
// the questionnaire-only path can't express. It is PROVEN equivalent to shared/scoring.ts
// in server/derivation.test.ts; scoring.ts stays authoritative for the Dashboard/PDF until
// a later wave deliberately cuts consumers over. Nothing here is switched on yet.
//
// Determinism: status -> earned points, gap membership, and citation are all data-derived
// (no LLM). Earned-point + gap rules mirror scoring.ts EXACTLY for the statuses that arise
// from the questionnaire (implemented / partial / not_implemented / unknown); not_applicable
// (only reachable via a manually-set Control) is excluded from the denominator and is not a
// gap, which is the compliance-correct behavior and never perturbs the equivalence proof.

import type { Requirement, RequirementWeight } from './requirements';
import { deriveControlStatus, type AnswerValue, type ControlStatus } from './controls';
import {
  CRITICAL_WEIGHT,
  IMPORTANT_WEIGHT,
  STANDARD_WEIGHT,
  HIGH_ENFORCEMENT_MULTIPLIER,
  HIGH_ENFORCEMENT_SECTIONS,
} from './scoring';

/** A derived Control status joined with its global Requirement row + the raw answer that set it. */
export interface ControlWithRequirement {
  requirement: Requirement;
  status: ControlStatus;
  /** The raw saved answer value that produced `status` (the explainability "triggering answer"). */
  triggeringAnswer: AnswerValue;
}

/** One explainable gap: the requirement, its §314.4 citation, and what triggered it. */
export interface DerivedGap {
  requirementCode: string;
  citation: string;
  title: string;
  status: ControlStatus;
  triggeringAnswer: AnswerValue;
  weight: RequirementWeight;
  section: number;
}

export interface DerivedSectionScore {
  section: number;
  sectionName: string;
  score: number; // 0-100
  maxPoints: number;
  earnedPoints: number;
  gaps: DerivedGap[];
  criticalGaps: DerivedGap[];
}

export interface DerivedAssessment {
  overall: number; // 0-100
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  sections: DerivedSectionScore[];
  /** Every gap across all sections, in catalog order. */
  gaps: DerivedGap[];
}

/** Point value of a requirement weight — same scale as shared/scoring.ts. */
function weightPoints(weight: RequirementWeight): number {
  return weight === 'critical'
    ? CRITICAL_WEIGHT
    : weight === 'important'
      ? IMPORTANT_WEIGHT
      : STANDARD_WEIGHT;
}

/** A status is a gap unless it is fully implemented or explicitly not applicable. Mirrors
 *  scoring.ts, where every answer that is not a full "yes" is pushed as a gap. */
export function isGapStatus(status: ControlStatus): boolean {
  return status === 'partial' || status === 'not_implemented' || status === 'unknown';
}

/** Points earned toward the section total: implemented -> full, partial -> half, else 0. */
function earnedFor(status: ControlStatus, weight: number): number {
  if (status === 'implemented') return weight;
  if (status === 'partial') return weight * 0.5;
  return 0;
}

/** Whether a requirement counts toward the denominator. not_applicable is excluded; every
 *  other status counts, matching scoring.ts (which includes every question in the total). */
function countsTowardTotal(status: ControlStatus): boolean {
  return status !== 'not_applicable';
}

/**
 * Join a requirement catalog with a saved answers map into derived Control rows. Pure: the
 * caller passes the catalog slice it cares about (one section, or all 45). Missing answers
 * resolve to `unknown` (never guessed negative), same as deriveControlsFromAnswers.
 */
export function joinControlsWithRequirements(
  catalog: Requirement[],
  answers: Record<string, AnswerValue> | null | undefined,
): ControlWithRequirement[] {
  const map = answers ?? {};
  return catalog.map((requirement) => {
    const triggeringAnswer = map[requirement.code];
    return { requirement, status: deriveControlStatus(triggeringAnswer), triggeringAnswer };
  });
}

/**
 * Derive per-section + overall scores and the explainable gap set from joined Control rows.
 * Grouping and ordering follow the input order (catalog order when the caller passes the
 * full catalog). Scoring mirrors shared/scoring.ts: per-section weighted percentage, and an
 * overall that applies the 1.5x high-enforcement multiplier to sections 4/5/7.
 */
export function deriveAssessment(rows: ControlWithRequirement[]): DerivedAssessment {
  // Group rows by section, preserving first-seen order (catalog order when the caller passes
  // the full catalog). A plain object keeps the grouping downlevel-iteration-free.
  const order: number[] = [];
  const groups: Record<number, ControlWithRequirement[]> = {};
  for (const row of rows) {
    const section = row.requirement.section;
    if (!groups[section]) {
      groups[section] = [];
      order.push(section);
    }
    groups[section].push(row);
  }

  const sections: DerivedSectionScore[] = [];
  for (const section of order) {
    const group = groups[section];
    let maxPoints = 0;
    let earnedPoints = 0;
    let sectionName = '';
    const gaps: DerivedGap[] = [];
    const criticalGaps: DerivedGap[] = [];

    for (const { requirement, status, triggeringAnswer } of group) {
      sectionName = requirement.sectionName;
      const weight = weightPoints(requirement.weight);
      if (countsTowardTotal(status)) {
        maxPoints += weight;
        earnedPoints += earnedFor(status, weight);
      }
      if (isGapStatus(status)) {
        const gap: DerivedGap = {
          requirementCode: requirement.code,
          citation: requirement.citation,
          title: requirement.title,
          status,
          triggeringAnswer,
          weight: requirement.weight,
          section: requirement.section,
        };
        gaps.push(gap);
        if (requirement.weight === 'critical') criticalGaps.push(gap);
      }
    }

    const score = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;
    sections.push({ section, sectionName, score, maxPoints, earnedPoints, gaps, criticalGaps });
  }

  let totalWeightedPoints = 0;
  let totalMaxPoints = 0;
  for (const s of sections) {
    const multiplier = HIGH_ENFORCEMENT_SECTIONS.includes(s.section) ? HIGH_ENFORCEMENT_MULTIPLIER : 1;
    totalMaxPoints += s.maxPoints * multiplier;
    totalWeightedPoints += s.earnedPoints * multiplier;
  }
  const overall = totalMaxPoints > 0 ? Math.round((totalWeightedPoints / totalMaxPoints) * 100) : 0;

  let riskLevel: 'critical' | 'high' | 'medium' | 'low';
  if (overall < 40) riskLevel = 'critical';
  else if (overall < 60) riskLevel = 'high';
  else if (overall < 80) riskLevel = 'medium';
  else riskLevel = 'low';

  return { overall, riskLevel, sections, gaps: sections.flatMap((s) => s.gaps) };
}

/** Convenience: join a catalog with an answers map and derive the assessment in one call. */
export function deriveAssessmentFromAnswers(
  catalog: Requirement[],
  answers: Record<string, AnswerValue> | null | undefined,
): DerivedAssessment {
  return deriveAssessment(joinControlsWithRequirements(catalog, answers));
}
