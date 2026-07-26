// Continuous posture tracking — the pure, runtime-neutral core (PRD #33).
//
// Pure and dependency-light (mirrors shared/derivation.ts / shared/task-derivation.ts):
// imported by both the Node (Express) and Deno (Edge) runtimes so the posture a snapshot
// records is computed identically by construction. No LLM, no DB, no network. The server
// save path (saveSection/saveAnswer in both router copies) calls computePosture after the
// answers write, then shouldRecordPosture decides whether to append a history row.
//
// Determinism: overall score, risk band, and per-section scores are ALL data-derived by the
// same applicability-aware derivation the Dashboard runs (shared/derivation.ts), so a
// recorded snapshot equals what the dealer sees on screen at that moment.

import type { Requirement } from './requirements.ts';
import { deriveAssessmentFromAnswers } from './derivation.ts';
import { getApplicability, applicableRequirements } from './applicability.ts';
import type { AnswerValue } from './controls.ts';
import type { ApplicabilityProfile } from './applicability.ts';

/** A point-in-time posture, shaped to the posture_snapshots columns (dealership_id + created_at
 *  are added by the accessor). section_scores maps section number -> 0-100 score. */
export interface PostureComputation {
  overallScore: number;
  riskLevel: string;
  sectionScores: Record<number, number>;
}

/**
 * Compute the dealer's current posture the SAME way the Dashboard does: an applicability-aware
 * derivation over the global requirement catalog. Out-of-scope requirements (the §314.6(a)
 * exemption) leave the denominator and fully-exempt sections drop out — identical to the
 * Dashboard when the profile is not exempt (the default), so the recorded overall matches the
 * on-screen overall. Pure: the catalog + answers + profile are all parameters.
 */
export function computePosture(
  catalog: Requirement[],
  answers: Record<string, AnswerValue>,
  profile: ApplicabilityProfile,
): PostureComputation {
  const applicability = getApplicability(profile, catalog);
  const assessment = deriveAssessmentFromAnswers(
    applicableRequirements(catalog, applicability),
    answers,
  );
  const sectionScores: Record<number, number> = {};
  for (const section of assessment.sections) sectionScores[section.section] = section.score;
  return {
    overallScore: assessment.overall,
    riskLevel: assessment.riskLevel,
    sectionScores,
  };
}

/**
 * Snapshot dedup rule (PRD #33). A new snapshot is written ONLY when the OVERALL score changed
 * vs the most recent snapshot. saveSection fires once per answered question, so keying the
 * history on overall-score transitions bounds the table to one row per distinct overall value
 * and keeps the trend signal (overall over time) intact. A section-internal reshuffle that
 * leaves the overall unchanged is intentionally NOT recorded. The first-ever snapshot (no prior)
 * always writes, so a dealer always has a baseline point.
 */
export function shouldRecordPosture(
  previousOverall: number | null | undefined,
  nextOverall: number,
): boolean {
  return previousOverall == null || previousOverall !== nextOverall;
}
