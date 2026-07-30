// End-to-end check of the remediation plan over the REAL 45-requirement catalog.
//
// The unit tests prove each piece; this proves the pipeline a dealer actually walks:
//   saved answers -> deriveAssessmentFromAnswers -> gaps -> coordination -> 30/60/90 horizons
// It is the "critical user journey" for the planning surface, exercised against real data
// rather than stand-ins, so a catalog change that silently empties the 30-day plan fails here.

import { describe, it, expect } from 'vitest';
import { deriveAssessmentFromAnswers } from '@shared/derivation';
import { REQUIREMENT_CATALOG } from '@shared/requirements';
import { OWNER_LABEL, getCoordination, horizonFor } from '@shared/coordination';
import {
  deriveTasksFromControls,
  priorityForWeight,
  type DerivableControl,
  type DerivableRequirement,
} from '@shared/task-derivation';
import type { AnswerValue } from '@shared/controls';

/** A realistic mid-maturity dealership: some controls in place, some partial, some absent,
 *  and a few questions never answered (which must stay `unknown`, never a failure). */
function realisticAnswers(): Record<string, AnswerValue> {
  const answers: Record<string, AnswerValue> = {};
  REQUIREMENT_CATALOG.forEach((requirement, index) => {
    if (index % 7 === 0) return; // left unanswered
    answers[requirement.code] = index % 3 === 0 ? 'yes' : index % 3 === 1 ? 'partial' : 'no';
  });
  return answers;
}

/** The Dashboard's 30-day computation, mirrored exactly. */
function plan(answers: Record<string, AnswerValue>) {
  const assessment = deriveAssessmentFromAnswers(REQUIREMENT_CATALOG, answers);
  return assessment.gaps
    .filter((gap) => gap.status !== 'unknown')
    .map((gap) => ({ gap, coordination: getCoordination(gap.requirementCode) }))
    .map((entry) => ({
      ...entry,
      horizon: horizonFor(priorityForWeight(entry.gap.weight), entry.coordination.effort),
    }));
}

describe('remediation plan over the real catalog', () => {
  const answers = realisticAnswers();

  it('produces a non-empty, fully-sequenced plan for a realistic dealership', () => {
    const sequenced = plan(answers);
    expect(sequenced.length).toBeGreaterThan(0);
    for (const entry of sequenced) {
      expect([30, 60, 90]).toContain(entry.horizon);
    }
  });

  it('puts real work in the next 30 days without dumping the whole gap list there', () => {
    const sequenced = plan(answers);
    const next30 = sequenced.filter((e) => e.horizon === 30);
    expect(next30.length).toBeGreaterThan(0);
    // The entire point is triage: 30 days must be a strict subset, not everything.
    expect(next30.length).toBeLessThan(sequenced.length);
  });

  it('never plans an unanswered question — unknown is not a committed gap', () => {
    const sequenced = plan(answers);
    const planned = new Set(sequenced.map((e) => e.gap.requirementCode));
    for (const requirement of REQUIREMENT_CATALOG) {
      if (answers[requirement.code] === undefined) {
        expect(planned.has(requirement.code), `${requirement.code} was unanswered`).toBe(false);
      }
    }
  });

  it('gives every planned item an owner, a proof artifact, and a consequence', () => {
    for (const { gap, coordination } of plan(answers)) {
      expect(OWNER_LABEL[coordination.owner], gap.requirementCode).toMatch(/\S/);
      expect(coordination.proof, gap.requirementCode).toMatch(/\S/);
      expect(coordination.consequence, gap.requirementCode).toMatch(/\S/);
    }
  });

  it('plans nothing when every control is confirmed in place', () => {
    const allYes = Object.fromEntries(REQUIREMENT_CATALOG.map((r) => [r.code, 'yes']));
    expect(plan(allYes)).toEqual([]);
  });

  it('derives a task for every planned gap, each with a named accountable role', () => {
    // Mirror the server: catalog rows become Requirements, gaps become open Controls.
    const requirements: DerivableRequirement[] = REQUIREMENT_CATALOG.map((r, i) => ({
      id: i + 1,
      code: r.code,
      section: r.section,
      sectionName: r.sectionName,
      title: r.title,
      citation: r.citation,
      weight: r.weight,
    }));
    const codeToId = new Map(requirements.map((r) => [r.code, r.id]));
    const sequenced = plan(answers);
    const controls: DerivableControl[] = sequenced.map((entry, i) => ({
      id: 1000 + i,
      requirementId: codeToId.get(entry.gap.requirementCode)!,
      status: entry.gap.status === 'partial' ? 'partial' : 'not_implemented',
    }));

    const tasks = deriveTasksFromControls({ controls, requirements, existingTasks: [] });
    expect(tasks).toHaveLength(sequenced.length);
    for (const task of tasks) {
      expect(task.owner.length, task.title).toBeGreaterThan(0);
      expect(task.description).toContain('Proof of completion:');
      expect(task.description).toContain('If this slips:');
    }

    // Re-running over the tasks just created must be a no-op (the board never duplicates).
    const rerun = deriveTasksFromControls({
      controls,
      requirements,
      existingTasks: tasks.map((t) => ({ controlId: t.controlId })),
    });
    expect(rerun).toEqual([]);
  });
});
