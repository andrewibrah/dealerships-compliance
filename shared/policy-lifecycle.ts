// Policy approval lifecycle — the deterministic state machine (PRD #26/#41).
//
// Pure and dependency-free (mirrors shared/tenant-guard.ts / shared/evidence-storage.ts): no LLM,
// no DB, no network. The single home for the policy status lifecycle, so the server (both runtimes)
// and the client render and ENFORCE the same allowed transitions, version-bump rule, and
// set-once adoptedAt semantics. The DB write itself lives in each runtime's db.updatePolicy; this
// module decides WHICH fields a given transition changes and refuses an invalid one.

export type PolicyStatus = 'draft' | 'in_review' | 'approved' | 'adopted' | 'archived';

export const POLICY_STATUSES: readonly PolicyStatus[] = [
  'draft',
  'in_review',
  'approved',
  'adopted',
  'archived',
];

/** Human labels for the UI, kept here so the client and any generated copy agree on wording. */
export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  adopted: 'Adopted',
  archived: 'Archived',
};

/**
 * The allowed transitions. Read as "from -> the states it may move to":
 *   draft      -> in_review | archived
 *   in_review  -> approved | draft (kick back) | archived
 *   approved   -> adopted | in_review (revise) | draft (revise) | archived
 *   adopted    -> (terminal: immutable — no transitions)
 *   archived   -> (terminal)
 *
 * `adopted` is terminal, so its content and `adoptedAt` can never be mutated by a later
 * transition, and the state is unreachable a second time — the set-once adoptedAt guarantee falls
 * straight out of the graph. A superseding version is a NEW policy row (outside this transition),
 * never a mutation of the adopted one. Archiving is reachable from every non-adopted state, matching
 * the requirement that an adopted policy cannot be archived.
 */
const ALLOWED_TRANSITIONS: Record<PolicyStatus, readonly PolicyStatus[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['approved', 'draft', 'archived'],
  approved: ['adopted', 'in_review', 'draft', 'archived'],
  adopted: [],
  archived: [],
};

/** The states a policy in `from` may legally move to next (for rendering lifecycle actions). */
export function nextStatuses(from: PolicyStatus): PolicyStatus[] {
  return [...(ALLOWED_TRANSITIONS[from] ?? [])];
}

export function canTransition(from: PolicyStatus, to: PolicyStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Version-bump rule: increment the version when an already-approved policy is sent back to an
 * editable state (approved -> draft or approved -> in_review), because that starts the next
 * revision of a previously-approved document. Every other transition — including approval and
 * adoption — keeps the version, so the version you approve is the version you adopt. Stateless:
 * depends only on the two endpoints.
 */
export function bumpsVersion(from: PolicyStatus, to: PolicyStatus): boolean {
  return from === 'approved' && (to === 'draft' || to === 'in_review');
}

export interface PolicyTransitionState {
  status: PolicyStatus;
  version: number;
  adoptedAt: Date | string | null;
}

/**
 * The exact column changes a transition writes. `adoptedAt` is present ONLY on the transition into
 * `adopted`, so db.updatePolicy never touches an already-set adoptedAt — set-once by construction.
 */
export interface PolicyTransitionChanges {
  status: PolicyStatus;
  version: number;
  adoptedAt?: Date;
}

/**
 * Validate a transition and compute the field changes it writes. Throws a clear Error for a
 * disallowed transition (identical message in both runtimes). `now` is injected so the function
 * stays pure/deterministic under test; the router passes `new Date()`.
 */
export function computePolicyTransition(
  current: PolicyTransitionState,
  to: PolicyStatus,
  now: Date,
): PolicyTransitionChanges {
  if (!canTransition(current.status, to)) {
    throw new Error(`Invalid policy transition: ${current.status} -> ${to} is not allowed.`);
  }
  const changes: PolicyTransitionChanges = {
    status: to,
    version: current.version + (bumpsVersion(current.status, to) ? 1 : 0),
  };
  // Set-once: only stamp adoptedAt when newly adopting AND it is not already set. `adopted` is a
  // terminal state, so current.adoptedAt is always null here in practice; the guard is
  // defense-in-depth so an adoptedAt can never be overwritten.
  if (to === 'adopted' && current.adoptedAt == null) {
    changes.adoptedAt = now;
  }
  return changes;
}
