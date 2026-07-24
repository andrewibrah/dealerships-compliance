// Evidence-request checklist derivation (PRD #25).
//
// Pure and dependency-free (mirrors shared/task-derivation.ts): given a dealer's Controls and the
// Requirement catalog, it emits one evidence request per OPEN control — the artifacts an examiner
// would expect to substantiate each unmet Safeguards obligation. Deterministic and grounded: the
// requested-evidence text is built from the requirement's authored `fix` guidance
// (REQUIREMENT_GUIDANCE) + its §314.4 citation, never from an LLM.
//
// Applicability-aware by construction: the caller passes the requirement catalog already filtered
// to the in-scope set (see shared/applicability.ts), exactly as the Dashboard does, so §314.6
// small-institution exemptions drop out of the checklist automatically. "Open" reuses
// task-derivation's isOpenControl so a gap that becomes a remediation task is the same gap that
// needs evidence — the two views can never disagree.

import type { ControlStatus } from './controls.ts';
import { REQUIREMENT_GUIDANCE } from './requirements.ts';
import { isOpenControl } from './task-derivation.ts';

/** The Control fields the checklist needs — a structural subset of the DB Control row. `id` is
 *  load-bearing: it is the controlId the UI links evidence to (evidence.linkControl). */
export interface EvidenceRequestControl {
  id: number;
  requirementId: number;
  status: ControlStatus;
}

/** The Requirement fields the checklist needs — a structural subset of the catalog row. */
export interface EvidenceRequestRequirement {
  id: number;
  code: string;
  section: number;
  sectionName: string;
  title: string;
  citation: string;
}

/** One evidence request: the open control, its §314.4 citation, and the artifact to provide. */
export interface EvidenceRequest {
  controlId: number;
  requirementId: number;
  requirementCode: string;
  section: number;
  sectionName: string;
  title: string;
  citation: string;
  status: ControlStatus;
  /** What artifact would substantiate this control — grounded in authored guidance, not generated. */
  requestedEvidence: string;
}

/** The evidence ask for one open control, grounded in its §314.4 citation + authored fix guidance. */
export function requestedEvidenceFor(citation: string, fix: string): string {
  return fix
    ? `Provide an artifact that substantiates this control: ${fix} (16 CFR ${citation})`
    : `Provide an artifact demonstrating compliance with 16 CFR ${citation}.`;
}

/**
 * Derive the evidence-request checklist from a dealer's Controls.
 *
 * Rules:
 *  - Only OPEN controls (not_implemented / partial) produce a request; implemented / unknown /
 *    not_applicable controls carry no ask (an unanswered question is not yet a committed gap).
 *  - Output order follows `requirements` order (catalog order when the caller passes the full,
 *    applicability-filtered catalog), so the result is deterministic regardless of Control order.
 *  - Idempotent shape: pure over its inputs — same inputs always yield the same list. This is a
 *    live view (no persistence), so there is no dedupe key; re-deriving simply reflects current state.
 */
export function deriveEvidenceChecklist(input: {
  controls: EvidenceRequestControl[];
  requirements: EvidenceRequestRequirement[];
}): EvidenceRequest[] {
  const { controls, requirements } = input;

  // One control per requirement (controls is unique on (dealership, requirement)).
  const controlByRequirementId = new Map<number, EvidenceRequestControl>();
  for (const control of controls) controlByRequirementId.set(control.requirementId, control);

  const requests: EvidenceRequest[] = [];
  for (const requirement of requirements) {
    const control = controlByRequirementId.get(requirement.id);
    if (!control) continue;
    if (!isOpenControl(control.status)) continue;

    const fix = REQUIREMENT_GUIDANCE[requirement.code]?.fix ?? '';
    requests.push({
      controlId: control.id,
      requirementId: requirement.id,
      requirementCode: requirement.code,
      section: requirement.section,
      sectionName: requirement.sectionName,
      title: requirement.title,
      citation: requirement.citation,
      status: control.status,
      requestedEvidence: requestedEvidenceFor(requirement.citation, fix),
    });
  }

  return requests;
}
