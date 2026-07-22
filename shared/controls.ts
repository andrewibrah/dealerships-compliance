// Control status mapping — the dealer's implemented state for a Requirement
// (PRD #3, entity 2 of 9).
//
// Pure and dependency-free (mirrors shared/audit.ts): the deterministic bridge from a
// saved questionnaire answer to a Control status. This BEGINS the migration from the
// answers JSONB toward first-class Control rows WITHOUT cutting scoring over — pass/fail
// scoring still runs off shared/scoring.ts. Answer encoding mirrors the Wizard and
// scoring.ts exactly: yes_no -> "yes" | "no"; yes_no_partial -> "yes" | "partial" | "no".

import type { Requirement } from './requirements';

export type ControlStatus =
  | 'implemented'
  | 'partial'
  | 'not_implemented'
  | 'not_applicable'
  | 'unknown';

/** A single saved answer value, as stored in compliance_answers.answers. */
export type AnswerValue = string | number | boolean | null | undefined;

/** One requirement's derived state, keyed by the stable requirement code. */
export interface DerivedControl {
  requirementCode: string;
  status: ControlStatus;
}

/**
 * Map one saved questionnaire answer to a Control status. Total and deterministic:
 * anything that is not a recognized yes/partial/no signal (empty string, free text,
 * null, undefined) is `unknown` — an unanswered question is never guessed as a negative.
 * Numeric/boolean forms mirror scoring.ts's tolerance (true/1 -> implemented, 0.5 ->
 * partial, false/0 -> not_implemented).
 */
export function deriveControlStatus(value: AnswerValue): ControlStatus {
  if (value === 'yes' || value === true || value === 1) return 'implemented';
  if (value === 'partial' || value === 0.5) return 'partial';
  if (value === 'no' || value === false || value === 0) return 'not_implemented';
  return 'unknown';
}

/**
 * Derive a Control status for each requirement in `catalog` from a saved answers map
 * (question id -> value). Missing answers resolve to `unknown`. Pure: the caller decides
 * which catalog slice to pass (one section's requirements + that section's answers, or
 * the full 45 against a merged answer map).
 */
export function deriveControlsFromAnswers(
  sectionAnswers: Record<string, AnswerValue> | null | undefined,
  catalog: Requirement[],
): DerivedControl[] {
  const answers = sectionAnswers ?? {};
  return catalog.map((requirement) => ({
    requirementCode: requirement.code,
    status: deriveControlStatus(answers[requirement.code]),
  }));
}
