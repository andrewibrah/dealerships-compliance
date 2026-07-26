// Applicability engine — the §314.6(a) small-institution exemption as pure data (PRD #7).
//
// 16 CFR §314.6(a): "Sections 314.4(b)(1), (d)(2), (h), and (i) do not apply to financial
// institutions that maintain customer information concerning fewer than five thousand
// consumers." This module decides, PURELY from a requirement's §314.4 citation and the
// dealer's declared consumer count, which requirements fall out of scope — WITHOUT
// re-seeding the catalog or mutating Requirement.applicability. Deterministic and
// dependency-light (mirrors shared/scoring.ts / shared/derivation.ts): no LLM, no DB, no
// network. Never decides an answer, a status, a score, or a citation.
//
// SAFE DEFAULT (opt-in): the exemption triggers ONLY when consumerCount is explicitly set
// AND below the threshold. Unset/null or >= 5,000 -> nothing is exempt -> the in-scope set
// is the full catalog -> byte-identical scores and gaps to today.

import { REQUIREMENT_CATALOG, type Requirement } from './requirements.ts';

/** The dealer profile fields that drive applicability. Minimal + structural so any caller
 *  (a dealership row, a PDF input) satisfies it without importing the DB row type. */
export interface ApplicabilityProfile {
  consumerCount?: number | null;
}

/** §314.6(a) exemption ceiling: the Rule exempts institutions with FEWER than 5,000 consumers. */
export const EXEMPTION_CONSUMER_THRESHOLD = 5000;

export interface Applicability {
  /** True IFF consumerCount is explicitly a finite number below the threshold (§314.6(a)). */
  isExemptUnder5000: boolean;
  /** Requirement codes that are OUT of scope for this profile (empty unless exempt). */
  exemptCodes: Set<string>;
  /** Predicate: does this requirement code apply? (Always true unless exempt-out.) */
  isApplicable: (code: string) => boolean;
}

/**
 * Whether a §314.4 citation falls under one of the four subsections §314.6(a) exempts:
 * (b)(1), (d)(2), (h) [the whole element — bare (h) and every (h)(x)], and (i). PRECISE:
 * the general (b) and (d) elements are NOT exempt — only (b)(1) and (d)(2) are. Grounded
 * directly in the Rule text; never inferred by an LLM.
 */
export function isCitationExemptUnder5000(citation: string): boolean {
  return (
    citation === '§314.4(b)(1)' ||
    citation === '§314.4(d)(2)' ||
    citation === '§314.4(i)' ||
    citation === '§314.4(h)' ||
    citation.startsWith('§314.4(h)(')
  );
}

/** Whether the profile qualifies for the §314.6(a) small-institution exemption. Opt-in: a
 *  null/undefined/NaN or >= 5,000 count never exempts anything. */
export function isExemptUnder5000(profile: ApplicabilityProfile): boolean {
  const count = profile.consumerCount;
  return (
    typeof count === 'number' &&
    Number.isFinite(count) &&
    count < EXEMPTION_CONSUMER_THRESHOLD
  );
}

/**
 * Resolve which requirements apply to a profile. Pure: derives the exempt code set from each
 * requirement's citation (never from Requirement.applicability, never from the DB). When the
 * profile is not exempt the exempt set is empty and isApplicable is always true — identical
 * to today's every-question-counts behavior. The catalog is a parameter (defaulting to the
 * global one) so it stays trivially unit-testable.
 */
export function getApplicability(
  profile: ApplicabilityProfile,
  catalog: Requirement[] = REQUIREMENT_CATALOG,
): Applicability {
  const exempt = isExemptUnder5000(profile);
  const exemptCodes = new Set<string>();
  if (exempt) {
    for (const requirement of catalog) {
      if (isCitationExemptUnder5000(requirement.citation)) exemptCodes.add(requirement.code);
    }
  }
  return {
    isExemptUnder5000: exempt,
    exemptCodes,
    isApplicable: (code: string) => !exemptCodes.has(code),
  };
}

/** Filter a requirement catalog (or any {code} list) to the in-scope subset for a profile. */
export function applicableRequirements<T extends { code: string }>(
  catalog: T[],
  applicability: Applicability,
): T[] {
  return catalog.filter((item) => applicability.isApplicable(item.code));
}

/** Filter a section's questions (or any {id} list) to the in-scope subset for a profile.
 *  Question ids ARE requirement codes (the catalog is derived from the questionnaire). */
export function applicableQuestions<T extends { id: string }>(
  questions: T[],
  applicability: Applicability,
): T[] {
  return questions.filter((item) => applicability.isApplicable(item.id));
}
