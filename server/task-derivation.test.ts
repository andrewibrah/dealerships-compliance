import { describe, it, expect } from 'vitest';
import {
  deriveTasksFromControls,
  isOpenControl,
  priorityForWeight,
  type DerivableControl,
  type DerivableRequirement,
} from '@shared/task-derivation';
import type { ControlStatus } from '@shared/controls';

// Minimal catalog stand-ins — structural subsets of the real Requirement/Control rows.
const REQUIREMENTS: DerivableRequirement[] = [
  { id: 1, code: 'q4_1', section: 4, sectionName: 'Access Controls', title: 'Enforce MFA', citation: '§314.4(c)(5)', weight: 'critical' },
  { id: 2, code: 'q6_2', section: 6, sectionName: 'Vendor Management', title: 'Assess vendors', citation: '§314.4(f)(3)', weight: 'important' },
  { id: 3, code: 'q3_5', section: 3, sectionName: 'Data Inventory', title: 'Refresh inventory', citation: '§314.4(c)(2)', weight: 'standard' },
];

function control(id: number, requirementId: number, status: ControlStatus): DerivableControl {
  return { id, requirementId, status };
}

describe('isOpenControl', () => {
  it('treats only not_implemented / partial as open (a committed gap)', () => {
    expect(isOpenControl('not_implemented')).toBe(true);
    expect(isOpenControl('partial')).toBe(true);
  });

  it('does NOT treat implemented / not_applicable / unknown as open', () => {
    expect(isOpenControl('implemented')).toBe(false);
    expect(isOpenControl('not_applicable')).toBe(false);
    expect(isOpenControl('unknown')).toBe(false);
  });
});

describe('priorityForWeight', () => {
  it('maps weight -> priority deterministically', () => {
    expect(priorityForWeight('critical')).toBe('critical');
    expect(priorityForWeight('important')).toBe('high');
    expect(priorityForWeight('standard')).toBe('medium');
  });

  it('falls back to medium for any unrecognized weight', () => {
    expect(priorityForWeight('bogus')).toBe('medium');
    expect(priorityForWeight('')).toBe('medium');
  });
});

describe('deriveTasksFromControls', () => {
  it('emits one task per open control, skipping implemented / na / unknown', () => {
    const controls = [
      control(10, 1, 'not_implemented'), // open -> task
      control(11, 2, 'partial'), // open -> task
      control(12, 3, 'implemented'), // closed -> no task
    ];
    const tasks = deriveTasksFromControls({ controls, requirements: REQUIREMENTS, existingTasks: [] });
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.controlId)).toEqual([10, 11]);
  });

  it('ignores unknown and not_applicable controls (not committed gaps)', () => {
    const controls = [
      control(10, 1, 'unknown'),
      control(11, 2, 'not_applicable'),
    ];
    expect(deriveTasksFromControls({ controls, requirements: REQUIREMENTS, existingTasks: [] })).toEqual([]);
  });

  it('maps requirement weight onto task priority', () => {
    const controls = [
      control(10, 1, 'not_implemented'), // critical
      control(11, 2, 'not_implemented'), // important -> high
      control(12, 3, 'partial'), // standard -> medium
    ];
    const byControl = new Map(
      deriveTasksFromControls({ controls, requirements: REQUIREMENTS, existingTasks: [] }).map((t) => [t.controlId, t]),
    );
    expect(byControl.get(10)?.priority).toBe('critical');
    expect(byControl.get(11)?.priority).toBe('high');
    expect(byControl.get(12)?.priority).toBe('medium');
  });

  it('grounds title + description in the requirement + its §314.4 citation, status open, owner empty', () => {
    const tasks = deriveTasksFromControls({
      controls: [control(10, 1, 'not_implemented')],
      requirements: REQUIREMENTS,
      existingTasks: [],
    });
    const task = tasks[0];
    expect(task.title).toBe('Close gap: Access Controls — Enforce MFA');
    expect(task.description).toContain('16 CFR §314.4(c)(5)');
    expect(task.status).toBe('open');
    expect(task.owner).toBe('');
    expect(task.dueDate).toBeNull();
    expect(task.requirementId).toBe(1);
  });

  it('is deterministic in catalog order regardless of control input order', () => {
    const controls = [
      control(12, 3, 'partial'),
      control(10, 1, 'not_implemented'),
      control(11, 2, 'partial'),
    ];
    const tasks = deriveTasksFromControls({ controls, requirements: REQUIREMENTS, existingTasks: [] });
    // requirements are passed in id order 1,2,3 -> output follows that, not [12,10,11].
    expect(tasks.map((t) => t.controlId)).toEqual([10, 11, 12]);
  });

  it('is IDEMPOTENT: a control that already has a task is not re-derived (keyed on controlId)', () => {
    const controls = [
      control(10, 1, 'not_implemented'),
      control(11, 2, 'partial'),
    ];
    const firstRun = deriveTasksFromControls({ controls, requirements: REQUIREMENTS, existingTasks: [] });
    expect(firstRun).toHaveLength(2);

    // Feed the derived tasks back as existing -> second run yields nothing new.
    const existingTasks = firstRun.map((t) => ({ controlId: t.controlId }));
    const secondRun = deriveTasksFromControls({ controls, requirements: REQUIREMENTS, existingTasks });
    expect(secondRun).toEqual([]);
  });

  it('only derives the newly-open control on re-run, leaving tracked ones alone', () => {
    const controls = [
      control(10, 1, 'not_implemented'),
      control(11, 2, 'partial'),
    ];
    const existingTasks = [{ controlId: 10 }]; // control 10 already tracked
    const tasks = deriveTasksFromControls({ controls, requirements: REQUIREMENTS, existingTasks });
    expect(tasks.map((t) => t.controlId)).toEqual([11]);
  });
});
