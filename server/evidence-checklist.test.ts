import { describe, it, expect } from 'vitest';
import {
  deriveEvidenceChecklist,
  requestedEvidenceFor,
  type EvidenceRequestControl,
  type EvidenceRequestRequirement,
} from '@shared/evidence-checklist';
import { REQUIREMENT_GUIDANCE } from '@shared/requirements';
import type { ControlStatus } from '@shared/controls';

// Minimal catalog stand-ins — structural subsets of the real Requirement/Control rows. Codes are
// real so the grounded requested-evidence text can be checked against REQUIREMENT_GUIDANCE.
const REQUIREMENTS: EvidenceRequestRequirement[] = [
  { id: 1, code: 'q4_1', section: 4, sectionName: 'Access Controls', title: 'Enforce MFA', citation: '§314.4(c)(5)' },
  { id: 2, code: 'q6_2', section: 6, sectionName: 'Vendor Management', title: 'Assess vendors', citation: '§314.4(f)(3)' },
  { id: 3, code: 'q3_5', section: 3, sectionName: 'Data Inventory', title: 'Refresh inventory', citation: '§314.4(c)(2)' },
];

function control(id: number, requirementId: number, status: ControlStatus): EvidenceRequestControl {
  return { id, requirementId, status };
}

describe('requestedEvidenceFor', () => {
  it('grounds the ask in the citation + authored fix guidance', () => {
    const out = requestedEvidenceFor('§314.4(c)(5)', 'Enforce MFA everywhere.');
    expect(out).toContain('Enforce MFA everywhere.');
    expect(out).toContain('16 CFR §314.4(c)(5)');
  });

  it('falls back to a citation-only ask when there is no fix guidance', () => {
    expect(requestedEvidenceFor('§314.4(a)', '')).toBe(
      'Provide an artifact demonstrating compliance with 16 CFR §314.4(a).',
    );
  });
});

describe('deriveEvidenceChecklist', () => {
  it('emits one request per open control, skipping implemented / na / unknown', () => {
    const controls = [
      control(10, 1, 'not_implemented'), // open -> request
      control(11, 2, 'partial'), // open -> request
      control(12, 3, 'implemented'), // closed -> none
    ];
    const requests = deriveEvidenceChecklist({ controls, requirements: REQUIREMENTS });
    expect(requests).toHaveLength(2);
    expect(requests.map((r) => r.controlId)).toEqual([10, 11]);
  });

  it('ignores unknown and not_applicable controls (not committed gaps)', () => {
    const controls = [
      control(10, 1, 'unknown'),
      control(11, 2, 'not_applicable'),
    ];
    expect(deriveEvidenceChecklist({ controls, requirements: REQUIREMENTS })).toEqual([]);
  });

  it('carries the §314.4 citation + a grounded evidence ask from REQUIREMENT_GUIDANCE', () => {
    const requests = deriveEvidenceChecklist({
      controls: [control(10, 1, 'not_implemented')],
      requirements: REQUIREMENTS,
    });
    const request = requests[0];
    expect(request.citation).toBe('§314.4(c)(5)');
    expect(request.requirementCode).toBe('q4_1');
    expect(request.section).toBe(4);
    // The ask reuses the authored fix guidance for this exact requirement — no generation.
    expect(request.requestedEvidence).toContain(REQUIREMENT_GUIDANCE['q4_1'].fix);
    expect(request.requestedEvidence).toContain('16 CFR §314.4(c)(5)');
  });

  it('is applicability-aware by construction: a filtered catalog drops those requests', () => {
    const controls = [
      control(10, 1, 'not_implemented'),
      control(11, 2, 'partial'),
    ];
    // Caller passes only the in-scope requirements (e.g. §314.6 exemption removed req 2).
    const inScope = REQUIREMENTS.filter((r) => r.id !== 2);
    const requests = deriveEvidenceChecklist({ controls, requirements: inScope });
    expect(requests.map((r) => r.controlId)).toEqual([10]);
  });

  it('is deterministic in catalog order regardless of control input order', () => {
    const controls = [
      control(12, 3, 'partial'),
      control(10, 1, 'not_implemented'),
      control(11, 2, 'partial'),
    ];
    const requests = deriveEvidenceChecklist({ controls, requirements: REQUIREMENTS });
    expect(requests.map((r) => r.controlId)).toEqual([10, 11, 12]);
  });

  it('has an idempotent shape: same inputs always yield the same list (a pure live view)', () => {
    const controls = [control(10, 1, 'not_implemented'), control(11, 2, 'partial')];
    const first = deriveEvidenceChecklist({ controls, requirements: REQUIREMENTS });
    const second = deriveEvidenceChecklist({ controls, requirements: REQUIREMENTS });
    expect(second).toEqual(first);
  });
});
