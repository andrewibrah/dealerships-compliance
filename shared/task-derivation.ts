// Remediation-task derivation — turn open Controls into a deterministic task list (PRD
// #24 remediation roadmap / #40 task board).
//
// Pure and dependency-free (mirrors shared/derivation.ts / shared/controls.ts): given a
// dealer's Controls, the global Requirement catalog, and the tasks that already exist, it
// emits one suggested Task per OPEN control that is not already tracked. Deterministic and
// grounded — priority comes from the requirement's weight, title/description from the
// requirement + its authored guidance, never from an LLM. The caller (tasks.deriveFromControls
// in both router copies) persists the result via db.createTask + audits each one.

import type { ControlStatus } from './controls.ts';
import { REQUIREMENT_GUIDANCE } from './requirements.ts';

/** Task priority enum, matching drizzle/schema.ts taskPriorityEnum. */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/** The Control fields task derivation needs (a structural subset of the DB Control row). */
export interface DerivableControl {
  id: number;
  requirementId: number;
  status: ControlStatus;
}

/** The Requirement fields task derivation needs (a structural subset of the catalog row). */
export interface DerivableRequirement {
  id: number;
  code: string;
  section: number;
  sectionName: string;
  title: string;
  citation: string;
  /** 'critical' | 'important' | 'standard' — stored as varchar in the DB. */
  weight: string;
}

/** The existing-task fields needed to guarantee idempotency (keyed on controlId). */
export interface ExistingTaskRef {
  controlId: number | null;
}

/** A ready-to-insert task, shaped to db.createTask's input (dealershipId is added by the accessor). */
export interface DerivedTaskInput {
  title: string;
  description: string;
  status: 'open';
  priority: TaskPriority;
  owner: string;
  dueDate: null;
  requirementId: number;
  controlId: number;
}

/** An OPEN control needs remediation: not fully implemented and not explicitly out of scope.
 *  `unknown` (unanswered) and `not_applicable` are deliberately NOT tasks yet — an unanswered
 *  question is not a committed gap, and N/A controls carry no obligation. */
export function isOpenControl(status: ControlStatus): boolean {
  return status === 'not_implemented' || status === 'partial';
}

/** Requirement weight -> task priority. Deterministic, documented mapping:
 *    critical  -> critical   (the FTC's headline elements: MFA, encryption, IRP, QI)
 *    important -> high
 *    standard  -> medium
 *  Anything unrecognized falls back to medium (never silently dropped). */
export function priorityForWeight(weight: string): TaskPriority {
  if (weight === 'critical') return 'critical';
  if (weight === 'important') return 'high';
  return 'medium';
}

/**
 * Derive suggested remediation tasks from a dealer's Controls.
 *
 * Rules:
 *  - Only OPEN controls (not_implemented / partial) become tasks.
 *  - IDEMPOTENT: a control that already has a task referencing its `controlId` is skipped, so
 *    re-running over the same inputs + existing tasks yields []. `controlId` is the dedupe key.
 *  - Output order follows `requirements` order (catalog order when the caller passes the full
 *    catalog), so the result is deterministic regardless of Control row ordering.
 *  - Content is grounded: title from the requirement, description from its authored `fix`
 *    guidance + the §314.4 citation. No generation.
 */
export function deriveTasksFromControls(input: {
  controls: DerivableControl[];
  requirements: DerivableRequirement[];
  existingTasks: ExistingTaskRef[];
}): DerivedTaskInput[] {
  const { controls, requirements, existingTasks } = input;

  // One control per requirement (controls is unique on (dealership, requirement)).
  const controlByRequirementId = new Map<number, DerivableControl>();
  for (const control of controls) controlByRequirementId.set(control.requirementId, control);

  // Controls already represented by a task — the idempotency guard.
  const trackedControlIds = new Set<number>();
  for (const task of existingTasks) {
    if (task.controlId !== null) trackedControlIds.add(task.controlId);
  }

  const derived: DerivedTaskInput[] = [];
  for (const requirement of requirements) {
    const control = controlByRequirementId.get(requirement.id);
    if (!control) continue;
    if (!isOpenControl(control.status)) continue;
    if (trackedControlIds.has(control.id)) continue;

    const fix = REQUIREMENT_GUIDANCE[requirement.code]?.fix ?? '';
    const description = fix
      ? `${fix} (16 CFR ${requirement.citation})`
      : `Remediate this gap to satisfy 16 CFR ${requirement.citation}.`;

    derived.push({
      title: `Close gap: ${requirement.sectionName} — ${requirement.title}`,
      description,
      status: 'open',
      priority: priorityForWeight(requirement.weight),
      owner: '',
      dueDate: null,
      requirementId: requirement.id,
      controlId: control.id,
    });
  }

  return derived;
}
