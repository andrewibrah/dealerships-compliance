// Requirement catalog — the FTC Safeguards Rule as data (PRD #3, entity 1 of 9).
//
// GLOBAL and tenant-neutral: one shared, versioned catalog that is identical for every
// dealer. Derived PURELY from SAFEGUARDS_SECTIONS so the questionnaire and the
// requirement rows can never drift — one requirement per question (9 sections x 5 = 45).
// Pure and dependency-free (mirrors shared/audit.ts / shared/tenant-guard.ts): imported
// by both runtimes and used to author the 0005 migration seed, which must match this
// EXACTLY (assert-tested in server/requirements.test.ts).
//
// The §314.4 citation here is SECTION-LEVEL (coarse): every requirement in a section
// shares its section's element. Per-requirement citation refinement is the NEXT task
// (#5); until then this deliberately stays at the element granularity.

import { SAFEGUARDS_SECTIONS } from './safeguards-questions';

export type RequirementWeight = 'critical' | 'important' | 'standard';

export interface Requirement {
  /** Stable business key = the questionnaire question id (e.g. "q1_1"). */
  code: string;
  section: number;
  sectionName: string;
  /** The question text. */
  title: string;
  /** §314.4 element, section-level (see CITATION_BY_SECTION). */
  citation: string;
  weight: RequirementWeight;
  /** Reserved for applicability scoping (#7); intentionally empty today. */
  applicability: Record<string, unknown>;
  version: number;
}

/** Section number -> the §314.4 element it maps to. Section-level (coarse) by design;
 *  per-requirement refinement is task #5. */
export const CITATION_BY_SECTION: Record<number, string> = {
  1: '§314.4(a)', // Qualified Individual
  2: '§314.4(b)', // Risk Assessment
  3: '§314.4(c)(2)', // Data Inventory & Classification
  4: '§314.4(c)(1)', // Access Controls
  5: '§314.4(c)(3)', // Encryption
  6: '§314.4(f)', // Vendor & Third-Party Management
  7: '§314.4(h)', // Incident Response Plan
  8: '§314.4(e)', // Employee Training
  9: '§314.4(d)', // Penetration Testing & Monitoring
};

/** Current catalog version. Bump when the questionnaire-derived catalog changes shape. */
export const REQUIREMENT_CATALOG_VERSION = 1;

/** The 45-row requirement catalog, derived from the questionnaire (source of truth). */
export const REQUIREMENT_CATALOG: Requirement[] = SAFEGUARDS_SECTIONS.flatMap((section) =>
  section.questions.map((question) => ({
    code: question.id,
    section: section.number,
    sectionName: section.name,
    title: question.text,
    citation: CITATION_BY_SECTION[section.number] ?? '',
    weight: question.weight,
    applicability: {},
    version: REQUIREMENT_CATALOG_VERSION,
  })),
);
